/**
 * The card state machine: learning steps, lapses, and the absolute due stamp.
 *
 * Design source: docs/delivery/research/srs-algorithm.md section C.2.
 *
 * A page can be closed mid-step, so NOTHING here holds a step in memory. Every
 * answer writes an absolute `due` timestamp and a persisted `step` index, and
 * every queue decision is a comparison against the clock. Close the tab on the
 * 10 minute step and the card is still due 10 minutes after you answered it.
 *
 * Three deliberate simplifications against Anki, each recorded in C.2:
 *   1. Steps are relative to `now`, not to a queue. The one lookahead is
 *      the session's: a learning card is shown up to LEARN_AHEAD_MS early
 *      (js/session.js), never the scheduler's.
 *   2. No remaining_steps counter, just the persisted step index.
 *   3. The day rollover is one configurable hour, defaulting to Anki's 04:00.
 */

import { DEFAULT_W, clamp, intervalDays, nextState, AGAIN, GOOD, EASY } from './fsrs.js';

export const NEW = 'new';
export const LEARNING = 'learning';
export const REVIEW = 'review';
export const RELEARNING = 'relearning';

const DAY_MS = 86400000;

/** The scheduler block of a neo-ledger/1 document, with the published defaults. */
export function defaultScheduler() {
  return {
    name: 'fsrs',
    version: 6,
    w: [...DEFAULT_W],
    desired_retention: 0.9,
    maximum_interval: 36500,
    learn_steps: [60, 600],
    relearn_steps: [600],
    day_start_hour: 4,
  };
}

/** A never-reviewed card row. s === 0 is the sentinel, per B.1. */
export function newCard() {
  return { s: 0, d: 0, due: 0, lr: 0, reps: 0, lapses: 0, st: NEW, step: 0 };
}

/** The start of the study day containing `ts`, using a rollover hour. */
export function dayStart(ts, hour = 4) {
  const d = new Date(ts);
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0);
  if (d.getTime() < s.getTime()) s.setDate(s.getDate() - 1);
  return s.getTime();
}

/** The start of the next study day after `ts`. */
export function nextDayStart(ts, hour = 4) {
  return addDays(dayStart(ts, hour), 1);
}

/**
 * Add whole CALENDAR days, not n * 86400000.
 *
 * A fixed-millisecond add walks the due stamp across a daylight-saving change
 * and lands an hour off the rollover, which then puts a card on the wrong side
 * of the day boundary twice a year. setDate keeps the local wall clock.
 */
export function addDays(ts, n) {
  const d = new Date(ts);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/**
 * Whole STUDY days between two stamps, as Anki and FSRS count them: the number
 * of day-start rollovers crossed, not 24-hour chunks. A card answered at 22:00
 * and again at 08:00 the next morning has waited one day, so it takes the
 * recall branch; floored real time would call that 0 and route it into the
 * short-term branch, and a review taken earlier in the day than the last one
 * would read as interval minus one. Same-day repeats are still 0. Rounded, not
 * floored, so a daylight-saving shift between two day starts still counts one.
 */
export function elapsedDays(from, to, hour = 4) {
  if (!from) return 0;
  return Math.max(0, Math.round((dayStart(to, hour) - dayStart(from, hour)) / DAY_MS));
}

/**
 * Answer one card.
 *
 * Returns a NEW card row plus the log entry the ledger appends. It never
 * mutates its input, so a caller can compute a preview interval for every
 * grade without touching stored state, which is what the four button labels do.
 *
 * @param {object} card  a card row, or null for a never-seen card
 * @param {number} grade 1 to 4
 * @param {number} now   ms
 * @param {object} sched a scheduler block from defaultScheduler()
 * @returns {{ card: object, log: object }}
 */
export function answer(card, grade, now, sched) {
  const c = { ...newCard(), ...(card || {}) };
  const w = sched.w;
  const hour = sched.day_start_hour ?? 4;
  const t = elapsedDays(c.lr, now, hour);

  const before = { s: c.s, d: c.d, st: c.st };
  const memory = nextState(w, c, grade, t);

  const out = {
    ...c,
    s: memory.s,
    d: memory.d,
    reps: c.reps + 1,
    lr: now,
  };
  const log = {
    t: now,
    g: grade,
    s0: before.s,
    d0: before.d,
    el: t,
    st0: before.st,
  };

  const steps =
    before.st === RELEARNING || before.st === REVIEW ? sched.relearn_steps : sched.learn_steps;

  // A lapse out of review restarts the relearning ladder.
  if (before.st === REVIEW && grade === AGAIN) {
    out.lapses = c.lapses + 1;
    out.st = RELEARNING;
    out.step = 0;
    if (steps.length > 0) {
      out.due = now + steps[0] * 1000;
      return { card: out, log };
    }
    // Blank relearning steps: the card waits for the FSRS interval, minimum a
    // day. Anki's documented behaviour for an empty step list.
    out.due = scheduleReview(out.s, now, sched, hour);
    return { card: out, log };
  }

  if (before.st === NEW || before.st === LEARNING || before.st === RELEARNING) {
    if (before.st === NEW) out.st = LEARNING;
    if (grade === AGAIN) out.step = 0;
    else if (grade === EASY) out.st = REVIEW; // Easy always graduates
    else out.step = c.step + (grade === GOOD ? 1 : 0); // Hard repeats the step

    if (out.st !== REVIEW && out.step < steps.length) {
      out.due = now + steps[out.step] * 1000;
      return { card: out, log };
    }
    out.st = REVIEW; // steps exhausted
  }

  out.st = REVIEW;
  out.step = 0;
  out.due = scheduleReview(out.s, now, sched, hour);
  return { card: out, log };
}

/** Days to the next review, clamped to [1, maximum_interval]. */
export function reviewIntervalDays(s, sched) {
  const days = Math.round(intervalDays(s, sched.desired_retention, sched.w));
  return clamp(days, 1, sched.maximum_interval);
}

function scheduleReview(s, now, sched, hour) {
  const days = reviewIntervalDays(s, sched);
  return addDays(nextDayStart(now, hour), days - 1);
}

/**
 * What each of the four buttons would do, as text, without changing anything.
 * Hard is a passing grade (B.2) and the labels have to make that unmissable,
 * so the caller renders these beside words, never alone.
 */
export function previewIntervals(card, now, sched) {
  return [1, 2, 3, 4].map((g) => {
    const { card: next } = answer(card, g, now, sched);
    return { grade: g, due: next.due, st: next.st };
  });
}

/** A short human string for a gap in ms. "10m", "2d", "1.4mo". */
export function humanGap(ms) {
  if (!Number.isFinite(ms)) return '';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = s / 3600;
  if (h < 24) return `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)}h`;
  const d = s / 86400;
  if (d < 30) return `${d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)}d`;
  const mo = d / 30.4375;
  if (mo < 12) return `${mo.toFixed(1).replace(/\.0$/, '')}mo`;
  return `${(d / 365.25).toFixed(1).replace(/\.0$/, '')}y`;
}

/** true when this card is answerable right now. */
export function isDue(card, now) {
  if (!card || card.st === NEW || card.s === 0) return true;
  return card.due <= now;
}
