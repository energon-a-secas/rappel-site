/**
 * The neo-ledger/1 document: build it, and take one back in. Contract C5.
 *
 * One document, two halves, two homes. C8 decides where each half lives; this
 * file is the only place that puts them back together, because an importer
 * must never have to care where the exporter kept them (C5.3 amendment 5).
 */

import { state, deckLedger, saveLedger, persists } from './state.js';
import { readAll, appendMany, clearDeck } from './ledger-log.js';
import { validateLedger } from './validate-deck.js';
import { LEDGER_FORMAT } from './validate-deck.js';

/**
 * Assemble the exported document.
 * @param {{ log?: boolean, deckId?: string }} [opts]
 *   log defaults false: a 100,000-entry log is 8 MiB of postMessage (C6.3).
 */
export async function buildLedgerDocument(opts = {}) {
  const wantLog = opts.log === true;
  const only = opts.deckId || null;
  const decks = {};

  for (const [deckId, group] of Object.entries(state.ledger.decks)) {
    if (only && deckId !== only) continue;
    decks[deckId] = {
      deck_version_seen: group.deck_version_seen ?? null,
      cards: { ...group.cards },
      log: [],
    };
  }

  if (wantLog) {
    const all = persists() ? await readAll() : state.memLog;
    for (const entry of all) {
      const { deck, ...rest } = entry;
      if (only && deck !== only) continue;
      if (!decks[deck]) decks[deck] = { deck_version_seen: null, cards: {}, log: [] };
      decks[deck].log.push(rest);
    }
  }

  return {
    format: LEDGER_FORMAT,
    exported: Date.now(),
    origin: location.origin,
    scheduler: { ...state.scheduler, w: [...state.scheduler.w] },
    decks,
  };
}

/**
 * Take a ledger back in.
 *
 * `merge` is last-write-wins PER CARD by `lr`, which loses nothing when two
 * devices reviewed different cards (C6.3, and the same rule C7.6 gives Convex).
 * `replace` drops what is here first.
 *
 * @param {object} doc a neo-ledger/1 document
 * @param {'merge'|'replace'} strategy
 * @returns {Promise<{ ok: boolean, cards: number, log: number, error?: string }>}
 */
export async function restoreLedger(doc, strategy = 'merge') {
  const report = validateLedger(doc, { name: 'restore' });
  if (!report.ok) {
    return { ok: false, cards: 0, log: 0, error: report.errors[0].message };
  }
  if (strategy === 'replace') {
    // "Replace" means the history too: a card map with someone else's review
    // log behind it reports a past that belongs to the discarded ledger.
    for (const deckId of Object.keys(state.ledger.decks || {})) await clearDeck(deckId);
    state.memLog = [];
    state.ledger = { decks: {} };
  }

  let cards = 0;
  let logged = 0;
  for (const [deckId, group] of Object.entries(doc.decks || {})) {
    const mine = deckLedger(deckId);
    if (group.deck_version_seen) mine.deck_version_seen = group.deck_version_seen;
    for (const [cardId, row] of Object.entries(group.cards || {})) {
      const here = mine.cards[cardId];
      if (!here || (row.lr || 0) > (here.lr || 0)) {
        mine.cards[cardId] = { ...row };
        cards += 1;
      }
    }
    if (Array.isArray(group.log) && group.log.length) {
      if (persists()) {
        // The store is keyed by (deck, t), so re-importing the same export is a
        // no-op rather than a duplicate. Idempotent by construction.
        logged += await appendMany(deckId, group.log);
      } else {
        // ledger=host or a failed probe: the log lives in memory, and a restore
        // that dropped it would lose the host's round trip on every reload.
        const have = new Set(state.memLog.filter((e) => e.deck === deckId).map((e) => e.t));
        for (const e of group.log) {
          if (have.has(e.t)) continue;
          state.memLog.push({ deck: deckId, ...e });
          have.add(e.t);
          logged += 1;
        }
      }
    }
  }
  saveLedger();
  return { ok: true, cards, log: logged };
}

/** Counts a deck screen and rappel:due both need. */
export function deckCounts(deckId, cardIds, now = Date.now()) {
  const group = state.ledger.decks[deckId];
  let due = 0;
  let fresh = 0;
  let learning = 0;
  let nextDueAt = null;
  for (const id of cardIds) {
    const row = group?.cards?.[id];
    if (!row || row.s === 0) {
      fresh += 1;
      continue;
    }
    if (row.st === 'learning' || row.st === 'relearning') learning += 1;
    if (row.due <= now) due += 1;
    else if (nextDueAt === null || row.due < nextDueAt) nextDueAt = row.due;
  }
  return { due, new: fresh, learning, total: cardIds.length, nextDueAt };
}
