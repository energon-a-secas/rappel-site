/**
 * Input transforms and answer comparison. Contracts C2.4 and C4.3 amendment 3,
 * amended by C12 A17.
 *
 * A typed template may name a `transform`, which converts what the learner
 * types as they type it, and a `compare`, which decides how the produced string
 * is graded. They are separate axes on purpose: a kana deck wants romaji input
 * converted to kana, and it also wants both sides normalised before comparing.
 *
 * Rappel ships exactly two transforms, `kana` and `kana-katakana`, and a deck
 * may name only those.
 *
 * The romaji engine is wanakana 5.3.1, vendored at js/vendor/wanakana.js with
 * its licence header. It is not reimplemented here: it handles gemination,
 * terminal n, the small kana and every table-2 spelling, and a hand-rolled
 * table would be a worse copy of it. It is 62.6 KB, so it is imported lazily
 * on the first deck that needs it rather than at boot, which is what
 * js/vendor/README.md asks for.
 *
 * A transform has two halves (C12 A16, A17): the live one runs per keystroke
 * and must leave an unfinished syllable alone, and settle runs once at submit
 * and finishes it. Both are needed, and neither does the other's job:
 *
 *   shinbun  live leaves しんぶn, because n could still become na. settle ends it.
 *   onna     live must produce おんな, because settle sees only what is in the box.
 *
 * The reader below is copied from
 * projects/runcible-site/books/japanese/exercises/kana-input.js (kanaReader),
 * not imported: the two sites are separately deployed origins whose only
 * coupling is the embed contract (C6), and eleven lines are not worth breaking
 * that. Why it is not wanakana's own IMEMode, measured on the vendored 5.3.1:
 * IMEMode reads "nn" as a finished ん, so onna typed o-n-n-a lands as おんあ and
 * konnichiha as こんいちは, and no settle step can recover them because the
 * romaji they came from is gone. Holding the trailing run of n keeps it
 * revisable, and n is the only thing that ever needs holding: it is the one
 * kana that stands without a vowel. Every other unfinished cluster, k, sh, ky,
 * is left alone by the plain reader already.
 */

let wk = null;
let loading = null;

/** Load the romaji engine. Safe to call repeatedly; it loads once. */
export function ensureTransforms() {
  if (wk) return Promise.resolve(wk);
  if (!loading) {
    loading = import('./vendor/wanakana.js')
      .then((m) => { wk = m; return m; })
      .catch(() => { loading = null; return null; });
  }
  return loading;
}

/** True once the romaji engine is in memory. */
export function transformsReady() {
  return wk !== null;
}

/**
 * Katakana to hiragana as a code point shift.
 *
 * This is not a second romaji engine, it is one arithmetic shift, and it is
 * here rather than in wanakana because the `kana` compare token runs inside
 * grading, which is synchronous. Making it async would make answersMatch async
 * and that would reach the renderer.
 */
export function kataToHira(text) {
  return String(text || '').replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCodePoint(ch.codePointAt(0) - 0x60));
}

/** The transform registry. A deck may name only these ids. C4.3 amendment 3. */
export const TRANSFORM_IDS = Object.freeze(['kana', 'kana-katakana']);

/** A trailing n, nn or ny is not a syllable yet: na, nna and nya are all still open. */
const PENDING = /n+y?$/i;

/** Two or more n in front of anything that is not a vowel are one ん. */
const DOUBLED_N = /n{2,}(?![aiueoy])/gi;

function converter(id) {
  return id === 'kana-katakana' ? wk.toKatakana : wk.toHiragana;
}

/**
 * The live half: convert the box except for a trailing run of n, which stays
 * as typed so the next keystroke can still turn it into na, nna or nya.
 * Re-running it over text that is already kana is a no-op, which is what lets
 * the whole box be converted on every keystroke.
 */
function live(id, raw) {
  const text = String(raw ?? '');
  const pending = PENDING.exec(text);
  const head = pending ? text.slice(0, pending.index) : text;
  return converter(id)(head.replace(DOUBLED_N, 'n')) + (pending ? pending[0] : '');
}

/**
 * Bind an input to live romaji conversion. The caret moves to the end after a
 * conversion, which is where it already is for the short answers a card asks.
 */
export function bindInput(el, id) {
  if (!el || !id || !TRANSFORM_IDS.includes(id)) return false;
  if (!wk) {
    ensureTransforms().then(() => bindInput(el, id));
    return false;
  }
  const data = el.dataset || (el.dataset = {});
  if (data.kanaBound) return true;
  data.kanaBound = id;
  el.addEventListener('input', () => {
    const next = live(id, el.value);
    if (next === el.value) return;
    el.value = next;
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(next.length, next.length);
  });
  return true;
}

/**
 * The settle half, run once on a submitted answer: a trailing run of n is one
 * ん, a doubled n in front of a consonant is one n, and then the plain
 * conversion finishes whatever the live half held back. A no-op on text that
 * is already kana.
 */
export function applyTransform(id, raw) {
  const text = String(raw ?? '');
  if (!id || !TRANSFORM_IDS.includes(id)) return text;
  if (!wk) {
    ensureTransforms();
    return text;
  }
  return converter(id)(text.replace(/n+$/i, 'n').replace(DOUBLED_N, 'n'));
}

/**
 * Normalise one side of a comparison. Tokens are pipe separated and applied in
 * the order written. C2.4. Default is `trim|casefold`.
 */
export function normalise(text, compare = 'trim|casefold') {
  let out = String(text ?? '');
  for (const token of String(compare || '').split('|')) {
    switch (token) {
      case 'trim': out = out.trim(); break;
      case 'casefold': out = out.toLowerCase(); break;
      case 'strip-accents': out = out.normalize('NFD').replace(/[̀-ͯ]/g, ''); break;
      case 'collapse-space': out = out.replace(/\s+/g, ' ').trim(); break;
      case 'kana': out = kataToHira(out); break;
      default: break;
    }
  }
  return out;
}

/** true when a typed answer matches the expected string under `compare`. */
export function answersMatch(typed, expected, compare) {
  return normalise(typed, compare) === normalise(expected, compare);
}
