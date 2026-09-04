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

/** C8.3: refuse a deck that would push the card map past this, with the number. */
export const LEDGER_LIMIT_BYTES = Math.round(1.5 * 1024 * 1024);

const prefsStore = createStore({ key: PREFS_KEY, version: 1 });
const ledgerStore = createStore({ key: LEDGER_KEY, version: 1 });
const decksStore = createStore({ key: DECKS_KEY, version: 1 });
const sessionStore = createStore({ key: SESSION_KEY, version: 1 });

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
  return ledgerStore.save(state.ledger);
}

export function saveDecks() {
  if (!persists()) return false;
  return decksStore.save(state.decks);
}

export function saveSession() {
  if (!persists()) return false;
  if (!state.session) return sessionStore.clear();
  return sessionStore.save(state.session);
}

export function loadSession() {
  return sessionStore.load(null);
}

export function clearSession() {
  state.session = null;
  if (persists()) sessionStore.clear();
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
  saveDecks();
  saveLedger();
}
