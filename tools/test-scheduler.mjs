#!/usr/bin/env node
/**
 * Scheduler checks. Plain node, no npm install, no test framework.
 *
 *   node tools/test-scheduler.mjs      # from inside projects/rappel-site
 *   make validate
 *
 * Every expected number below is quoted from docs/delivery/research/
 * srs-algorithm.md, which computed them from fsrs-rs 6.6.2. They are the whole
 * point of this file: a scheduler nobody has checked against a number is a
 * guess, and the four named porting bugs all produce plausible intervals.
 *
 * The site is zero-build: package.json exists only so `npx convex dev --once`
 * will run (C12 A7), and its "type": "module" is what lets this file import the
 * browser modules under js/ without a second copy of them.
 */

import {
  DEFAULT_W, decayOf, factorOf, retrievability, intervalDays,
  initStability, initDifficulty, initDifficultyRaw, nextDifficulty,
  nextStability, nextState, migrateParams, parseParams,
} from '../js/fsrs.js';
import {
  answer, defaultScheduler, newCard, elapsedDays, dayStart, nextDayStart,
  reviewIntervalDays, REVIEW, LEARNING, RELEARNING,
} from '../js/scheduler.js';

const TOL = 1e-4;
let pass = 0;
const fails = [];

function near(label, got, want, tol = TOL) {
  const ok = Number.isFinite(got) && Math.abs(got - want) <= tol;
  report(ok, label, `${fmt(got)} (want ${fmt(want)} +/- ${tol})`);
}
function eq(label, got, want) {
  report(Object.is(got, want) || got === want, label, `${fmt(got)} (want ${fmt(want)})`);
}
function ok_(label, cond, detail) {
  report(!!cond, label, detail);
}
function report(ok, label, detail) {
  if (ok) { pass += 1; console.log(`  ok   ${label}  ${detail}`); }
  else { fails.push(label); console.log(`  FAIL ${label}  ${detail}`); }
}
function fmt(v) {
  return typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(6) : String(v);
}

const w = DEFAULT_W;
const sched = defaultScheduler();

console.log('\nB.3 constants');
eq('w has 21 entries', w.length, 21);
near('DECAY is -w[20]', decayOf(w), -0.1542);
near('FACTOR with defaults', factorOf(w), 0.980346);
const w5 = [...w]; w5[20] = 0.5;
near('FSRS-5 FACTOR is 19/81', factorOf(w5), 19 / 81, 1e-9);

console.log('\nB.4 retrievability and interval');
near('at DR 0.90, I = S exactly', intervalDays(1, 0.9, w), 1.0, 1e-9);
near('at DR 0.95, I = 0.4026 * S', intervalDays(1, 0.95, w), 0.4026);
near('at DR 0.85, I = 1.9064 * S', intervalDays(1, 0.85, w), 1.9064);
near('at DR 0.80, I = 3.3160 * S', intervalDays(1, 0.80, w), 3.3160);
near('R(0, S) is 1', retrievability(0, 5, w), 1, 1e-12);
near('R(S, S) is 0.9 by construction', retrievability(5, 5, w), 0.9, 1e-9);
ok_('R falls as t grows', retrievability(10, 5, w) < retrievability(1, 5, w),
    `${fmt(retrievability(10, 5, w))} < ${fmt(retrievability(1, 5, w))}`);

console.log('\nB.5 first review');
near('S0 Again is w[0]', initStability(w, 1), 0.212);
near('S0 Hard is w[1]', initStability(w, 2), 1.2931);
near('S0 Good is w[2]', initStability(w, 3), 2.3065);
near('S0 Easy is w[3]', initStability(w, 4), 8.2956);
near('D0 Again', initDifficulty(w, 1), 6.4133);
near('D0 Hard', initDifficulty(w, 2), 5.1122);
near('D0 Good', initDifficulty(w, 3), 2.1181);
near('D0 Easy is clamped to 1.0', initDifficulty(w, 4), 1.0);
near('D0 Easy RAW is -4.7716, not clamped', initDifficultyRaw(w, 4), -4.7716);
eq('a first Good schedules 2 days', reviewIntervalDays(initStability(w, 3), sched), 2);

console.log('\nBug 2: the mean reversion target is not clamped');
// With D at the floor and w[7] = 0.001 the pull is tiny but its SIGN is the
// tell. Against the raw -4.7716 target, difficulty is dragged DOWN below the
// damped value. Against a target clamped to 1.0 with D already at 1.0 the pull
// would be exactly zero, so the two implementations disagree at D = 1.
const dAtFloor = nextDifficulty(w, 1.0, 3);
const damped1 = 1.0 + -w[6] * (3 - 3) * (10 - 1.0) / 9;
ok_('at D = 1 the raw target still pulls', dAtFloor !== damped1 || dAtFloor === 1.0,
    `next(1.0, Good) = ${fmt(dAtFloor)}`);
const dMid = nextDifficulty(w, 5.0, 3);
const dMidClampedTarget = 0.001 * (1.0 - 5.0) + 5.0; // the wrong implementation
ok_('D(5, Good) differs from the clamped-target answer',
    Math.abs(dMid - dMidClampedTarget) > 1e-6,
    `${fmt(dMid)} vs wrong ${fmt(dMidClampedTarget)}`);
near('D(5, Good) uses the -4.7716 target', dMid, 0.001 * (initDifficultyRaw(w, 4) - 5.0) + 5.0, 1e-9);

console.log('\nBug 1: r and both S candidates read the PRE-update difficulty');
{
  const card = { s: 10, d: 5 };
  const t = 8;
  const r = retrievability(t, card.s, w);
  const right = nextStability(w, { s: card.s, d: card.d, r, g: 3, t });
  const dPost = nextDifficulty(w, card.d, 3);
  const wrong = nextStability(w, { s: card.s, d: dPost, r, g: 3, t });
  const got = nextState(w, card, 3, t);
  ok_('the two orderings really do differ', Math.abs(right - wrong) > 1e-9,
      `pre-D ${fmt(right)} vs post-D ${fmt(wrong)}`);
  near('nextState matches the pre-update-D answer', got.s, right, 1e-12);
  ok_('nextState does not match the post-update-D answer', Math.abs(got.s - wrong) > 1e-9,
      `${fmt(got.s)} != ${fmt(wrong)}`);
}

console.log('\nBug 3: a lapse can never raise stability');
{
  let raised = 0;
  for (const s of [0.5, 2, 10, 60, 400, 3000]) {
    for (const d of [1, 3, 5, 7, 10]) {
      for (const t of [1, 3, 30, 400]) {
        const r = retrievability(t, s, w);
        const next = nextStability(w, { s, d, r, g: 1, t });
        if (next > s + 1e-12) raised += 1;
      }
    }
  }
  eq('over 120 lapse cases, none raised S', raised, 0);
  // A card failed on first sight and not seen again for a year: S is tiny, r
  // has decayed, and the raw post-lapse formula would RAISE stability. This is
  // the case the FSRS-6 cap exists for, and deleting the cap fails here.
  const s = 0.212, d = 1, t = 365;
  const r = retrievability(t, s, w);
  const sFail = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
  const cap = s / Math.exp(w[17] * w[18]);
  ok_('without the cap, s_fail would raise S above the cap', sFail > cap && sFail > s,
      `s_fail ${fmt(sFail)} > cap ${fmt(cap)}, S was ${s}`);
  near('nextStability takes the cap', nextStability(w, { s, d, r, g: 1, t }), cap, 1e-9);
}

console.log('\nB.2 Hard is a passing grade');
{
  const card = { s: 10, d: 5 };
  const hard = nextState(w, card, 2, 10);
  const again = nextState(w, card, 1, 10);
  ok_('Hard raises S while Again lowers it', hard.s > card.s && again.s < card.s,
      `Hard ${fmt(hard.s)}, Again ${fmt(again.s)}, from ${card.s}`);
}

console.log('\nB.8 pasted parameter arrays');
{
  const short17 = Array.from({ length: 17 }, (_, i) => i + 1);
  const m17 = migrateParams(short17);
  ok_('17 values migrate to 21', m17.ok && m17.w.length === 21, m17.ok ? '21' : m17.error);
  near('w[4] += w[5] * 2', m17.w[4], 5 + 6 * 2, 1e-12);
  near('w[5] = ln(w[5] * 3 + 1) / 3', m17.w[5], Math.log(6 * 3 + 1) / 3, 1e-12);
  near('w[6] += 0.5', m17.w[6], 7 + 0.5, 1e-12);
  near('the tail is 0, 0, 0, 0.5', m17.w[20], 0.5, 1e-12);
  const m19 = migrateParams(Array.from({ length: 19 }, () => 1));
  ok_('19 values migrate to 21', m19.ok && m19.w.length === 21 && m19.w[20] === 0.5, 'ok');
  ok_('18 values are refused', migrateParams(Array.from({ length: 18 }, () => 1)).ok === false, 'refused');
  ok_('a non-finite value is refused',
      migrateParams([...Array(20).fill(1), Number.NaN]).ok === false, 'refused');
  ok_('a pasted 21-float line parses', parseParams(DEFAULT_W.join(', ')).ok === true, 'ok');
  ok_('an empty paste is refused', parseParams('   ').ok === false, 'refused');
}

console.log('\nC.2 learning steps, from the clock and nothing else');
{
  const now = Date.UTC(2026, 8, 4, 12, 0, 0);
  const first = answer(null, 3, now, sched);
  eq('a new card answered Good enters learning', first.card.st, LEARNING);
  eq('and is due at the second step, 600s out', first.card.due - now, 600 * 1000);
  eq('step index 1 is persisted, not held in memory', first.card.step, 1);
  eq('the log entry records the pre-review state', first.log.st0, 'new');
  eq('the log entry records the pre-review S', first.log.s0, 0);

  const second = answer(first.card, 3, now + 600 * 1000, sched);
  eq('a second Good exhausts the steps and graduates', second.card.st, REVIEW);
  ok_('and lands on a day boundary at the rollover hour',
      new Date(second.card.due).getHours() === 4, new Date(second.card.due).toString());

  const easy = answer(null, 4, now, sched);
  eq('Easy graduates a new card immediately', easy.card.st, REVIEW);

  const againOnNew = answer(null, 1, now, sched);
  eq('Again on a new card sits on the first step, 60s out', againOnNew.card.due - now, 60 * 1000);

  const hardStays = answer(first.card, 2, now + 5000, sched);
  eq('Hard repeats the same step index', hardStays.card.step, first.card.step);

  const reviewing = { ...newCard(), s: 20, d: 5, st: REVIEW, lr: now - 20 * 86400000, reps: 4 };
  const lapse = answer(reviewing, 1, now, sched);
  eq('a lapse out of review enters relearning', lapse.card.st, RELEARNING);
  eq('and counts against lapses', lapse.card.lapses, 1);
  eq('and is due after the first relearn step', lapse.card.due - now, 600 * 1000);
  ok_('and its stability did not rise', lapse.card.s <= reviewing.s,
      `${fmt(lapse.card.s)} <= ${reviewing.s}`);

  const blank = { ...sched, relearn_steps: [] };
  const lapseBlank = answer(reviewing, 1, now, blank);
  ok_('blank relearn steps wait at least a day, never NaN',
      Number.isFinite(lapseBlank.card.due) && lapseBlank.card.due > now + 3600 * 1000,
      new Date(lapseBlank.card.due).toISOString());
}

console.log('\nDay boundaries');
{
  const at0300 = Date.UTC(2026, 8, 4, 3, 0, 0);
  const local0300 = new Date(2026, 8, 4, 3, 0, 0).getTime();
  ok_('03:00 belongs to the previous study day',
      dayStart(local0300, 4) < local0300 && new Date(dayStart(local0300, 4)).getDate() === 3,
      new Date(dayStart(local0300, 4)).toString());
  ok_('the next study day is the same calendar day at 04:00',
      new Date(nextDayStart(local0300, 4)).getHours() === 4, new Date(nextDayStart(local0300, 4)).toString());
  // elapsedDays counts study-day rollovers (04:00), as Anki does, not 24 h chunks.
  const D = (...a) => new Date(...a).getTime();
  eq('same study day, 09:00 to 23:00, is 0 days', elapsedDays(D(2026, 0, 5, 9), D(2026, 0, 5, 23)), 0);
  eq('22:00 to 08:00 the next morning is 1 study day, not 0', elapsedDays(D(2026, 0, 5, 22), D(2026, 0, 6, 8)), 1);
  eq('a day and a half from 10:00 crosses one rollover: 1 day', elapsedDays(D(2026, 0, 5, 10), D(2026, 0, 6, 22)), 1);
  eq('03:00 to 15:00 the day after next crosses two rollovers: 2 days', elapsedDays(at0300, at0300 + 129600 * 1000), 2);
  eq('an earlier hour than last time still counts whole days', elapsedDays(D(2026, 0, 5, 20), D(2026, 0, 8, 9)), 3);
  eq('a null last review is 0 days', elapsedDays(0, at0300), 0);
}

console.log('\nEnd to end: a card answered Good five times keeps growing');
{
  let card = null;
  let now = Date.UTC(2026, 8, 4, 12, 0, 0);
  const gaps = [];
  for (let i = 0; i < 7; i += 1) {
    const res = answer(card, 3, now, sched);
    card = res.card;
    gaps.push(Math.round((card.due - now) / 86400000));
    now = card.due;
  }
  ok_('intervals are non-decreasing once out of learning',
      gaps.slice(3).every((g, i, a) => i === 0 || g >= a[i - 1]), gaps.join(', '));
  ok_('stability grew', card.s > 2.3065, fmt(card.s));
  ok_('reps counted every answer', card.reps === 7, String(card.reps));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  failed: ${f}`));
  process.exit(1);
}
