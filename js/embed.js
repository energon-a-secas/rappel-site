/**
 * Embed mode and the postMessage bridge. Contract C6, version neo-rappel-embed/1.
 *
 * There is no fleet precedent for any of this. Proctor has zero postMessage,
 * and the only three call sites in the whole fleet are Worker and MessageChannel
 * calls, so every line here is new mechanism rather than a copy. What IS copied
 * from Proctor is the chrome strip and the escape link
 * (projects/proctor-site/js/app.js:25-37), because that part is proven.
 *
 * Three rules that are not obvious and are each a class of bug:
 *
 *   1. Every message carries v: 1, in BOTH directions, and a message whose v
 *      this engine does not know is ignored. C6.7: the two sites deploy
 *      separately, so a host published against version 1 has to keep working.
 *   2. Outbound posts go to the referrer's origin, never '*'.
 *   3. rappel:hello makes the engine re-emit rappel:ready. The engine can
 *      become ready before the host attaches its listener, and a contract
 *      without this produces an intermittently blank host panel.
 *
 * The silent failure this is written against, from C6.7: a host that stops
 * receiving rappel:answer shows a working deck and quietly stops unlocking
 * chapters, with no error anywhere. That is why the vocabulary is versioned and
 * why every event below is emitted from the engine's own review loop rather
 * than from the UI.
 */

import { state } from './state.js';
import { isAllowedOrigin } from './origin.js';
import { buildLedgerDocument, restoreLedger, deckCounts } from './ledger.js';
import { expandCards, deckName } from './deck.js';
import { escHtml, b64urlDecode } from './utils.js';

export const PROTOCOL_VERSION = 1;

const params = new URLSearchParams(location.search);
let hostOrigin = null;
let lastReady = null;

/** Everything the URL says. C6.1. */
export function readConfig() {
  const hash = location.hash.match(/^#d=(.+)$/);
  const limit = Number.parseInt(params.get('limit'), 10);
  const mode = params.get('mode') || 'review';
  return {
    embed: params.get('embed') === '1',
    deck: params.get('deck'),
    src: params.get('src'),
    inline: hash ? hash[1] : null,
    mode: ['review', 'cram', 'browse'].includes(mode) ? mode : 'review',
    // Non-finite values are discarded, the way proctor js/app.js:46-51 does it.
    limit: Number.isFinite(limit) && limit > 0 ? limit : null,
    ledger: params.get('ledger') === 'host' ? 'host' : 'engine',
    // null when absent, so a saved preference is not overwritten with English.
    lang: params.has('lang') ? (params.get('lang') === 'es' ? 'es' : 'en') : null,
    theme: params.get('theme'),
  };
}

/** Decode a deck carried in the fragment. Returns null on anything malformed. */
export function decodeInlineDeck(encoded) {
  try {
    return JSON.parse(b64urlDecode(encoded));
  } catch {
    return null;
  }
}

/** The origin the engine talks to. Null when there is no referrer to trust. */
export function resolveHostOrigin() {
  if (hostOrigin !== null) return hostOrigin;
  try {
    hostOrigin = document.referrer ? new URL(document.referrer).origin : '';
  } catch {
    hostOrigin = '';
  }
  state.hostOrigin = hostOrigin || null;
  return hostOrigin;
}

/** Post one message to the host. Never '*', never without a version. */
export function post(type, payload = {}) {
  if (!state.embed) return false;
  const target = resolveHostOrigin();
  if (!target || window.parent === window) return false;
  try {
    window.parent.postMessage({ v: PROTOCOL_VERSION, type, ...payload }, target);
    return true;
  } catch {
    return false;
  }
}

/** The engine's own storage verdict, reported on every ready. C6.5. */
export function ledgerLabel() {
  return state.ledgerMode === 'engine' ? 'engine' : 'ephemeral';
}

function cardIdsOf(deckId) {
  const deck = state.decks[deckId];
  return deck ? expandCards(deck).map((c) => c.id) : [];
}

/** rappel:ready. Fires once on load, and again on every rappel:hello. */
export function emitReady(deckId) {
  const deck = state.decks[deckId];
  if (!deck) return;
  const counts = deckCounts(deckId, cardIdsOf(deckId));
  lastReady = {
    deckId: deck.id,
    deckVersion: deck.version,
    name: deckName(deck, state.lang),
    total: counts.total,
    due: counts.due,
    new: counts.new,
    ledger: ledgerLabel(),
  };
  post('rappel:ready', lastReady);
  emitDue(deckId);
}

/** rappel:due. On ready, and after every session-end. */
export function emitDue(deckId) {
  const deck = state.decks[deckId];
  if (!deck) return;
  const c = deckCounts(deckId, cardIdsOf(deckId));
  post('rappel:due', {
    deckId, due: c.due, new: c.new, learning: c.learning, total: c.total, nextDueAt: c.nextDueAt,
  });
}

/** rappel:error. The frame shows its own message either way. */
export function emitError(code, message) {
  post('rappel:error', { code, message });
}

/** rappel:resize, so a host that did not fix a height gets no scrollbar. */
let resizeTimer = null;
export function emitResize() {
  if (!state.embed) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    post('rappel:resize', { height: Math.ceil(document.documentElement.scrollHeight) });
  }, 120);
}

async function emitProgress(includeLog) {
  const ledger = await buildLedgerDocument({ log: includeLog, deckId: state.activeDeckId });
  post('rappel:progress', { deckId: state.activeDeckId, format: ledger.format, ledger });
}

/**
 * The inbound half. C6.3 and C6.4.
 *
 * hello, start, export and theme are accepted from any origin: they are
 * read-only or session-scoped, and the host already knows which deck it
 * embedded, so nothing is disclosed. restore is the one that can write, and it
 * is refused from an unlisted origin unless the engine is already ephemeral.
 *
 * The invariant, stated once: an unlisted origin can never cause a write to
 * rappel.neorgon.com's persistent storage.
 */
function onMessage(event) {
  const m = event.data;
  if (!m || typeof m !== 'object') return;
  if (m.v !== PROTOCOL_VERSION) return;
  if (typeof m.type !== 'string' || !m.type.startsWith('rappel:')) return;

  const allowed = isAllowedOrigin(event.origin, location.origin);

  switch (m.type) {
    case 'rappel:hello':
      if (state.activeDeckId) emitReady(state.activeDeckId);
      break;
    case 'rappel:start':
      document.dispatchEvent(new CustomEvent('rappel-host-start', {
        detail: { limit: m.limit, mode: m.mode },
      }));
      break;
    case 'rappel:export':
      emitProgress(m.log === true);
      break;
    case 'rappel:theme':
      if (typeof m.theme === 'string' && /^[\w-]{1,32}$/.test(m.theme)) {
        document.documentElement.dataset.theme = m.theme;
      }
      break;
    case 'rappel:restore': {
      if (!allowed && state.ledgerMode === 'engine') {
        emitError('origin-refused',
          `A restore from ${event.origin} was refused. Add ?ledger=host to run this frame in memory.`);
        return;
      }
      restoreLedger(m.ledger, m.strategy === 'replace' ? 'replace' : 'merge').then((res) => {
        if (!res.ok) emitError('deck-invalid', res.error);
        else document.dispatchEvent(new CustomEvent('rappel-restored', { detail: res }));
      });
      break;
    }
    default:
      break;
  }
}

/**
 * Strip the chrome to a slim bar with an escape link, preserving the other
 * params. Copied in shape from projects/proctor-site/js/app.js:25-37.
 */
export function mountEmbedBar(cfg) {
  document.body.classList.add('is-embed');
  const p = new URLSearchParams(location.search);
  p.delete('embed');
  p.delete('ledger');
  const qs = p.toString();
  const href = `${location.origin}${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`;
  const bar = document.createElement('div');
  bar.className = 'rp-embed-bar';
  bar.innerHTML = `<span id="embedBarTitle">Rappel</span>
    <a href="${escHtml(href)}" target="_blank" rel="noopener noreferrer">Open in Rappel &#8599;</a>`;
  document.body.prepend(bar);
  void cfg;
  return bar;
}

/** Put the deck name in the bar once a deck has loaded. */
export function setEmbedTitle(text) {
  const el = document.getElementById('embedBarTitle');
  if (el) el.textContent = text;
}

/** Install the inbound listener and the session bridge. */
export function startBridge() {
  window.addEventListener('message', onMessage);
  document.addEventListener('rappel-session-start', (e) => post('rappel:session-start', e.detail));
  document.addEventListener('rappel-answer', (e) => post('rappel:answer', e.detail));
  document.addEventListener('rappel-session-end', (e) => {
    const c = deckCounts(e.detail.deckId, cardIdsOf(e.detail.deckId));
    post('rappel:session-end', { ...e.detail, due: c.due, new: c.new });
    emitDue(e.detail.deckId);
    if (state.ledgerMode === 'host') emitProgress(true);
  });
  // Under ledger=host nothing is written anywhere, so the host has to receive
  // the ledger as it changes or the learner loses the session on unload.
  document.addEventListener('rappel-answer', () => {
    if (state.ledgerMode === 'host') emitProgress(true);
  });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(emitResize).observe(document.documentElement);
  }
}

/** The last ready payload, for tests and for the console. */
export function lastReadyPayload() {
  return lastReady;
}
