/* ══════════════════════════════════════════════════════════════
 * @neorgon/ui, Viz Kit v2: charts with axes (bars, horizontal bars, line)
 *
 * Nice ticks with one format per axis, x labels thinned by measured
 * collision (the runtime measures; the estimate here is the fallback), one
 * hue for unstacked bars, focusable marks with a formatted tooltip each.
 * viz.js re-exports bars and line; the helpers below are shared with it.
 * ════════════════════════════════════════════════════════════ */

import {
  esc, clamp, paletteAt, colorFor, formatValue, unknownWord, word,
  truncateMiddle, niceTicks, axisFormatter, dateParts, textWidth,
} from './viz-format.js';
import { frame, empty } from './viz-blocks.js';

let _uidSeq = 0;
export const uid = (p = 'viz') => `${p}-${(_uidSeq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const fmt = (n) => (Math.abs(n) >= 1000 ? n.toLocaleString('en-US') : String(+(+n).toFixed(2)));
export const numOrNull = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const tipAttr = (data) => esc(JSON.stringify(data));
/** Gutter for y ticks: the widest label at 12px mono, with room for a phone's larger scale. */
export const gutterFor = (labels) => Math.ceil(Math.max(0, ...labels.map((s) => textWidth(s, 12, true))) * 1.15 + 10);

export function svgOpen(w, h, o = {}, extra = '', marks = false) {
  const label = o.ariaLabel || o.title || 'chart';
  const role = marks ? 'role="group" aria-roledescription="chart"' : 'role="img"';
  return `<svg class="viz-svg" data-viz="2" viewBox="0 0 ${w} ${h}" ${role} aria-label="${esc(label)}"${extra ? ` ${extra}` : ''}>`;
}

/** One focusable mark: the first in a chart takes the tab stop, arrows reach the rest. */
export function markOpen(cls, label, tip, first) {
  return `<g class="viz-mark ${cls}" tabindex="${first ? 0 : -1}" role="img" aria-label="${esc(label)}" data-viz-tip="${tipAttr(tip)}">`;
}

/** Labels to keep at an even step, the last always (the one before it yields). */
export function thinIndices(n, every) {
  const keep = new Set();
  for (let i = 0; i < n; i += every) keep.add(i);
  if (!keep.has(n - 1)) {
    const prev = Math.floor((n - 1) / every) * every;
    if (n - 1 - prev < every && prev !== 0) keep.delete(prev);
    keep.add(n - 1);
  }
  return keep;
}

export function highlights(h) {
  if (h == null) return () => false;
  if (typeof h === 'function') return h;
  const set = new Set((Array.isArray(h) ? h : [h]).map(String));
  return (d, i) => set.has(String(d.key ?? d.label)) || set.has(String(d.label)) || set.has(String(i));
}

export const seriesColor = (k, key, o) => (o.colors ? paletteAt(k, o.colors)
  : o.colorBy === 'key' && key != null ? colorFor(key) : paletteAt(k));

/** Y gridlines and right-aligned tick labels, one format for the whole axis. */
export function yAxis(tk, text, yAt, pad, w) {
  return tk.ticks.map((t, i) => {
    const y = yAt(t).toFixed(1);
    return `<line class="viz-grid${t === 0 ? ' viz-grid--zero' : ''}" x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}"/>`
      + `<text class="viz-tick viz-ytick" x="${pad.l - 6}" y="${y}" text-anchor="end" dominant-baseline="central">${esc(text[i])}</text>`;
  }).join('');
}

export function xLabel(text, full, x, y, cls = '') {
  const title = full !== text ? `<title>${esc(full)}</title>` : '';
  return `<text class="viz-tick viz-xlabel${cls}" x="${x}" y="${y}" dy=".8em" text-anchor="middle">${esc(text)}${title}</text>`;
}


/* ── Bars (vertical, or horizontal with orient:'h') ────────── */
/** data: [{ label, value, color?, key?, highlight? }]; value an array for a stack (opts.keys names its parts).
 *  opts.orient 'h' for categorical bars with full labels on the left; opts.highlight a label, key,
 *  index, list of them or a predicate; opts.palette true for one hue per bar (the v1 look);
 *  opts.tickEvery forces every Nth x label (else they thin by measured collision); opts.max fixes the top. */
export function bars(data = [], o = {}) {
  if (o.orient === 'h') return hbars(data, o);
  if (!data.length) return frame(empty('No data', { frame: false, lang: o.lang }), o);
  const w = o.width || 320, h = o.height || 160;
  const fmtName = o.format || 'number';
  const interactive = o.marks !== false;
  const stacked = Array.isArray(data[0].value);
  const segsOf = (d) => (Array.isArray(d.value) ? d.value.map(numOrNull) : []);
  const totals = data.map((d) => (stacked ? segsOf(d).reduce((a, v) => a + (v || 0), 0) : numOrNull(d.value)));
  const known = totals.filter((v) => v != null);
  const lo = Math.min(0, ...known), hi = Math.max(0, ...known);
  const padB = o.labels === false ? 8 : 26;
  const count = o.ticks || clamp(Math.floor((h - 10 - padB) / 24), 2, 5);
  const values = stacked ? data.flatMap(segsOf) : totals;
  const integer = hi >= 1 && values.every((v) => v == null || Number.isInteger(v));
  const tk = Number(o.max) > 0
    ? niceTicks(lo, Math.max(Number(o.max), hi), { count, fixedMax: true, integer })
    : niceTicks(lo, hi || 1, { count, integer });
  const tickText = tk.ticks.map(axisFormatter(fmtName, tk.ticks, o));
  const pad = { t: 10, r: o.padR || 8, b: padB, l: o.padL || Math.max(28, gutterFor(tickText)) };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const yAt = (v) => pad.t + ph - ((v - tk.min) / (tk.max - tk.min || 1)) * ph;
  const y0 = yAt(clamp(0, tk.min, tk.max));
  const n = data.length, slot = pw / n, gap = slot * 0.28, bw = slot - gap;

  const full = data.map((d) => String(d.label ?? ''));
  const shown = full.map((s) => truncateMiddle(s, 28));
  const every = o.tickEvery || Math.max(1, Math.ceil((Math.max(...shown.map((s) => textWidth(s, 12, true))) + 6) / slot));
  const keep = thinIndices(n, every);
  const isHi = highlights(o.highlight);
  const anyHi = data.some((d, i) => d.highlight || isHi(d, i));
  const grow = o.animate ? ' viz-fx-grow' : '';

  const body = data.map((d, i) => {
    const x = pad.l + i * slot + gap / 2, cx = (x + bw / 2).toFixed(1);
    const label = full[i];
    const hiOn = !!(d.highlight || isHi(d, i));
    let rects = '', tip, aria;
    if (stacked) {
      let acc = 0, drawn = 0, missing = 0;
      const rows = [];
      segsOf(d).forEach((v, k) => {
        const key = o.keys ? o.keys[k] : `#${k + 1}`;
        const color = seriesColor(k, key, o);
        if (v == null) { rows.push([String(key), unknownWord(o), color]); missing++; return; }
        if (v === 0) return;
        const ya = yAt(acc), yb = yAt(acc + v);
        acc += v;
        drawn++;
        rows.push([String(key), formatValue(v, fmtName, o), color]);
        const t = interactive ? '' : `<title>${esc(label)} · ${esc(key)}: ${esc(formatValue(v, fmtName, o))}</title>`;
        rects += `<rect class="viz-bar${grow}" data-k="${rows.length - 1}" x="${x.toFixed(1)}" y="${Math.min(ya, yb).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(ya - yb).toFixed(1)}" fill="${esc(color)}" rx="1.5">${t}</rect>`;
      });
      if (drawn > 1 || (drawn && missing)) rows.push([word('total', o), formatValue(totals[i], fmtName, o), '', 1]);
      if (!drawn && missing) rects = `<text class="viz-unknown-mark" x="${cx}" y="${(y0 - 6).toFixed(1)}" text-anchor="middle" aria-hidden="true">?</text>`;
      tip = rows.length ? { t: label, r: rows } : { t: label, v: formatValue(0, fmtName, o) };
      if (drawn && missing) tip.f = word('notInTotal', o).replace('{w}', unknownWord(o));
      aria = `${label}: ${rows.length ? rows.map((r) => `${r[0]} ${r[1]}`).join(', ') : formatValue(0, fmtName, o)}`;
    } else {
      const v = totals[i];
      const color = d.color || (o.colors ? paletteAt(i, o.colors) : o.palette ? paletteAt(i) : hiOn ? 'var(--viz-bar-hi, var(--viz-accent-bright))' : 'var(--viz-bar, var(--viz-accent))');
      const text = v == null ? unknownWord(o) : formatValue(v, fmtName, o);
      if (v) {
        const ya = yAt(v);
        const muted = anyHi && !hiOn ? ' viz-bar--muted' : '';
        const t = interactive ? '' : `<title>${esc(label)}: ${esc(text)}</title>`;
        rects = `<rect class="viz-bar${grow}${muted}" x="${x.toFixed(1)}" y="${Math.min(ya, y0).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.abs(y0 - ya).toFixed(1)}" fill="${esc(color)}" rx="2">${t}</rect>`;
      }
      if (v == null) {
        rects = `<text class="viz-unknown-mark" x="${cx}" y="${(y0 - 6).toFixed(1)}" text-anchor="middle" aria-hidden="true">?</text>`;
      }
      tip = { t: label, v: text };
      aria = `${label}: ${text}`;
    }
    const lab = o.labels === false || (o.tickEvery && !keep.has(i)) ? ''
      : xLabel(shown[i], label, cx, (pad.t + ph + 6).toFixed(1), keep.has(i) ? '' : ' is-off');
    if (!interactive) return `${rects}${lab}`;
    const hit = `<rect class="viz-hit" x="${(x - gap / 2).toFixed(1)}" y="${pad.t}" width="${slot.toFixed(1)}" height="${ph.toFixed(1)}"/>`;
    return `${markOpen('viz-col', aria, tip, i === 0)}${hit}${rects}</g>${lab}`;
  }).join('');

  return frame(`${svgOpen(w, h, o, '', interactive)}${yAxis(tk, tickText, yAt, pad, w)}${body}</svg>`, o);
}

/** Horizontal bars as HTML rows: full labels on the left, the value at the end, text at true size. */
function hbars(data, o) {
  if (!data.length) return frame(empty('No data', { frame: false, lang: o.lang }), o);
  const fmtName = o.format || 'number';
  const stacked = Array.isArray(data[0].value);
  const segsOf = (d) => (Array.isArray(d.value) ? d.value.map(numOrNull) : []);
  const totals = data.map((d) => (stacked ? segsOf(d).reduce((a, v) => a + (v || 0), 0) : numOrNull(d.value)));
  const known = totals.filter((v) => v != null);
  const lo = Math.min(0, ...known);
  const hi = Math.max(0, ...known, Number(o.max) > 0 ? Number(o.max) : 0) || 1;
  const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
  const z = pos(0);
  const isHi = highlights(o.highlight);
  const anyHi = data.some((d, i) => d.highlight || isHi(d, i));
  const rows = data.map((d, i) => {
    const full = String(d.label ?? '');
    const shown = truncateMiddle(full, o.truncate || 28);
    const hiOn = !!(d.highlight || isHi(d, i));
    const v = totals[i];
    let fill = '';
    if (stacked) {
      let acc = 0;
      fill = segsOf(d).map((sv, k) => {
        if (!sv) return '';
        const a = pos(acc), wd = pos(acc + sv) - a;
        acc += sv;
        return `<span class="viz-hbar__fill" style="--a:${a.toFixed(2)}%;--w:${wd.toFixed(2)}%;--c:${esc(seriesColor(k, o.keys ? o.keys[k] : null, o))}"></span>`;
      }).join('');
    } else if (v != null && v !== 0) {
      const a = Math.min(pos(v), z), wd = Math.abs(pos(v) - z);
      const color = d.color || (o.colors ? paletteAt(i, o.colors) : hiOn ? 'var(--viz-bar-hi, var(--viz-accent-bright))' : 'var(--viz-bar, var(--viz-accent))');
      fill = `<span class="viz-hbar__fill${anyHi && !hiOn ? ' viz-bar--muted' : ''}" style="--a:${a.toFixed(2)}%;--w:${wd.toFixed(2)}%;--c:${esc(color)}"></span>`;
    }
    const text = v == null ? unknownWord(o) : formatValue(v, fmtName, o);
    const name = shown === full ? esc(full) : `<span aria-hidden="true">${esc(shown)}</span><span class="viz-sr">${esc(full)}</span>`;
    const cls = `viz-hbar${hiOn ? ' is-hi' : ''}${v == null ? ' is-unknown' : ''}`;
    return `<li class="${cls}"><span class="viz-hbar__label" title="${esc(full)}">${name}</span>`
      + `<span class="viz-hbar__track" aria-hidden="true">${fill}</span><span class="viz-hbar__value${v == null ? ' viz-unknown' : ''}">${esc(text)}</span></li>`;
  }).join('');
  const label = o.ariaLabel || o.title;
  return frame(`<div class="viz-hbars-wrap"><ol class="viz-hbars"${label ? ` aria-label="${esc(label)}"` : ''}>${rows}</ol></div>`, o);
}

/* ── Line / area ───────────────────────────────────────────── */
const DAY = 864e5;
const toX = (x) => {
  if (typeof x === 'number') return x;
  if (x instanceof Date) return +x;
  const p = typeof x === 'string' ? dateParts(x) : null;
  return p ? Date.UTC(p.y, p.m, p.d) : NaN;
};

/** Date ticks: month starts are majors ("Jun", "Jan 2027"); minors are days ("8", "15"); the first reads "31 May". */
function dateTicks(x0, x1, utc, o) {
  const months = word('months', o);
  const parts = (t) => { const d = new Date(t); return utc ? { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() } : { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }; };
  const at = (p) => (utc ? Date.UTC(p.y, p.m, p.d) : new Date(p.y, p.m, p.d).getTime());
  const days = (x1 - x0) / DAY;
  const minor = (d) => (days <= 16 ? true : days <= 75 ? d === 8 || d === 15 || d === 22 : days <= 200 ? d === 15 : false);
  const out = [];
  let p = parts(x0);
  if (at(p) < x0) p = parts(at({ ...p, d: p.d + 1 }));
  for (let guard = 0; guard < 4000; guard++) {
    const t = at(p);
    if (t > x1) break;
    const major = p.d === 1;
    if (major || minor(p.d)) {
      const text = major ? (p.m === 0 || !out.length ? `${months[p.m]} ${p.y}` : months[p.m])
        : !out.length ? `${p.d} ${months[p.m]}` : String(p.d);
      out.push({ x: t, text, major });
    }
    p = parts(at({ ...p, d: p.d + 1 }));
  }
  return out;
}

/** series: [{ name?, color?, values: number[] | {x, y}[] }]; y null is a gap. x may be a number,
 *  a Date or 'YYYY-MM-DD'. opts.area, opts.min/max (fixed ends), opts.xLabels (true, or one label
 *  per point), opts.xFormat ('day', 'month', a format name or a function), opts.endLabels (series
 *  names at the line ends; endValues adds the last value). */
export function line(series = [], o = {}) {
  const list = Array.isArray(series[0]) || typeof series[0] === 'number' ? [{ values: series }] : series;
  if (!list.length || !list[0].values?.length) return frame(empty('No data', { frame: false, lang: o.lang }), o);
  const w = o.width || 340, h = o.height || 150;
  const fmtName = o.format || 'number';
  const interactive = o.marks !== false;
  const norm = (vals) => vals.map((v, i) => (v == null || typeof v !== 'object'
    ? { x: i, y: numOrNull(v), raw: i }
    : { x: v.x == null ? i : toX(v.x), y: numOrNull(v.y), raw: v.x == null ? i : v.x }));
  const pts = list.map((s) => norm(s.values));
  const all = pts.flat();
  const dates = all.some((p) => p.raw instanceof Date || typeof p.raw === 'string') || o.xFormat === 'day' || o.xFormat === 'month';
  const utc = all.some((p) => typeof p.raw === 'string');
  const xs = all.map((p) => p.x).filter(Number.isFinite);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const ys = all.map((p) => p.y).filter((v) => v != null);
  const top = ys.length ? Math.max(...ys) : 1;
  const yLo = o.min != null ? o.min : Math.min(0, ...ys);
  const yHi = o.max != null ? o.max : top > 0 ? top : top < 0 ? 0 : 1;
  const xLabelsOn = !!o.xLabels;
  const padB = xLabelsOn ? 26 : 20;
  const count = o.ticks || clamp(Math.floor((h - 10 - padB) / 24), 2, 5);
  const tk = niceTicks(yLo, yHi, { count, fixedMin: o.min != null, fixedMax: o.max != null });
  const tickText = tk.ticks.map(axisFormatter(fmtName, tk.ticks, o));
  const names = list.map((s) => (s.name ? `${s.name}` : ''));
  const endText = (s, i) => {
    const last = [...pts[i]].reverse().find((p) => p.y != null);
    return last && names[i] ? `${names[i]}${o.endValues ? ` ${formatValue(last.y, fmtName, o)}` : ''}` : '';
  };
  const endW = o.endLabels ? Math.max(0, ...list.map((s, i) => textWidth(endText(s, i), 12, false))) : 0;
  const pad = { t: 10, r: o.padR || (o.endLabels ? Math.ceil(endW * 1.15 + 12) : 8), b: padB, l: o.padL || Math.max(28, gutterFor(tickText)) };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const xAt = (x) => pad.l + (xMax === xMin ? 0 : (x - xMin) / (xMax - xMin)) * pw;
  const yAt = (y) => pad.t + ph - ((y - tk.min) / (tk.max - tk.min || 1)) * ph;
  const id = o.uid || uid('line');
  const xMeaning = dates || Array.isArray(o.xLabels) || o.xFormat != null;
  const xText = (p, i) => {
    if (Array.isArray(o.xLabels) && o.xLabels[i] != null) return String(o.xLabels[i]);
    if (dates) return formatValue(typeof p.raw === 'string' ? p.raw : new Date(p.x), o.xFormat === 'month' ? 'month' : 'day', o);
    return typeof o.xFormat === 'function' || typeof o.xFormat === 'string' ? formatValue(p.x, o.xFormat, o) : formatValue(p.x, 'number', o);
  };

  let defs = '';
  const body = list.map((s, si) => {
    const color = s.color || seriesColor(si, s.name, o);
    const runs = [];
    let run = [];
    for (const p of pts[si]) {
      if (p.y == null || !Number.isFinite(p.x)) { if (run.length) runs.push(run); run = []; } else run.push(p);
    }
    if (run.length) runs.push(run);
    const d = runs.map((r) => r.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.x).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(' ')).join(' ');
    let area = '';
    if (o.area && runs.length) {
      const gid = `${id}-area-${si}`;
      defs += `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${esc(color)}" stop-opacity=".35"/><stop offset="100%" stop-color="${esc(color)}" stop-opacity="0"/></linearGradient>`;
      const base = (pad.t + ph).toFixed(1);
      const areaD = runs.map((r) => `${r.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.x).toFixed(1)} ${yAt(p.y).toFixed(1)}`).join(' ')} L${xAt(r[r.length - 1].x).toFixed(1)} ${base} L${xAt(r[0].x).toFixed(1)} ${base} Z`).join(' ');
      area = `<path d="${areaD}" fill="url(#${gid})" class="${o.animate ? 'viz-fx-area-in' : ''}"/>`;
    }
    const draw = o.animate ? ' pathLength="1"' : '';
    const path = `<path d="${d}" class="viz-line${o.animate ? ' viz-fx-draw' : ''}" stroke="${esc(color)}"${draw}/>`;
    const title = !interactive && s.name ? `<title>${esc(s.name)}</title>` : '';
    return `<g>${title}${area}${path}</g>`;
  }).join('');

  let axisX = '';
  if (xLabelsOn) {
    const y = (pad.t + ph + 6).toFixed(1);
    if (dates && !Array.isArray(o.xLabels)) {
      axisX = dateTicks(xMin, xMax, utc, o).map((t) => xLabel(t.text, t.text, xAt(t.x).toFixed(1), y, t.major ? ' viz-xlabel--major' : '')).join('');
    } else if (Array.isArray(o.xLabels)) {
      axisX = pts[0].map((p, i) => (o.xLabels[i] == null ? '' : xLabel(truncateMiddle(o.xLabels[i], 28), String(o.xLabels[i]), xAt(p.x).toFixed(1), y))).join('');
    } else {
      const xt = niceTicks(xMin, xMax, { count: clamp(Math.floor(pw / 60), 2, 8), fixedMin: true, fixedMax: true });
      const f = axisFormatter(o.xFormat || 'number', xt.ticks, o);
      axisX = xt.ticks.map((t) => xLabel(f(t), f(t), xAt(t).toFixed(1), y)).join('');
    }
  }

  let ends = '';
  if (o.endLabels) {
    const items = list.map((s, si) => {
      const last = [...pts[si]].reverse().find((p) => p.y != null && Number.isFinite(p.x));
      return last && names[si] ? { y: yAt(last.y), text: endText(s, si), color: s.color || seriesColor(si, s.name, o) } : null;
    }).filter(Boolean).sort((a, b) => a.y - b.y);
    for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) items[i].y = items[i - 1].y + 14;
    ends = items.map((it) => `<text class="viz-endlabel" x="${(w - pad.r + 6).toFixed(1)}" y="${it.y.toFixed(1)}" dominant-baseline="central" fill="${esc(it.color)}">${esc(it.text)}</text>`).join('');
  }

  let marks = '';
  if (interactive) {
    const xsU = [...new Set(xs)].sort((a, b) => a - b);
    const idxOf = new Map(pts[0].map((p, i) => [p.x, i]));
    const byX = pts.map((ps) => new Map(ps.map((p) => [p.x, p])));
    marks = xsU.map((x, k) => {
      const left = k ? (xAt(xsU[k - 1]) + xAt(x)) / 2 : pad.l;
      const right = k < xsU.length - 1 ? (xAt(x) + xAt(xsU[k + 1])) / 2 : w - pad.r;
      const rows = [], dots = [];
      list.forEach((s, si) => {
        const p = byX[si].get(x);
        const color = s.color || seriesColor(si, s.name, o);
        const text = p && p.y != null ? formatValue(p.y, fmtName, o) : unknownWord(o);
        rows.push([names[si] || `#${si + 1}`, text, color]);
        if (p && p.y != null) dots.push(`<circle class="viz-pt" cx="${xAt(x).toFixed(1)}" cy="${yAt(p.y).toFixed(1)}" r="3.2" fill="${esc(color)}"/>`);
      });
      const ref = byX.map((m) => m.get(x)).find(Boolean);
      // A bare index says nothing to a reader: one named series is titled by its name.
      const title = !xMeaning && rows.length === 1 && names[0] ? names[0] : xText(ref, idxOf.has(x) ? idxOf.get(x) : k);
      const tip = rows.length === 1 ? { t: title, v: rows[0][1] } : { t: title, r: rows };
      const aria = `${title}: ${rows.map((r) => (rows.length === 1 ? r[1] : `${r[0]} ${r[1]}`)).join(', ')}`;
      return `${markOpen('viz-slice', aria, tip, k === 0)}<rect class="viz-hit" x="${left.toFixed(1)}" y="${pad.t}" width="${Math.max(1, right - left).toFixed(1)}" height="${ph.toFixed(1)}"/>${dots.join('')}</g>`;
    }).join('');
  }

  return frame(`${svgOpen(w, h, o, '', interactive)}<defs>${defs}</defs>${yAxis(tk, tickText, yAt, pad, w)}${body}${axisX}${ends}${marks}</svg>`, o);
}

