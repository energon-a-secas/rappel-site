/**
 * Getting a deck document into the library, from wherever it came from.
 *
 * One path in, so a deck fetched at boot from ?src= and a deck a visitor adds
 * from the built-in list are validated by the same code and namespaced by the
 * same rule. A fetched document that reaches persistent storage without passing
 * C4 is the hole C4.4 exists to close.
 */

import { state, saveDecks, saveLedger, ledgerHeadroom, deckLedger, sweepOrphans } from './state.js';
import { namespacedDeckId, sha256Hex } from './origin.js';
import { validateDeck } from './validate-deck.js';
import { expandCards } from './deck.js';
import { emitError } from './embed.js';
import { showToast, mib, t, fill, UI } from './utils.js';

/** Where a build's own decks are listed. Workstream Cb owns the directory. */
export const BUILTIN_INDEX = 'data/decks/index.json';

export async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/** The catalog, or an empty list when this build ships none. */
export async function loadBuiltinCatalog() {
  try {
    const doc = await fetchJson(BUILTIN_INDEX);
    state.builtin = Array.isArray(doc.decks) ? doc.decks : [];
  } catch {
    state.builtin = [];
    console.info(`Rappel: no built-in deck catalog at ${BUILTIN_INDEX}. Import a file instead.`);
  }
  return state.builtin;
}

/** The file a catalog entry points at, or the conventional path for an id. */
export function builtinPath(deckId) {
  const entry = state.builtin.find((d) => d.id === deckId);
  return entry?.file || `data/decks/${deckId}.json`;
}

/**
 * Take a candidate document into the library, or say why not.
 * @param {object} doc a deck document
 * @param {string|null} src where it was fetched from, for C4.4 namespacing;
 *   'inline' for a deck carried in the URL fragment, which is namespaced by its
 *   own content so a crafted link can never replace a built-in deck's rows
 */
export async function acceptDeck(doc, src) {
  let candidate = doc;
  if (src === 'inline') {
    const hash = await sha256Hex(JSON.stringify(doc));
    candidate = { ...doc, id: `ext:${String(hash).slice(0, 12)}:${doc?.id}` };
  } else if (src) {
    const hash = await sha256Hex(src);
    candidate = { ...doc, id: namespacedDeckId(doc.id, src, hash) };
  }
  const report = validateDeck(candidate, { name: candidate?.id || 'deck' });
  if (!report.ok) {
    const first = report.errors[0];
    emitError('deck-invalid', `${first.path}: ${first.message}`);
    showToast(fill(t(UI.deckInvalid, state.lang), `${first.path}: ${first.message}`));
    return null;
  }
  // C8.3: refuse a deck that would push the card map past the ceiling, and say
  // so with the number, rather than failing silently at the browser's own.
  const room = ledgerHeadroom(expandCards(candidate).length);
  if (!room.ok) {
    // C6.3: a host must never get a silent blank panel, so the refusal is an
    // error event as well as a toast. storage-unavailable is the C6.2 code
    // for "this engine cannot keep what you gave it".
    emitError('storage-unavailable', `refused: this deck would take the card map to ${mib(room.projected)}, over the ${mib(room.limit)} ceiling`);
    showToast(fill(t(UI.deckRefused, state.lang), mib(room.projected), mib(room.limit)));
    return null;
  }
  // C5.2 rule 1: a deleted note leaves an orphan row, swept once the deck's
  // version has moved. A deck seen for the first time has nothing to sweep.
  const group = deckLedger(candidate.id);
  const seen = group.deck_version_seen;
  if (seen !== null && seen !== undefined && seen !== (candidate.version ?? null)) {
    const removed = sweepOrphans(candidate.id, expandCards(candidate).map((c) => c.id));
    if (removed) showToast(fill(t(removed === 1 ? UI.deckSweptOne : UI.deckSweptMany, state.lang), candidate.version, removed));
  }
  state.decks[candidate.id] = candidate;
  saveDecks();
  saveLedger();
  return candidate;
}

/** Add a deck this build ships. */
export async function loadBuiltin(deckId) {
  try {
    return await acceptDeck(await fetchJson(builtinPath(deckId)), null);
  } catch (e) {
    emitError('deck-fetch-failed', `Could not load the built-in deck "${deckId}": ${e.message}`);
    showToast(fill(t(UI.noBuiltin, state.lang), deckId));
    return null;
  }
}
