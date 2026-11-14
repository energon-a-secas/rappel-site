/* ══════════════════════════════════════════════════════════════
 * @neorgon/ui, Viz Kit v2: formats, nice ticks, colours and words
 *
 * Pure: no DOM, no globals beyond the shared colour map, so Node tests
 * import this file directly. viz.js re-exports everything here.
 *
 * Formats (one name drives ticks, labels and tooltips alike):
 *   number      up to 2 decimals, grouped           4,600.67
 *   int         rounded, grouped                     25,812
 *   usd         cents, sign first                    -$25.89, <$0.01
 *   usdWhole    whole dollars                        $30,539, <$1
 *   usdCompact  3 significant digits                 $4.6k, $1.2M
 *   compact     3 significant digits                 39.2B, 616M, 838k
 *   pct         a number already in percent          15.1%, <0.1%
 *   share       a fraction, shown as a percent       0.151 -> 15.1%
 *   multiple    a ratio                              103x, 7.3x (with the sign x)
 *   day         a date                               31 May
 *   month       a date                               May 2026
 *   a function  (value) => string, for anything else
 * Unknown (null, undefined, NaN) is never 0: it prints the unknown word.
 * ════════════════════════════════════════════════════════════ */

export const PALETTE = [
  'var(--viz-c1)', 'var(--viz-c2)', 'var(--viz-c3)', 'var(--viz-c4)',
  'var(--viz-c5)', 'var(--viz-c6)', 'var(--viz-c7)', 'var(--viz-c8)',
];

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const paletteAt = (i, colors) => (colors || PALETTE)[i % (colors || PALETTE).length];

/* ── Words ─────────────────────────────────────────────────── */
const WORDS = {
  en: {
    unknown: 'unknown', none: 'none', up: 'up', down: 'down', flat: 'no change',
    total: 'Total', edited: 'edited', loading: 'Loading', error: 'unavailable',
    noData: 'No data', loadError: 'Could not load data', ofBaseline: 'of the baseline', notInTotal: 'The total leaves out {w} parts', months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  es: {
    unknown: 'sin dato', none: 'nada', up: 'sube', down: 'baja', flat: 'sin cambio',
    total: 'Total', edited: 'editado', loading: 'Cargando', error: 'no disponible',
    noData: 'Sin datos', loadError: 'No se pudieron cargar los datos', ofBaseline: 'de la base', notInTotal: 'El total no incluye las partes {w}', months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
  },
};

/** 'es' or 'en', from o.lang, else the page's <html lang>, read at call time. */
export function langOf(o = {}) {
  const page = typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : '';
  return String(o.lang || page || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}
export const word = (key, o = {}) => WORDS[langOf(o)][key];
const locale = (o) => (langOf(o) === 'es' ? 'es-CL' : 'en-US');

/** The word an unknown value prints: o.unknown when given, else "unknown". */
export const unknownWord = (o = {}) => (o.unknown != null && o.unknown !== true ? String(o.unknown) : word('unknown', o));

/** Middle-truncate past max characters; the caller keeps the full name in a title and an aria-label. */
export function truncateMiddle(s, max = 28) {
  const chars = Array.from(String(s ?? ''));
  if (chars.length <= max) return chars.join('');
  const keep = max - 1;
  const head = Math.ceil(keep / 2), tail = Math.floor(keep / 2);
  return `${chars.slice(0, head).join('')}…${chars.slice(chars.length - tail).join('')}`;
}

/* ── Numbers ───────────────────────────────────────────────── */
const isKnown = (v) => v != null && !(typeof v === 'number' && !Number.isFinite(v));
const NUMERIC = /^-?\d+(\.\d+)?(e-?\d+)?$/i;

/** Format with fixed or ranged decimals in the page's locale. */
function num(v, o, min, max) {
  return v.toLocaleString(locale(o), { minimumFractionDigits: min, maximumFractionDigits: max });
}
/** Trim to at most 3 significant digits' worth of decimals: 1.04, 39.2, 616. */
const sigDecimals = (n) => (n < 10 ? 2 : n < 100 ? 1 : 0);

const UNITS = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'k']];

function compact(v, o) {
  const a = Math.abs(v), sign = v < 0 ? '-' : '';
  for (let i = 0; i < UNITS.length; i++) {
    const [u, sfx] = UNITS[i];
    if (a < u) continue;
    let n = a / u;
    let d = sigDecimals(n);
    let r = +n.toFixed(d);
    if (r >= 1000 && i > 0) { // 999,950 rounds to 1000k: move up a unit
      const [u2, s2] = UNITS[i - 1];
      n = a / u2; d = sigDecimals(n); r = +n.toFixed(d);
      return `${sign}${num(r, o, 0, d)}${s2}`;
    }
    return `${sign}${num(r, o, 0, d)}${sfx}`;
  }
  const d = a === 0 ? 0 : sigDecimals(a);
  const r = +a.toFixed(d);
  return r === 0 ? '0' : `${sign}${num(r, o, 0, d)}`;
}

function usd(v, decimals, o) {
  const a = Math.abs(v);
  if (a > 0 && decimals === 2 && a < 0.005) return v > 0 ? '<$0.01' : '>-$0.01';
  if (a > 0 && decimals === 0 && a < 0.5) return v > 0 ? '<$1' : '>-$1';
  const rounded = +a.toFixed(decimals);
  const sign = v < 0 && rounded !== 0 ? '-' : '';
  return `${sign}$${num(rounded, o, decimals, decimals)}`;
}

function percent(p, o) {
  const a = Math.abs(p);
  if (a > 0 && a < 0.05) return p > 0 ? '<0.1%' : '>-0.1%';
  const r = +p.toFixed(1);
  return `${r === 0 ? '0' : num(r, o, 0, 1)}%`;
}

function multiple(v, o) {
  const a = Math.abs(v);
  const d = a >= 100 ? 0 : 1;
  return `${num(+v.toFixed(d), o, 0, d)}×`;
}

/* ── Dates ─────────────────────────────────────────────────── */
/**
 * Calendar parts of a date. A 'YYYY-MM-DD' (or 'YYYY-MM') string is read as
 * written, with no time zone; a Date or a millisecond timestamp is read in
 * local time. Returns null for anything else.
 */
export function dateParts(v) {
  if (v instanceof Date) return Number.isNaN(+v) ? null : { y: v.getFullYear(), m: v.getMonth(), d: v.getDate() };
  if (typeof v === 'string') {
    const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(v);
    return m ? { y: +m[1], m: +m[2] - 1, d: m[3] ? +m[3] : 1 } : null;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const dt = new Date(v);
    return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
  }
  return null;
}
const dayText = (p, o) => `${p.d} ${WORDS[langOf(o)].months[p.m]}`;
const monthText = (p, o) => `${WORDS[langOf(o)].months[p.m]} ${p.y}`;

/**
 * One value as text. format is a name from the list above or a function.
 * A string that is not a number passes through unchanged (legacy statGrid
 * values such as '18 km' or 'n/a').
 */
export function formatValue(v, format = 'number', o = {}) {
  if (!isKnown(v)) return unknownWord(o);
  if (typeof format === 'function') return String(format(v));
  if (format === 'day' || format === 'month') {
    const p = dateParts(v);
    if (!p) return String(v);
    return format === 'day' ? dayText(p, o) : monthText(p, o);
  }
  if (typeof v === 'string') {
    if (!NUMERIC.test(v.trim())) return v;
    v = Number(v);
  }
  if (typeof v !== 'number') return String(v);
  switch (format) {
    case 'usd': return usd(v, 2, o);
    case 'usdWhole': return usd(v, 0, o);
    case 'usdCompact': {
      const a = Math.abs(v);
      if (a < 1000) return usd(v, a >= 100 || Number.isInteger(v) ? 0 : 2, o);
      return `${v < 0 ? '-' : ''}$${compact(a, o)}`;
    }
    case 'compact': return compact(v, o);
    case 'pct': return percent(v, o);
    case 'share': return percent(v * 100, o);
    case 'multiple': return multiple(v, o);
    case 'int': return num(Math.round(v), o, 0, 0);
    default: return num(+v.toFixed(2), o, 0, 2);
  }
}

/** A signed value: +$42.69, -$25.89, +10.0%, 0. */
export function formatSigned(v, format = 'number', o = {}) {
  if (!isKnown(v)) return unknownWord(o);
  const n = Number(v);
  const text = formatValue(n, format, o);
  return n > 0 && !text.startsWith('<') ? `+${text}` : text;
}

/* ── Nice ticks ────────────────────────────────────────────── */
const STEPS = [1, 2, 2.5, 5];

/** Decimals needed to write multiples of step exactly (capped at 12). */
export function stepDecimals(step) {
  for (let d = 0; d <= 12; d++) if (Math.abs(Math.round(step * 10 ** d) - step * 10 ** d) < 1e-6) return d;
  return 12;
}
/** Drop floating-point noise (0.30000000000000004) at any magnitude. */
const clean = (v) => +v.toPrecision(12);

/**
 * Nice ticks: steps of 1, 2, 2.5 or 5 times a power of ten, at most `count`
 * intervals. Free ends are rounded out to the next step (the maximum up, the
 * minimum down); a fixed end stays where it was put and the ticks stop inside
 * it, so a caller's own nice maximum is never rounded twice.
 *
 * @returns {{min:number, max:number, step:number, ticks:number[]}}
 */
export function niceTicks(lo, hi, { count = 5, fixedMin = false, fixedMax = false, integer = false } = {}) {
  lo = Number(lo); hi = Number(hi);
  if (!Number.isFinite(lo)) lo = 0;
  if (!Number.isFinite(hi)) hi = lo + 1;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi === lo) {
    if (fixedMin && fixedMax) return { min: lo, max: hi, step: 1, ticks: [lo] };
    if (hi === 0) hi = 1;
    else if (hi > 0) { if (!fixedMin) lo = Math.min(0, lo); if (hi === lo) hi = lo + Math.abs(lo || 1); }
    else if (!fixedMax) hi = 0;
    else lo = hi - Math.abs(hi);
  }
  count = Math.max(1, Math.floor(count));
  const span = hi - lo;
  let e = Math.floor(Math.log10(span / count)) - 1;
  for (let guard = 0; guard < 40; guard++, e++) {
    for (const m of STEPS) {
      const step = m * 10 ** e;
      if (integer && step < 1) continue;
      const kLo = fixedMin ? Math.ceil(lo / step - 1e-9) : Math.floor(lo / step + 1e-9);
      const kHi = fixedMax ? Math.floor(hi / step + 1e-9) : Math.ceil(hi / step - 1e-9);
      if (kHi - kLo > count) continue;
      const min = fixedMin ? lo : clean(kLo * step);
      const max = fixedMax ? hi : clean(kHi * step);
      const ticks = [];
      for (let k = kLo; k <= kHi; k++) ticks.push(clean(k * step));
      return { min, max, step: clean(step), ticks };
    }
  }
  return { min: lo, max: hi, step: span, ticks: [lo, hi] };
}

/* ── Axis formats ──────────────────────────────────────────── */
/**
 * One formatter for a whole axis: the unit (k, M, B) comes from the top tick
 * and the decimals from the step, so no axis reads "0, 4,482, 8,964, 13.4k".
 * A function format is applied to each tick as it is.
 */
export function axisFormatter(format = 'number', ticks = [], o = {}) {
  if (typeof format === 'function') return (v) => String(format(v));
  if (format === 'day' || format === 'month') return (v) => formatValue(v, format, o);
  const finite = ticks.filter(Number.isFinite);
  const top = Math.max(0, ...finite.map(Math.abs));
  const steps = finite.slice(1).map((t, i) => Math.abs(t - finite[i])).filter((s) => s > 0);
  const step = steps.length ? Math.min(...steps) : top || 1;
  const fixed = (v, d) => num(+v.toFixed(d), o, 0, d);

  if (format === 'pct' || format === 'share') {
    const k = format === 'share' ? 100 : 1;
    const d = Math.min(8, stepDecimals(clean(step * k)));
    return (v) => `${fixed(v * k, d)}%`;
  }
  if (format === 'multiple') {
    const d = Math.min(8, stepDecimals(step));
    return (v) => `${fixed(v, d)}×`;
  }
  const money = format === 'usd' || format === 'usdWhole' || format === 'usdCompact';
  // The unit comes from the step (so no tick reads 0.5k), then moves up while the
  // top tick would need four digits in it (so none reads 2,500k): $500 $1,000 $2,500,
  // $1k $2k $5k, 0.5M 1M 2.5M. Plain numbers keep up to 9,999.
  let ui = UNITS.findIndex(([u]) => step >= u);
  if (ui < 0) ui = UNITS.length;
  const unitAt = (i) => (i < UNITS.length ? UNITS[i] : [1, '']);
  while (ui > 0 && top / unitAt(ui)[0] >= (ui === UNITS.length ? 10000 : 1000)) ui--;
  const [unit, sfx] = unitAt(ui);
  let d = Math.min(8, stepDecimals(clean(step / unit)));
  // Cents are written in full on a money axis: $0.10, not $0.1.
  const cents = money && unit === 1 && d > 0;
  if (cents) d = Math.max(2, d);
  return (v) => {
    const r = +(v / unit).toFixed(d);
    if (r === 0) return money ? '$0' : '0';
    const body = `${cents ? num(Math.abs(r), o, d, d) : fixed(Math.abs(r), d)}${sfx}`;
    return `${r < 0 ? '-' : ''}${money ? '$' : ''}${body}`;
  };
}

/* ── Colour identity ───────────────────────────────────────── */
// Shared by every copy of the module on the page, so one key keeps one colour
// across the timeline, the breakdown and the report.
const COLORS = (globalThis.__neoVizColors ||= new Map());

/**
 * A stable colour for a key: the first key seen takes --viz-c1, the next
 * --viz-c2, and so on, wrapping after eight. colorFor.seed(keys) fixes the
 * order up front (a rate card's model list, say) so it does not depend on
 * which chart rendered first.
 */
export function colorFor(key) {
  const k = String(key);
  if (!COLORS.has(k)) COLORS.set(k, PALETTE[COLORS.size % PALETTE.length]);
  return COLORS.get(k);
}
colorFor.seed = (keys = []) => { for (const k of keys) colorFor(k); return colorFor; };
colorFor.reset = () => { COLORS.clear(); return colorFor; };

/* ── Text measure (estimates for layout before the browser can measure) ── */
/** Approximate advance of a string at `px`, mono or sans, in the same units. */
export function textWidth(s, px = 12, mono = true) {
  const n = Array.from(String(s ?? '')).length;
  return n * px * (mono ? 0.62 : 0.56);
}
