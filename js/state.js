/**
 * Shared state and its storage. Contracts C5 and C8.
 *
 * Storage is split by lifetime, and the split was measured, not assumed
 * (DESIGN.md Q9):
 *
 *   the card map  -> localStorage, through the Persist kit, key rappel:ledger:v1
 *   the review log -> IndexedDB, js/ledger-log.js
 *
 * The kit writes the whole value on every save, so a log in localStorage costs
 * O(total history) per card answer. The card map is bounded by deck size, hot,
 * and exactly what the kit is for.
 *
 * The keys are identical in standalone and embed mode. That is the point of
 * Q2: on a same-site embed both modes address the same partition and therefore
 * the same ledger.
 */

import { createStore, storageAvailable } from './neorgon-persist.js';
import { defaultScheduler } from './scheduler.js';
import { byteLength } from './utils.js';

export const PREFS_KEY = 'rappel:prefs:v1';
export const LEDGER_KEY = 'rappel:ledger:v1';
export const DECKS_KEY = 'rappel:decks:v1';
export const SESSION_KEY = 'rappel:session:v1';
/**
 * C8.3 as C12 A19 adds to it: which site sent a personal deck, and when. The
 * document itself is in DECKS_KEY with every other deck; this is only the
 * provenance line the library row shows, so a person can see that a deck in
 * their library came from Runcible on Tuesday and was not something they made.
 */
export const PERSONAL_KEY = 'rappel:personal:v1';

/** C8.3: refuse a deck that would push the card map past this, with the number. */
export const LEDGER_LIMIT_BYTES = Math.round(1.5 * 1024 * 1024);

const prefsStore = createStore({ key: PREFS_KEY, version: 1 });
const ledgerStore = createStore({ key: LEDGER_KEY, version: 1 });
const decksStore = createStore({ key: DECKS_KEY, version: 1 });
const sessionStore = createStore({ key: SESSION_KEY, version: 1 });
const personalStore = createStore({ key: PERSONAL_KEY, version: 1 });

export const state = {
  /** library | session | stats | settings */
  view: 'library',
  lang: 'en',
  /** deck id -> a neo-deck/1 document */
  decks: {},
  /** the built-in catalog, if this build ships one */
  builtin: [],
  /** the cards half of neo-ledger/1: { decks: { id: { deck_version_seen, cards } } } */
  ledger: { decks: {} },
  scheduler: defaultScheduler(),
  session: null,
  activeDeckId: null,
  /** embed mode facts, set by js/embed.js before anything renders */
  embed: false,
  /** engine | ephemeral | host. Reported on rappel:ready. C6.5. */
  ledgerMode: 'engine',
  storageOk: true,
  /** set when ?mode=cram: a cram session writes nothing to the ledger. C6.1 */
  cram: false,
  hostOrigin: null,
  /** the review log while the engine is not allowed to persist. C6.5. */
  memLog: [],
  /** deck id -> { origin, at } for a deck a host sent. C12 A19. */
  personal: {},
  /**
   * Deck ids this frame may hold but must never write. A19 rule 3: a deck that
   * arrived from an unlisted origin, or with store:"ephemeral", lives for the
   * life of the frame and nothing of it reaches this origin's disk. It is a
   * per-deck rule and not a frame-wide one on purpose: an unlisted origin
   * posting a deck must not be able to stop a legitimate deck in the same
   * frame from saving, which a frame-wide flag would let it do.
   */
  ephemeralDecks: new Set(),
  /** { id, embed } while ?deck=personal: names a deck nothing has sent yet. */
  awaitingPersonal: null,
};

/** true when a write should reach disk. False for ledger=host and for a
 *  failed storage probe, where the engine is honestly ephemeral. */
export function persists() {
  return state.ledgerMode === 'engine';
}

export function loadAll() {
  state.storageOk = storageAvailable();
  const prefs = prefsStore.load(null);
  if (prefs && typeof prefs === 'object') {
    if (prefs.lang) state.lang = prefs.lang;
    state.scheduler = {
      ...defaultScheduler(),
      w: Array.isArray(prefs.w) && prefs.w.length === 21 ? prefs.w : defaultScheduler().w,
      desired_retention: Number.isFinite(prefs.desiredRetention) ? prefs.desiredRetention : 0.9,
      learn_steps: Array.isArray(prefs.learnSteps) ? prefs.learnSteps : [60, 600],
      relearn_steps: Array.isArray(prefs.relearnSteps) ? prefs.relearnSteps : [600],
      day_start_hour: Number.isInteger(prefs.dayStartHour) ? prefs.dayStartHour : 4,
    };
  }
  const ledger = ledgerStore.load(null);
  if (ledger && typeof ledger === 'object' && ledger.decks) state.ledger = ledger;
  const decks = decksStore.load(null);
  if (decks && typeof decks === 'object') state.decks = decks;
  const personal = personalStore.load(null);
  if (personal && typeof personal === 'object') state.personal = personal;
}

/** true when a write for THIS deck may reach disk. A19 rule 3. */
export function deckPersists(deckId) {
  return persists() && !state.ephemeralDecks.has(deckId);
}

/**
 * Hold a deck for the life of the frame and never write it. A19 rule 3.
 *
 * An id already on disk that is re-sent as ephemeral loses its stored copy on
 * the next save, and that is only reachable first-party: an unlisted origin's
 * deck is renamed under a hash of its own origin, so it can never name a deck
 * this browser already holds, and a fleet host that asks for a deck not to be
 * kept has asked for exactly this.
 */
export function markDeckEphemeral(deckId) {
  state.ephemeralDecks.add(deckId);
}

/**
 * Keep one review in memory instead of on disk, without duplicating it.
 * The log of a deck the engine may not persist still has to reach a host on
 * rappel:progress, which is the only copy of it that will outlive the frame.
 */
export function memAppend(deckId, entry) {
  const seen = state.memLog.some((e) => e.deck === deckId && e.t === entry.t);
  if (!seen) state.memLog.push({ deck: deckId, ...entry });
  return true;
}

/** Everything in `map` except the decks this frame may not write. */
function persistable(map) {
  if (state.ephemeralDecks.size === 0) return map;
  const out = {};
  for (const [id, value] of Object.entries(map)) {
    if (!state.ephemeralDecks.has(id)) out[id] = value;
  }
  return out;
}

export function savePrefs() {
  if (!persists()) return false;
  return prefsStore.save({
    lang: state.lang,
    desiredRetention: state.scheduler.desired_retention,
    w: state.scheduler.w,
    learnSteps: state.scheduler.learn_steps,
    relearnSteps: state.scheduler.relearn_steps,
    dayStartHour: state.scheduler.day_start_hour,
  });
}

export function saveLedger() {
  if (!persists()) return false;
  // An ephemeral deck's rows are filtered out here rather than at each call
  // site, so a save triggered by any other deck cannot carry them to disk as a
  // passenger. That was the shape of the hole: state.ledger is one object.
  return ledgerStore.save({ ...state.ledger, decks: persistable(state.ledger.decks) });
}

export function saveDecks() {
  if (!persists()) return false;
  return decksStore.save(persistable(state.decks));
}

/** The provenance rows for the personal decks this browser keeps. A19. */
export function savePersonal() {
  if (!persists()) return false;
  return personalStore.save(persistable(state.personal));
}

/**
 * The saved session, and the one place A19 rule 3 was still leaking.
 *
 * A session on an ephemeral deck is as unwritable as the deck it is on, and
 * unwritable has to mean the key is left exactly as it is. A clear is a write,
 * and the row it deletes belongs to whichever session was saved last, never to
 * this one, because this one was never allowed to be saved. Clearing here is
 * what let a rappel:load from an unlisted origin delete the learner's own saved
 * session, in any browser that does not partition the frame's storage away from
 * the engine's. Leaving the row costs nothing: resumeSession() refuses a saved
 * session whose deck this browser no longer holds, so a stale row opens the
 * library rather than a blank screen.
 */
export function saveSession() {
  if (!persists()) return false;
  if (!state.session) return sessionStore.clear();
  if (!deckPersists(state.session.deckId)) return false;
  return sessionStore.save(state.session);
}

export function loadSession() {
  return sessionStore.load(null);
}

export function clearSession() {
  const ended = state.session;
  state.session = null;
  // The same rule from the other side: ending a session that was never saved
  // must not clear the key a saved session is sitting in.
  if (persists() && (!ended || deckPersists(ended.deckId))) sessionStore.clear();
}

/** The ledger row group for a deck, created on first touch. */
export function deckLedger(deckId) {
  if (!state.ledger.decks[deckId]) {
    state.ledger.decks[deckId] = { deck_version_seen: null, cards: {} };
  }
  return state.ledger.decks[deckId];
}

export function cardRow(deckId, cardId) {
  return state.ledger.decks[deckId]?.cards?.[cardId] || null;
}

export function setCardRow(deckId, cardId, row) {
  deckLedger(deckId).cards[cardId] = row;
}

/** Bytes the card map currently occupies. */
export function ledgerBytes() {
  return byteLength(state.ledger);
}

/**
 * Whether adding this many cards keeps the map under the C8.3 ceiling.
 * The refusal has to say the number, so the numbers come back either way.
 */
export function ledgerHeadroom(extraCards = 0) {
  const current = ledgerBytes();
  // 123 characters per card row, measured in DESIGN.md Q9.
  const projected = current + extraCards * 123;
  return { ok: projected <= LEDGER_LIMIT_BYTES, current, projected, limit: LEDGER_LIMIT_BYTES };
}

/**
 * Sweep rows whose note no longer exists, once a deck's version has moved.
 * C5.2 rule 1: a deleted note leaves an orphan, swept on a version bump.
 */
export function sweepOrphans(deckId, liveCardIds) {
  const group = deckLedger(deckId);
  const live = new Set(liveCardIds);
  let removed = 0;
  for (const id of Object.keys(group.cards)) {
    if (!live.has(id)) {
      delete group.cards[id];
      removed += 1;
    }
  }
  return removed;
}

export function forgetDeck(deckId) {
  delete state.decks[deckId];
  delete state.ledger.decks[deckId];
  // A19: forget removes a personal deck and its rows from this browser. It
  // does not stop the site that built it sending it again on the next visit,
  // and it should not: the host is the copy of record.
  delete state.personal[deckId];
  state.ephemeralDecks.delete(deckId);
  saveDecks();
  saveLedger();
  savePersonal();
}
