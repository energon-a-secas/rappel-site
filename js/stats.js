/**
 * The stats screen, drawn entirely with the Viz Kit.
 *
 * viz.heatmap is the review heatmap, viz.line is retention over time,
 * viz.statGrid is the counter strip and viz.spark is the per-deck trend. All
 * four are pure functions returning SVG strings, token driven and gated on
 * prefers-reduced-motion, and they already exist
 * (packages/neorgon-ui/README.md). A hand-rolled calendar heatmap here would be
 * a rejection, so there is not one.
 */

import viz from './viz.js';
import { state } from './state.js';
import { readAll } from './ledger-log.js';
import { expandCards, deckName } from './deck.js';
import { deckCounts } from './ledger.js';
import { dayKey, escHtml, t, fill, UI } from './utils.js';

/** The screen's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

function weekdays() {
  return state.lang === 'es' ? ['lun', '', 'mié', '', 'vie', '', 'dom'] : ['Mon', '', 'Wed', '', 'Fri', '', 'Sun'];
}

/** Every review this browser holds, oldest first. */
export async function loadHistory() {
  return state.ledgerMode === 'engine' ? readAll() : [...state.memLog];
}

/** Reviews per local day, as a Map of YYYY-MM-DD to a count. */
export function perDay(history) {
  const map = new Map();
  for (const entry of history) map.set(dayKey(entry.t), (map.get(dayKey(entry.t)) || 0) + 1);
  return map;
}

/** Consecutive days ending today, or ending yesterday if today is untouched. */
export function streak(counts, now = Date.now()) {
  let days = 0;
  const cursor = new Date(now);
  if (!counts.get(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const key = dayKey(cursor.getTime());
    if (!counts.get(key)) break;
    days += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
}

/**
 * A 7 by N grid for viz.heatmap, ending on the current week. Row 0 is Monday,
 * which is what makes the column a calendar week rather than a rolling window.
 */
export function heatGrid(counts, weeks = 18, now = Date.now()) {
  const end = new Date(now);
  const offsetToMonday = (end.getDay() + 6) % 7;
  end.setDate(end.getDate() - offsetToMonday);
  const grid = Array.from({ length: 7 }, () => Array(weeks).fill(0));
  const cols = [];
  for (let c = 0; c < weeks; c += 1) {
    const monday = new Date(end);
    monday.setDate(monday.getDate() - (weeks - 1 - c) * 7);
    cols.push(c % 4 === 0 ? monday.toLocaleDateString(undefined, { month: 'short' }) : '');
    for (let r = 0; r < 7; r += 1) {
      const day = new Date(monday);
      day.setDate(day.getDate() + r);
      if (day.getTime() > now) continue;
      grid[r][c] = counts.get(dayKey(day.getTime())) || 0;
    }
  }
  return { grid, cols };
}

/** Rolling recall percentage, one point per day with reviews. */
export function retentionSeries(history, window = 50) {
  const graded = history.filter((e) => e.st0 === 'review');
  const points = [];
  for (let i = 0; i < graded.length; i += 1) {
    const slice = graded.slice(Math.max(0, i - window + 1), i + 1);
    if (slice.length < 10) continue;
    const hit = slice.filter((e) => e.g >= 2).length;
    points.push({ x: i, y: Math.round((hit / slice.length) * 100) });
  }
  return points;
}

/** True recall on cards that were actually in review, all time. */
export function retentionAllTime(history) {
  const graded = history.filter((e) => e.st0 === 'review');
  if (graded.length === 0) return null;
  return Math.round((graded.filter((e) => e.g >= 2).length / graded.length) * 100);
}

/**
 * Reviews the card map says happened, summed over every deck. A row's `reps`
 * counts every answer that produced it (C5.1), so this is a lower bound on a
 * person's history that survives even when the log does not.
 */
export function impliedReviews(ledger = state.ledger) {
  let n = 0;
  for (const group of Object.values(ledger.decks || {})) {
    for (const row of Object.values(group.cards || {})) n += Number(row.reps) || 0;
  }
  return n;
}

/**
 * Reviews this browser can see, against reviews the card map says happened.
 *
 * The two separate for reasons that are named limitations rather than bugs:
 * `ledger.pull` returns { cards, settings } and no review log (CONTRACTS C12
 * A4), and an exported ledger defaults to log:false. Either way a second device
 * restores the schedule with no history behind it.
 *
 * Rendering that as a zero would read as "you have never studied", which is
 * false, so the count that happened elsewhere comes back instead of being
 * flattened away.
 */
export function historyGap(history, ledger = state.ledger) {
  const implied = impliedReviews(ledger);
  const here = history.length;
  return { here, implied, elsewhere: Math.max(0, implied - here) };
}

function totals(now = Date.now()) {
  let due = 0;
  let fresh = 0;
  let cards = 0;
  for (const [deckId, deck] of Object.entries(state.decks)) {
    const ids = expandCards(deck).map((c) => c.id);
    const c = deckCounts(deckId, ids, now);
    due += c.due;
    fresh += c.new;
    cards += c.total;
  }
  return { due, fresh, cards };
}


/**
 * The card explaining why a heatmap is empty on a device that plainly has
 * progress. It carries the export and restore controls because export is how a
 * person actually moves history between devices, and a limitation with no route
 * out of it is just a dead end.
 */
function historyElsewhereCard(gap) {
  const n = gap.elsewhere;
  const count = L(n === 1 ? 'reviewCountOne' : 'reviewCountMany', n);
  const tail = L(gap.here === 0 ? 'elsewhereYet' : 'elsewhereThose');
  return `<div class="card rp-empty rp-elsewhere">
    <h3>${escHtml(L('historyElsewhereTitle'))}</h3>
    <p>${escHtml(L('historyElsewhereBody', count, tail))}</p>
    <p>${escHtml(L('historyElsewhereHow'))}</p>
    <div class="toolbar">
      <button type="button" class="btn btn--secondary btn--sm" data-act="export-ledger">${escHtml(L('exportLedger'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="open-restore">${escHtml(L('restoreLedger'))}</button>
    </div>
  </div>`;
}

/** The whole stats screen as an HTML string. */
export async function renderStats() {
  const history = await loadHistory();
  const counts = perDay(history);
  const now = Date.now();
  const today = counts.get(dayKey(now)) || 0;
  const tot = totals(now);
  const retention = retentionAllTime(history);
  const gap = historyGap(history);

  const grid = heatGrid(counts, 18, now);
  const series = retentionSeries(history);

  // With scheduling state and no log at all, a streak of 0 and a recall of 0%
  // are not measurements, they are the absence of one. C12 A4: say so.
  const blind = gap.here === 0 && gap.elsewhere > 0;

  const cards = [
    viz.statGrid([
      { label: L('statDueNow'), value: tot.due },
      { label: L('statNew'), value: tot.fresh },
      { label: L('statCards'), value: tot.cards },
      { label: L('statReviewsToday'), value: blind ? 'n/a' : today },
      { label: L('statStreak'), value: blind ? 'n/a' : streak(counts, now) },
      { label: L('statRecall'), value: retention === null ? 'n/a' : `${retention}%` },
    ]),
  ];

  if (gap.elsewhere > 0) cards.push(historyElsewhereCard(gap));

  if (history.length === 0) {
    if (!blind) cards.push(viz.empty(L('noReviewsYet'), { title: L('reviewHistory') }));
  } else {
    cards.push(viz.heatmap(grid.grid, {
      title: L('heatTitle'),
      scale: L(gap.elsewhere > 0 ? 'countOnDevice' : 'countTotal', history.length),
      rows: weekdays(),
      cols: grid.cols,
      cell: 13,
      ariaLabel: L('heatAria'),
    }));
    cards.push(series.length >= 2
      ? viz.line([{ name: L('statRecall'), values: series }], {
        title: L('recallTitle'),
        scale: retention === null ? '' : L(gap.elsewhere > 0 ? 'recallOnDevice' : 'recallAllTime', retention),
        min: 0, max: 100, area: true,
        ariaLabel: L('recallAria'),
      })
      : viz.empty(L('recallNeedsTen'), { title: L('recallOverTime') }));
  }

  return `<div class="stack stack--tight">${cards.join('')}</div>`;
}

/** The inline trend beside a deck in the library. */
export function deckSpark(deckId, history) {
  const counts = perDay(history.filter((e) => e.deck === deckId));
  const values = [];
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - 29);
  for (let i = 0; i < 30; i += 1) {
    values.push(counts.get(dayKey(cursor.getTime())) || 0);
    cursor.setDate(cursor.getDate() + 1);
  }
  return values.some((v) => v > 0) ? viz.spark(values, { ariaLabel: L('reviewsOf', escHtml(deckName(state.decks[deckId], state.lang))) }) : '';
}
