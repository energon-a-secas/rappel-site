/**
 * Boot: read the URL, decide where the ledger lives, resolve a deck, render.
 *
 * The order matters. The storage probe runs before anything is written and
 * before rappel:ready is posted, because a host has to be told
 * ledger: "ephemeral" rather than discovering later that nothing was saved
 * (C6.5, and the Safari partitioning question the design does not pretend to
 * have settled).
 */

import { state, loadAll, loadSession } from './state.js';
import { readConfig, decodeInlineDeck, mountEmbedBar, setEmbedTitle, startBridge, emitReady, emitError, emitResize } from './embed.js';
import { isAllowedDeckSrc } from './origin.js';
import { acceptDeck, fetchJson, loadBuiltinCatalog, loadBuiltin } from './deck-load.js';
import { deckName } from './deck.js';
import { probe } from './ledger-log.js';
import { storageAvailable } from './neorgon-persist.js';
import { render } from './render.js';
import { bindEvents } from './events.js';
import { initKeys } from './keys.js';
import { resumeSession, startSession } from './session.js';
import { initAccount } from './account.js';
import { showToast } from './utils.js';

/**
 * Exactly one of deck, src or #d= is expected. Zero is an error in embed mode.
 * More than one takes them in that order and names the ignored ones.
 */
async function resolveDeck(cfg) {
  const given = ['deck', 'src', 'inline'].filter((k) => cfg[k]);
  if (given.length > 1) {
    console.warn(`Rappel: ${given.slice(1).join(' and ')} ignored, ${given[0]} wins.`);
  }
  if (given.length === 0) {
    if (cfg.embed) emitError('no-deck', 'Pass one of ?deck=, ?src= or #d= to this frame.');
    return null;
  }

  if (cfg.deck) return loadBuiltin(cfg.deck);

  if (cfg.src) {
    if (!isAllowedDeckSrc(cfg.src, location.origin)) {
      emitError('deck-fetch-failed', 'A ?src= deck must be an https URL.');
      showToast('A ?src= deck must be an https URL');
      return null;
    }
    try {
      return await acceptDeck(await fetchJson(cfg.src), cfg.src);
    } catch (e) {
      emitError('deck-fetch-failed', `Could not fetch that deck: ${e.message}`);
      showToast('Could not fetch that deck. It may be a CORS or a network problem.');
      return null;
    }
  }

  const inline = decodeInlineDeck(cfg.inline);
  if (!inline) {
    emitError('deck-invalid', 'The deck in the fragment did not decode.');
    showToast('The deck in that link did not decode');
    return null;
  }
  return acceptDeck(inline, 'inline');
}

/**
 * Decide whether this frame may write. ledger=host is a request to stay in
 * memory; a failed probe means the browser is refusing, and either way the
 * answer travels to the host on rappel:ready rather than being assumed.
 */
async function decideLedgerMode(cfg) {
  if (cfg.ledger === 'host') {
    state.ledgerMode = 'host';
    return;
  }
  const local = storageAvailable();
  const idb = await probe();
  state.storageOk = local && idb;
  state.ledgerMode = state.storageOk ? 'engine' : 'ephemeral';
}

export async function boot() {
  const cfg = readConfig();
  state.embed = cfg.embed;
  state.lang = cfg.lang || 'en';
  state.cram = cfg.mode === 'cram';
  if (cfg.theme && /^[\w-]{1,32}$/.test(cfg.theme)) document.documentElement.dataset.theme = cfg.theme;

  loadAll();
  if (cfg.lang) state.lang = cfg.lang;
  await decideLedgerMode(cfg);

  if (cfg.embed) {
    mountEmbedBar(cfg);
    startBridge();
  }

  await loadBuiltinCatalog();
  const deck = await resolveDeck(cfg);

  bindEvents();
  initKeys();

  if (deck) {
    state.activeDeckId = deck.id;
    if (cfg.embed) setEmbedTitle(deckName(deck, state.lang));
    if (cfg.mode === 'browse') state.view = 'browse';
    else if (cfg.embed || cfg.mode === 'cram') {
      startSession(deck.id, { mode: cfg.mode, limit: cfg.limit });
      state.view = 'session';
    }
  } else if (!cfg.embed) {
    const saved = loadSession();
    if (resumeSession(saved)) state.view = 'session';
  }

  await render();
  if (deck && cfg.embed) emitReady(deck.id);
  emitResize();

  // Last, and never awaited before the first paint. With no Clerk key on the
  // page this returns having fetched nothing (C12 A5); with one, it reads the
  // server ledger before it writes, which is the only ordering that exercises
  // the read path on the happy path. Either way a sync failure costs the
  // learner nothing, so the screen is already up before it runs.
  initAccount({ deckId: cfg.embed ? deck?.id : undefined }).catch((err) => {
    console.warn('Rappel: the account path did not start, staying local-only', err);
  });
}
