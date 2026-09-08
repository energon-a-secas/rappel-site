/**
 * The append-only review log. Contract C8.4.
 *
 * This is the one storage mechanism in the campaign with no kit behind it. The
 * Persist kit is localStorage only and writes the WHOLE value on every save
 * (packages/neorgon-ui/persist/persist.js:132-137), so a log kept there costs
 * O(total history) per card answer: measured in DESIGN.md Q9 as a 4 MiB
 * stringify plus a 4 MiB synchronous main-thread write at 50,000 reviews, which
 * is a visible stall per card and arrives well before the 5 MiB ceiling.
 *
 * So the log lives in IndexedDB, which appends one 84-character record without
 * rewriting the others. Because there is no kit, this file mirrors the kit's
 * two guarantees by hand, and both are load bearing:
 *
 *   1. Every record carries a { __v: 1, ... } envelope.
 *   2. NOTHING here throws. A read failure returns the fallback, a write
 *      failure returns false. The caller checks the boolean.
 *
 * Recommendation recorded in C8.4, not work for now: if a second site ever
 * needs an append-only local store, this graduates into the persist kit as
 * createLog().
 */

import { deckPersists, memAppend } from './state.js';

export const DB_NAME = 'rappel';
export const DB_VERSION = 1;
export const STORE = 'reviews';
export const RECORD_VERSION = 1;

let dbPromise = null;

/** true when this browser exposes IndexedDB at all. */
export function logAvailable() {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/** Open the database once. Resolves to null rather than throwing. */
function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!logAvailable()) {
      resolve(null);
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ['deck', 't'] });
        store.createIndex('by_card', ['deck', 'c'], { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function run(mode, fn, fallback) {
  return open().then((db) => {
    if (!db) return fallback;
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction(STORE, mode);
      } catch {
        resolve(fallback);
        return;
      }
      let settled = fallback;
      tx.oncomplete = () => resolve(settled);
      tx.onerror = () => resolve(fallback);
      tx.onabort = () => resolve(fallback);
      try {
        fn(tx.objectStore(STORE), (value) => { settled = value; });
      } catch {
        resolve(fallback);
      }
    });
  }).catch(() => fallback);
}

/** A stored record: the neo-ledger/1 log entry plus its deck and envelope. */
export function toRecord(deckId, entry) {
  return {
    __v: RECORD_VERSION,
    deck: deckId,
    c: entry.c,
    t: entry.t,
    g: entry.g,
    e: entry.e,
    s0: entry.s0,
    d0: entry.d0,
    el: entry.el,
    st0: entry.st0,
  };
}

/** A record read back, as a neo-ledger/1 log entry. */
export function fromRecord(rec) {
  const { c, t, g, e, s0, d0, el, st0 } = rec;
  return { c, t, g, e, s0, d0, el, st0 };
}

/**
 * Append one review.
 *
 * C12 A19 rule 3: a deck this engine may not persist keeps its log in memory
 * for the life of the frame, so an export still carries it and nothing of it
 * reaches this origin's disk. That is reported as a landed write because it is
 * one: the caller's fallback for false is a toast about a refused write, and a
 * deck that was never going to be written has not refused anything.
 *
 * @returns {Promise<boolean>} false when the write did not land.
 */
export function appendReview(deckId, entry) {
  if (!deckPersists(deckId)) return Promise.resolve(memAppend(deckId, entry));
  return run('readwrite', (store, set) => {
    store.put(toRecord(deckId, entry));
    set(true);
  }, false);
}

/** Append many. Resolves to the number written, 0 when nothing landed. */
export function appendMany(deckId, entries) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) return Promise.resolve(0);
  return run('readwrite', (store, set) => {
    for (const entry of list) store.put(toRecord(deckId, entry));
    set(list.length);
  }, 0);
}

/** Every log entry for one deck, oldest first. */
export function readDeck(deckId) {
  return run('readonly', (store, set) => {
    const range = IDBKeyRange.bound([deckId, -Infinity], [deckId, Infinity]);
    const req = store.getAll(range);
    req.onsuccess = () => set((req.result || []).map(fromRecord));
  }, []);
}

/** Every log entry for one card, oldest first. */
export function readCard(deckId, cardId) {
  return run('readonly', (store, set) => {
    const req = store.index('by_card').getAll(IDBKeyRange.only([deckId, cardId]));
    req.onsuccess = () => set((req.result || []).map(fromRecord).sort((a, b) => a.t - b.t));
  }, []);
}

/** Every log entry across every deck, as { deck, ...entry }, oldest first. */
export function readAll() {
  return run('readonly', (store, set) => {
    const req = store.getAll();
    req.onsuccess = () => set(
      (req.result || [])
        .map((rec) => ({ deck: rec.deck, ...fromRecord(rec) }))
        .sort((a, b) => a.t - b.t),
    );
  }, []);
}

/** How many reviews are stored, across every deck. */
export function count() {
  return run('readonly', (store, set) => {
    const req = store.count();
    req.onsuccess = () => set(req.result || 0);
  }, 0);
}

/** Drop one deck's history. Used by "forget this deck", never automatically. */
export function clearDeck(deckId) {
  return run('readwrite', (store, set) => {
    store.delete(IDBKeyRange.bound([deckId, -Infinity], [deckId, Infinity]));
    set(true);
  }, false);
}

/** Drop everything. Only ever called from an explicit confirmation. */
export function clearAll() {
  return run('readwrite', (store, set) => {
    store.clear();
    set(true);
  }, false);
}

/**
 * A write probe. The engine reports ledger: "engine" or "ephemeral" on
 * rappel:ready from this plus the Persist kit's storageAvailable(), because
 * Safari may partition even the same-site case and a host has to be able to
 * say that progress is not being saved in this frame. C6.5.
 */
export async function probe() {
  const marker = { c: '__probe__:__probe__', t: 0, g: 1, e: 0, s0: 0, d0: 0, el: 0, st0: 'new' };
  const wrote = await appendReview('__probe__', marker);
  if (wrote) await clearDeck('__probe__');
  return wrote;
}
