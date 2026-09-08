/**
 * Getting a deck document into the library, from wherever it came from.
 *
 * One path in, so a deck fetched at boot from ?src= and a deck a visitor adds
 * from the built-in list are validated by the same code and namespaced by the
 * same rule. A fetched document that reaches persistent storage without passing
 * C4 is the hole C4.4 exists to close.
 */

import {
  state, saveDecks, saveLedger, savePersonal, ledgerHeadroom, deckLedger,
  sweepOrphans, markDeckEphemeral, persists,
} from './state.js';
import { namespacedDeckId, sha256Hex } from './origin.js';
import { validateDeck, isPersonalDeckId, compareDeckVersions } from './validate-deck.js';
import { expandCards } from './deck.js';
import { emitError, setLoadHandler } from './embed.js';
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
  if (!admit(candidate, false)) return null;
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

/**
 * The two refusals every document faces, wherever it came from: C4, then the
 * C8.3 ceiling. Both report to the host as well as to the person, because a
 * host that gets a silent blank panel has no way to fall back (C6.3).
 * @returns {boolean} true when the document may go on
 */
function admit(candidate, personal) {
  const report = validateDeck(candidate, { name: candidate?.id || 'deck', personal });
  if (!report.ok) {
    const first = report.errors[0];
    emitError('deck-invalid', `${first.path}: ${first.message}`);
    showToast(fill(t(UI.deckInvalid, state.lang), `${first.path}: ${first.message}`));
    return false;
  }
  // C8.3: refuse a deck that would push the card map past the ceiling, and say
  // so with the number, rather than failing silently at the browser's own.
  const room = ledgerHeadroom(expandCards(candidate).length);
  if (!room.ok) {
    // storage-unavailable is the C6.2 code for "this engine cannot keep what
    // you gave it".
    emitError('storage-unavailable', `refused: this deck would take the card map to ${mib(room.projected)}, over the ${mib(room.limit)} ceiling`);
    showToast(fill(t(UI.deckRefused, state.lang), mib(room.projected), mib(room.limit)));
    return false;
  }
  return true;
}

/**
 * A deck handed over in a rappel:load message. Contract C12 A19.
 *
 * The rules in the order the engine applies them, because the order is the
 * contract: validate as a fetched deck, then decide the identity from the
 * SENDER's origin, then decide whether a byte of it may be written, then
 * replace what is here keeping the scheduling of every card that survived.
 *
 * The invariant, restated: an unlisted origin can never cause a write to
 * rappel.neorgon.com's persistent storage. All three of "the origin is
 * allowed", "the host asked for store: engine" and "this frame is itself
 * persisting" have to hold, and rule 4 says the ready reply must report which
 * world the host got.
 *
 * @param {object} doc a whole neo-deck/1 document
 * @param {{ origin: string, allowed: boolean, store: string }} from
 * @returns {Promise<{ok: boolean, deck?: object, stored?: boolean, action?: string}>}
 */
export async function loadPersonalDeck(doc, from) {
  // Rule 1. Validated exactly as a fetched deck, on the id the sender chose:
  // an unlisted origin's rename happens after, so a document that would be
  // refused on its own id is refused rather than laundered by the prefix.
  if (!admit(doc, true)) return { ok: false };

  // Rule 2. Identity. From an allowed origin the document keeps its own id;
  // from any other it is namespaced by the SENDER's origin, so a page claiming
  // "id": "personal:runcible:japanese" cannot land on Runcible's rows.
  let candidate = doc;
  if (!from.allowed) {
    const hash = await sha256Hex(from.origin || 'null');
    candidate = { ...doc, id: `ext:${hash}:${doc.id}` };
  }
  const id = candidate.id;

  // Rule 3. The storage decision, made before anything is written.
  const stored = from.allowed && from.store !== 'ephemeral' && persists();
  if (!stored) markDeckEphemeral(id);

  // Rule 5. Same version is a no-op, an older one is ignored with a console
  // line, and both re-emit ready with what is held.
  const held = state.decks[id];
  if (held) {
    const cmp = compareDeckVersions(candidate.version, held.version);
    if (cmp === 0) return { ok: true, deck: held, stored, action: 'same' };
    if (cmp === -1) {
      console.info(`Rappel: ignored ${id} version ${candidate.version}, ${held.version} is already here.`);
      return { ok: true, deck: held, stored, action: 'older' };
    }
    // Newer. The notes and templates are replaced; every card whose
    // noteId:templateId still exists keeps its row untouched, and a card whose
    // id is gone loses its row and keeps its history in the append-only log.
    // That sweep is the whole reason this is a message and not a #d= link.
    sweepOrphans(id, expandCards(candidate).map((c) => c.id));
  }

  state.decks[id] = candidate;
  state.personal[id] = { origin: from.origin || '', at: Date.now() };
  state.awaitingPersonal = null;
  // Each of these is a no-op for an ephemeral deck: state.js filters it out of
  // what is written rather than trusting three call sites to remember.
  saveDecks();
  saveLedger();
  savePersonal();
  return { ok: true, deck: candidate, stored, action: held ? 'replaced' : 'new' };
}

/**
 * deck-load.js registers itself with the bridge rather than the bridge
 * importing this module: js/deck-load.js already imports js/embed.js for
 * emitError, and an import back the other way would make the two a cycle.
 */
setLoadHandler(loadPersonalDeck);

/**
 * Add a deck this build ships.
 *
 * C12 A19 gave ?deck= a second meaning, and this is the one place every
 * ?deck= goes: `deck=personal:<...>` names a deck a host is about to send. If
 * the engine already holds it, it is ready at once with the stored copy, so a
 * second visit works before the host says anything. If it holds nothing, the
 * frame waits and posts nothing: there is no no-deck error and no timeout,
 * because only the host can end the wait and it knows it must send.
 */
export async function loadBuiltin(deckId) {
  if (isPersonalDeckId(deckId)) {
    const held = state.decks[deckId];
    if (held) return held;
    state.awaitingPersonal = { id: deckId, embed: state.embed };
    return null;
  }
  try {
    return await acceptDeck(await fetchJson(builtinPath(deckId)), null);
  } catch (e) {
    emitError('deck-fetch-failed', `Could not load the built-in deck "${deckId}": ${e.message}`);
    showToast(fill(t(UI.noBuiltin, state.lang), deckId));
    return null;
  }
}
