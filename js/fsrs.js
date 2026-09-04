/**
 * FSRS-6, the arithmetic half. Pure functions, no DOM, no storage, no clock.
 *
 * Normative source: docs/delivery/research/srs-algorithm.md section B, which is
 * a transcription of fsrs-rs 6.6.2 (BSD-3-Clause). Not the wiki pages: the
 * researcher found they disagree with the code and with each other, and named
 * three specific disagreements. Reimplementing published formulas copies no
 * code, so no licence obligation travels with this file.
 *
 * Three facts that are silent wrong answers if you get them backwards. Each is
 * marked again at the line that depends on it.
 *
 *   1. r and both stability candidates come from the PRE-update difficulty.
 *      nextState() below is the only place a card is advanced, and it computes
 *      stability before difficulty for exactly this reason.
 *   2. The mean-reversion target is NOT clamped. init_difficulty(w, 4) is
 *      -4.7716 with the defaults, well outside the documented [1,10] band.
 *      Clamping it to 1 produces plausible intervals and is not FSRS-6.
 *   3. min(s_fail, S / exp(w17 * w18)) is new in FSRS-6. It is what stops a
 *      lapse ever raising stability. FSRS-4.5 has no equivalent.
 *
 * Checked by tools/test-scheduler.mjs against the computed checkpoints in the
 * research report. A scheduler nobody has checked against a number is a guess.
 */

/** The published FSRS-6 defaults, verbatim from fsrs-rs DEFAULT_PARAMETERS. */
export const DEFAULT_W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001,
  1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014,
  1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

export const S_MIN = 0.001;
export const S_MAX = 36500;
export const D_MIN = 1.0;
export const D_MAX = 10.0;

/** 1 Again, 2 Hard, 3 Good, 4 Easy. Hard is a PASSING grade. See B.2. */
export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}

/** DECAY = -w[20]. The FSRS-5 value was -0.5; FSRS-6 defaults to -0.1542. */
export function decayOf(w) {
  return -w[20];
}

/** FACTOR = exp(ln(0.9) / DECAY) - 1. 0.980346 with the defaults. */
export function factorOf(w) {
  return Math.exp(Math.log(0.9) / decayOf(w)) - 1;
}

/** R(t, S) = (1 + FACTOR * t / S) ^ DECAY. t is days since the last review. */
export function retrievability(t, s, w) {
  return Math.pow(1 + (factorOf(w) * t) / s, decayOf(w));
}

/**
 * I(S, DR) = S / FACTOR * (DR ^ (1 / DECAY) - 1), in days.
 * At DR 0.9 this collapses to I = S, which is the definition of stability.
 */
export function intervalDays(s, desiredRetention, w) {
  return (s / factorOf(w)) * (Math.pow(desiredRetention, 1 / decayOf(w)) - 1);
}

/** First review stability: S = w[G - 1]. */
export function initStability(w, g) {
  return clamp(w[g - 1], S_MIN, S_MAX);
}

/**
 * First review difficulty, RAW and unclamped: w[4] - exp(w[5] * (G - 1)) + 1.
 * For G = 4 this is -4.7716 with the defaults, and that raw value is what the
 * mean reversion in nextDifficulty() targets. Fact 2 above.
 */
export function initDifficultyRaw(w, g) {
  return w[4] - Math.exp(w[5] * (g - 1)) + 1;
}

/** First review difficulty as stored: the raw value clamped into [1, 10]. */
export function initDifficulty(w, g) {
  return clamp(initDifficultyRaw(w, g), D_MIN, D_MAX);
}

/** Linear damping plus mean reversion toward the UNCLAMPED easy target. */
export function nextDifficulty(w, d, g) {
  const deltaD = -w[6] * (g - 3);
  const damped = d + (deltaD * (10 - d)) / 9;
  const d0Easy = initDifficultyRaw(w, EASY); // fact 2: raw, never clamped here
  return clamp(w[7] * (d0Easy - damped) + damped, D_MIN, D_MAX);
}

/**
 * Next stability. Three branches, chosen by elapsed days and grade.
 * @param {number[]} w
 * @param {{ s: number, d: number, r: number, g: number, t: number }} o
 *   s, d and r are all PRE-update values. Fact 1 above.
 */
export function nextStability(w, { s, d, r, g, t }) {
  let out;
  if (t === 0) {
    // Same-day repeat. The max(sinc, 1) guard applies to passing grades only.
    const sinc = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19]);
    out = s * (g >= HARD ? Math.max(sinc, 1.0) : sinc);
  } else if (g === AGAIN) {
    const sFail =
      w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
    // Fact 3: the FSRS-6 cap. A lapse can never raise S.
    out = Math.min(sFail, s / Math.exp(w[17] * w[18]));
  } else {
    const hard = g === HARD ? w[15] : 1.0;
    const easy = g === EASY ? w[16] : 1.0;
    out =
      s *
      (Math.exp(w[8]) *
        (11 - d) *
        Math.pow(s, -w[9]) *
        (Math.exp((1 - r) * w[10]) - 1) *
        hard *
        easy +
        1);
  }
  return clamp(out, S_MIN, S_MAX);
}

/**
 * Advance one card's memory state by one answer.
 *
 * This is the ONLY function that produces a new (s, d) pair, and the ordering
 * inside it is the whole point: r and both stability candidates read the
 * pre-update difficulty, and difficulty is replaced afterwards. Fact 1.
 *
 * @param {number[]} w
 * @param {{ s: number, d: number }} card  s === 0 means never reviewed.
 * @param {number} g  1 to 4
 * @param {number} t  days elapsed since the last review, 0 for a same-day repeat
 * @returns {{ s: number, d: number, r: number }} r is the retrievability used.
 */
export function nextState(w, card, g, t) {
  if (!card || card.s === 0) {
    return { s: initStability(w, g), d: initDifficulty(w, g), r: 0 };
  }
  const s0 = card.s;
  const d0 = card.d;
  const r = retrievability(t, s0, w);
  const s = nextStability(w, { s: s0, d: d0, r, g, t }); // reads d0, before the update
  const d = nextDifficulty(w, d0, g);
  return { s, d, r };
}

/**
 * Accept a pasted parameter array. Lengths 17 and 19 are migrated the way
 * check_and_fill_parameters does in fsrs-rs model.rs; anything else is refused.
 * Length and finiteness are the only checks, per the research section G: the
 * clipper's own ceilings are computed from settings we ship fixed.
 * @returns {{ ok: true, w: number[] } | { ok: false, error: string }}
 */
export function migrateParams(input) {
  if (!Array.isArray(input)) return { ok: false, error: 'Not an array of numbers' };
  const w = input.map(Number);
  if (w.some((n) => !Number.isFinite(n))) {
    return { ok: false, error: 'Every value must be a finite number' };
  }
  if (w.length === 17) {
    w[4] += w[5] * 2;
    w[5] = Math.log(w[5] * 3 + 1) / 3;
    w[6] += 0.5;
    w.push(0.0, 0.0, 0.0, 0.5);
  } else if (w.length === 19) {
    w.push(0.0, 0.5);
  } else if (w.length !== 21) {
    return { ok: false, error: `Expected 17, 19 or 21 values, got ${w.length}` };
  }
  return { ok: true, w };
}

/** Parse a pasted array from text: JSON, or plain comma or space separated. */
export function parseParams(text) {
  const cleaned = String(text || '').trim().replace(/^\[|\]$/g, '');
  if (!cleaned) return { ok: false, error: 'Nothing pasted' };
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  return migrateParams(parts.map(Number));
}
