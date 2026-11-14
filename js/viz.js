/* ══════════════════════════════════════════════════════════════
 * @neorgon/ui, Viz Kit v2: chart builders and the kit's entry point
 *
 * Dependency-free, framework-free. Every builder is a pure function that
 * returns an HTML/SVG string; importing this file in a browser also installs
 * the runtime once (viz-runtime.js: text sizing, x-label collisions, the
 * hover layer, keyboard marks), so `el.innerHTML = viz.bars(...)` is enough.
 * Pair with css/viz.css. Vendored as js/viz.js plus js/viz-format.js,
 * js/viz-axes.js, js/viz-blocks.js and js/viz-runtime.js; sync-viz.sh moves
 * all six files together.
 *
 * Shared opts (all optional, every v1 call keeps working):
 *   uid        unique id prefix for <defs> (pass a stable one for deterministic output)
 *   title      sentence-case heading in a .viz-head frame; scale a mono readout beside it
 *   ariaLabel  accessible name for the chart (defaults to title)
 *   width,height  viewBox size (charts are responsive via width:100%)
 *   padL,padR  gutter overrides for callers that map pointer positions back to data
 *   format     value format for ticks, labels and tooltips: 'usd', 'usdWhole',
 *              'usdCompact', 'compact', 'pct', 'share', 'multiple', 'int',
 *              'number' (default) or a function (see viz-format.js)
 *   unknown    the word an unknown value prints (null is never drawn as 0)
 *   colors     categorical palette override; colorBy:'key' takes colorFor(key)
 *   marks      false to skip the focusable marks and the hover layer
 *   animate    true for the chart's reduced-motion-gated effect
 *   frame      false to skip the .viz-panel wrapper
 *   lang       'en' | 'es' for the kit's words (defaults to <html lang>)
 * ════════════════════════════════════════════════════════════ */

import {
  PALETTE, esc, clamp, paletteAt, colorFor, formatValue, formatSigned, unknownWord,
  truncateMiddle, niceTicks, axisFormatter, langOf,
} from './viz-format.js';
import {
  frame, stateBlock, empty, error, skeleton, statGrid, delta, ranked, levers, legend,
} from './viz-blocks.js';
import { bars, line, fmt, numOrNull, svgOpen, markOpen } from './viz-axes.js';
import { install } from './viz-runtime.js';

if (typeof document !== 'undefined' && typeof window !== 'undefined') install(document);


/* ── Sparkline (inline, no axes) ───────────────────────────── */
/** values: number[], a tiny trend for tables and rows */
export function spark(values = [], o = {}) {
  if (!values.length) return '';
  const w = o.width || 90, h = o.height || 24, pad = 2;
  const vals = values.map(numOrNull);
  const known = vals.filter((v) => v != null);
  if (!known.length) return '';
  const min = Math.min(...known), max = Math.max(...known);
  const xAt = (i) => pad + (vals.length <= 1 ? 0 : i / (vals.length - 1)) * (w - pad * 2);
  const yAt = (v) => pad + (max === min ? 0.5 : 1 - (v - min) / (max - min)) * (h - pad * 2);
  let pen = false;
  const d = vals.map((v, i) => { if (v == null) { pen = false; return ''; } const s = `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`; pen = true; return s; }).filter(Boolean).join(' ');
  const color = o.color || 'var(--viz-accent-bright)';
  const li = vals.length - 1 - [...vals].reverse().findIndex((v) => v != null);
  const last = `<circle cx="${xAt(li).toFixed(1)}" cy="${yAt(vals[li]).toFixed(1)}" r="1.8" fill="${esc(color)}"/>`;
  return `<svg class="viz-svg viz-spark" data-viz="2" style="width:${w}px;max-width:100%;display:inline-block;vertical-align:middle" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(o.ariaLabel || 'trend')}"><path d="${d}" class="viz-line" stroke="${esc(color)}" style="stroke-width:1.4"/>${last}</svg>`;
}

/* ── Radar / spider ────────────────────────────────────────── */
/** axes: [{key,label}] ; series: [{name?,color?,values: {key:0..max} | number[]}] */
export function radar(axes = [], series = [], o = {}) {
  if (!axes.length) return frame(empty('No axes', { frame: false, lang: o.lang }), o);
  const list = Array.isArray(series) ? series : [series];
  const size = o.size || 300, cx = size / 2, cy = size / 2, r = o.r || 92;
  const max = o.max || 100, n = axes.length, pad = 56;
  const interactive = o.marks !== false;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const pt = (i, f) => [cx + Math.cos(angle(i)) * r * f, cy + Math.sin(angle(i)) * r * f];
  const val = (s, a, i) => (Array.isArray(s.values) ? s.values[i] : (s.values || {})[a.key]);

  const rings = [0.25, 0.5, 0.75, 1].map((f) => `<polygon class="viz-radar-ring" points="${axes.map((_, i) => pt(i, f).map((v) => v.toFixed(1)).join(',')).join(' ')}"/>`).join('');
  const spokes = axes.map((_, i) => { const [x, y] = pt(i, 1); return `<line class="viz-radar-spoke" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('');
  const labels = axes.map((a, i) => {
    const [x, y] = pt(i, 1.16), dx = x - cx;
    return `<text class="viz-label" x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${dx > 8 ? 'start' : dx < -8 ? 'end' : 'middle'}" dominant-baseline="middle">${esc(a.label)}</text>`;
  }).join('');
  const areas = list.map((s, si) => {
    const color = s.color || paletteAt(si, o.colors);
    const pts = axes.map((a, i) => pt(i, clamp((Number(val(s, a, i)) || 0) / max, 0, 1)).map((v) => v.toFixed(1)).join(',')).join(' ');
    const t = interactive ? '' : `<title>${esc(s.name || 'series')}</title>`;
    return `<polygon class="viz-radar-area" points="${pts}" fill="${esc(color)}" stroke="${esc(color)}">${t}</polygon>`;
  }).join('');
  const marks = !interactive ? '' : axes.map((a, i) => {
    const rows = list.map((s, si) => {
      const v = numOrNull(val(s, a, i));
      return [s.name || `#${si + 1}`, v == null ? unknownWord(o) : formatValue(v, o.format || 'number', o), s.color || paletteAt(si, o.colors), v];
    });
    const dots = rows.filter((rw) => rw[3] != null).map((rw) => { const [x, y] = pt(i, clamp(rw[3] / max, 0, 1)); return `<circle class="viz-pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${esc(rw[2])}"/>`; }).join('');
    const [hx, hy] = pt(i, 1);
    const tip = rows.length === 1 ? { t: a.label, v: rows[0][1] } : { t: a.label, r: rows.map((rw) => rw.slice(0, 3)) };
    const aria = `${a.label}: ${rows.map((rw) => (rows.length === 1 ? rw[1] : `${rw[0]} ${rw[1]}`)).join(', ')}`;
    return `${markOpen('viz-spoke', aria, tip, i === 0)}<line class="viz-hit viz-hit--spoke" x1="${cx}" y1="${cy}" x2="${hx.toFixed(1)}" y2="${hy.toFixed(1)}"/>${dots}</g>`;
  }).join('');
  const role = interactive ? 'role="group" aria-roledescription="chart"' : 'role="img"';
  return frame(`<svg class="viz-svg" data-viz="2" viewBox="${-pad} 0 ${size + pad * 2} ${size}" ${role} aria-label="${esc(o.ariaLabel || o.title || 'radar chart')}">${rings}${spokes}${areas}${labels}${marks}</svg>`, o);
}

/* ── Gauge / progress ring / band meter ────────────────────── */
/** value 0..max ; opts.mode 'ring' | 'band' ; opts.bands (band mode) */
export function gauge(value = 0, o = {}) {
  const max = o.max || 100, v = clamp(value, 0, max), frac = v / max;
  const color = o.color || 'var(--viz-accent-bright)';
  const label = o.format ? formatValue(v, o.format, o) : fmt(v);
  if (o.mode === 'band') {
    const w = o.width || 260, h = o.height || 34, pad = 6, bw = w - pad * 2;
    const bands = o.bands || [{ to: max, color }];
    let acc = 0;
    const segs = bands.map((b) => {
      const x0 = pad + (acc / max) * bw, x1 = pad + (b.to / max) * bw; acc = b.to;
      return `<rect x="${x0.toFixed(1)}" y="${(h / 2 - 4).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="8" fill="${esc(b.color)}" opacity=".55"/>`;
    }).join('');
    const mx = pad + frac * bw;
    const marker = `<line x1="${mx.toFixed(1)}" y1="4" x2="${mx.toFixed(1)}" y2="${h - 12}" stroke="var(--viz-ink)" stroke-width="2"/><circle cx="${mx.toFixed(1)}" cy="4" r="3" fill="var(--viz-ink)"/>`;
    const top = o.format ? formatValue(max, o.format, o) : fmt(max);
    const aria = o.ariaLabel || `${o.title || 'gauge'} ${label} of ${top}`;
    return frame(`${svgOpen(w, h, { ...o, ariaLabel: aria })}${segs}${marker}<text class="viz-tick" x="${pad}" y="${h - 1}">0</text><text class="viz-tick" x="${w - pad}" y="${h - 1}" text-anchor="end">${esc(top)}</text></svg>`, o);
  }
  const size = o.size || 120, cx = size / 2, cy = size / 2, rr = size / 2 - 12;
  const start = 135, sweep = 270;
  const polar = (deg) => [cx + rr * Math.cos((deg * Math.PI) / 180), cy + rr * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0, a1) => {
    const [x0, y0] = polar(a0), [x1, y1] = polar(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${rr} ${rr} 0 ${(a1 - a0) % 360 > 180 ? 1 : 0} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  };
  const th = o.thickness || 10;
  const track = `<path class="viz-gauge-track" d="${arc(start, start + sweep)}" stroke-width="${th}"/>`;
  const fill = frac > 0 ? `<path class="viz-gauge-fill${o.animate ? ' viz-fx-draw' : ''}" d="${arc(start, start + sweep * frac)}" stroke="${esc(color)}" stroke-width="${th}"${o.animate ? ' pathLength="1"' : ''}/>` : '';
  const text = `<text class="viz-gauge-value" x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="${size / 5}">${o.label != null ? esc(o.label) : esc(label)}</text>`;
  return frame(`<svg class="viz-svg" data-viz="2" style="max-width:${size}px;margin:0 auto" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(o.ariaLabel || `${o.title || 'gauge'} ${label} of ${o.format ? formatValue(max, o.format, o) : fmt(max)}`)}">${track}${fill}${text}</svg>`, o);
}

/* ── Donut / distribution ──────────────────────────────────── */
const warned = new Set();
/** segments: [{label, value, color?}] ; opts.legend (with values and shares unless legendValues:false),
 *  opts.center. One slice over 90% logs a console warning once and sets data-viz-warn="dominant". */
export function donut(segments = [], o = {}) {
  const segs = segments.filter((s) => s.value > 0);
  if (!segs.length) return frame(empty('No data', { frame: false, lang: o.lang }), o);
  const size = o.size || 140, cx = size / 2, cy = size / 2;
  const rr = size / 2 - 8, thick = o.thickness || 16, cr = 2 * Math.PI * rr;
  const total = segs.reduce((a, s) => a + s.value, 0);
  const interactive = o.marks !== false;
  const fmtName = o.format || 'number';
  const colorOf = (s, i) => s.color || (o.colorBy === 'key' ? colorFor(s.key ?? s.label) : paletteAt(i, o.colors));
  const big = segs.find((s) => s.value / total > 0.9);
  if (big && o.warn !== false) {
    const k = `${o.title || o.ariaLabel || ''}|${big.label}`;
    if (!warned.has(k) && typeof console !== 'undefined') {
      warned.add(k);
      console.warn(`viz.donut: "${big.label}" is ${formatValue(big.value / total, 'share', o)} of "${o.title || o.ariaLabel || 'the ring'}"; one slice over 90% reads better as a bar or a sentence.`);
    }
  }
  let acc = 0;
  const ring = segs.map((s, i) => {
    const frac = s.value / total, dash = frac * cr, off = acc * cr; acc += frac;
    const color = colorOf(s, i);
    const text = `${formatValue(s.value, fmtName, o)} (${formatValue(frac, 'share', o)})`;
    const circle = `<circle class="viz-donut-seg" cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="${esc(color)}" stroke-width="${thick}" stroke-dasharray="${dash.toFixed(2)} ${(cr - dash).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})">${interactive ? '' : `<title>${esc(s.label)}: ${esc(text)}</title>`}</circle>`;
    return interactive ? `${markOpen('viz-arc', `${s.label}: ${text}`, { t: s.label, v: text }, i === 0)}${circle}</g>` : circle;
  }).join('');
  const center = o.center != null ? `<text class="viz-donut-center" x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="${size / 6}">${esc(o.center)}</text>` : '';
  const key = o.legend ? legend(segs.map((s, i) => ({
    label: s.label, color: colorOf(s, i),
    ...(o.legendValues === false ? {} : { value: s.value, share: s.value / total }),
  })), { format: fmtName, lang: o.lang, label: o.legendLabel }) : '';
  const role = interactive ? 'role="group" aria-roledescription="chart"' : 'role="img"';
  const warnAttr = big ? ' data-viz-warn="dominant"' : '';
  return frame(`<svg class="viz-svg" data-viz="2" style="max-width:${size}px;margin:0 auto" viewBox="0 0 ${size} ${size}" ${role} aria-label="${esc(o.ariaLabel || o.title || 'distribution')}"${warnAttr}>${ring}${center}</svg>${key}`, { ...o, warn: big ? 'dominant' : o.warn === false ? '' : undefined });
}

/* ── Heatmap / density grid ────────────────────────────────── */
/** grid: number[][] (rows of values, null for unknown) ; opts.max, opts.cols, opts.rows (labels) */
export function heatmap(grid = [], o = {}) {
  if (!grid.length) return frame(empty('No data', { frame: false, lang: o.lang }), o);
  const rows = grid.length, cols = Math.max(...grid.map((r) => r.length));
  const cell = o.cell || 16, gap = o.gap || 2, lp = o.rows ? 34 : 0, tp = o.cols ? 14 : 0;
  const w = lp + cols * (cell + gap), h = tp + rows * (cell + gap);
  const max = o.max || Math.max(1, ...grid.flat().filter((v) => v != null));
  const interactive = o.marks !== false;
  const ramp = ['var(--viz-heat-0)', 'var(--viz-heat-1)', 'var(--viz-heat-2)', 'var(--viz-heat-3)', 'var(--viz-heat-4)'];
  const tone = (v) => (v == null ? 'transparent' : ramp[clamp(Math.round((v / max) * (ramp.length - 1)), 0, ramp.length - 1)]);
  let cells = '', first = true;
  grid.forEach((row, r) => {
    row.forEach((raw, c) => {
      const v = numOrNull(raw);
      const x = lp + c * (cell + gap), y = tp + r * (cell + gap);
      const name = `${o.rows ? `${o.rows[r]} · ` : ''}${o.cols && o.cols[c] != null ? o.cols[c] : ''}`.replace(/ · $/, '');
      const text = v == null ? unknownWord(o) : formatValue(v, o.format || 'number', o);
      const rect = `<rect class="viz-cell${v == null ? ' viz-cell--unknown' : ''}" x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${tone(v)}">${interactive ? '' : `<title>${esc(name ? `${name}: ${text}` : text)}</title>`}</rect>`;
      if (!interactive) { cells += rect; return; }
      cells += `${markOpen('viz-heat', name ? `${name}: ${text}` : text, name ? { t: name, v: text } : { v: text }, first)}${rect}</g>`;
      first = false;
    });
  });
  const rowLabels = o.rows ? o.rows.map((l, r) => `<text class="viz-tick" x="${lp - 5}" y="${tp + r * (cell + gap) + cell / 2}" text-anchor="end" dominant-baseline="central">${esc(l)}</text>`).join('') : '';
  const colLabels = o.cols ? o.cols.map((l, c) => `<text class="viz-tick" x="${lp + c * (cell + gap) + cell / 2}" y="${tp - 4}" text-anchor="middle">${esc(l)}</text>`).join('') : '';
  return frame(`${svgOpen(w, h, o, '', interactive)}${rowLabels}${colLabels}${cells}</svg>`, o);
}

/* ── Timeline / stem / event strip ─────────────────────────── */
/** events: [{t, value, color?, label?, marked?}] ; opts.from,to (ms), opts.ref{value,label}, opts.maxValue */
export function timeline(events = [], o = {}) {
  if (!events.length) return frame(empty('No events', { frame: false, lang: o.lang }), o);
  const w = o.width || 300, h = o.height || 78;
  const padX = 6, padTop = 8, baseY = h - 16, pw = w - padX * 2;
  const to = o.to || Date.now();
  const from = o.from || Math.min(...events.map((e) => e.t));
  const span = Math.max(1, to - from);
  const maxV = o.maxValue || Math.max(1, ...events.map((e) => e.value));
  const interactive = o.marks !== false;
  const xAt = (t) => padX + ((t - from) / span) * pw;
  const yAt = (v) => baseY - (v / maxV) * (baseY - padTop);
  let first = true;
  const stems = events.filter((e) => e.t >= from && e.t <= to).map((e) => {
    const x = xAt(e.t).toFixed(1), y = yAt(e.value).toFixed(1);
    const color = e.color || 'var(--viz-accent-bright)';
    const text = e.label || formatValue(e.value, o.format || 'number', o);
    const halo = e.marked ? `<circle cx="${x}" cy="${y}" r="4.5" fill="none" stroke="${esc(color)}" stroke-width="1.4" opacity=".9"/>` : '';
    const body = `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${y}" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" opacity=".85"/><circle class="viz-pt viz-pt--on" cx="${x}" cy="${y}" r="2.6" fill="${esc(color)}">${interactive ? '' : `<title>${esc(text)}</title>`}</circle>${halo}`;
    if (!interactive) return body;
    const out = `${markOpen('viz-stem', text, { v: text }, first)}${body}</g>`;
    first = false;
    return out;
  }).join('');
  let ref = '';
  if (o.ref) {
    const ry = yAt(o.ref.value).toFixed(1);
    ref = `<line class="viz-ref" x1="${padX}" y1="${ry}" x2="${w - padX}" y2="${ry}"/>${o.ref.label ? `<text class="viz-tick" x="${w - padX}" y="${Number(ry) - 3}" text-anchor="end">${esc(o.ref.label)}</text>` : ''}`;
  }
  return frame(`${svgOpen(w, h, o, 'preserveAspectRatio="none"', interactive)}<line class="viz-axis" x1="${padX}" y1="${baseY}" x2="${w - padX}" y2="${baseY}"/>${ref}${stems}</svg>`, o);
}

/* ── Dense series (canvas), ports hwinfo-viewer decimation ─── */
/** Draw a min/max-per-pixel decimated line into a <canvas> for huge series. */
export function canvasLine(canvas, values, o = {}) {
  if (!canvas || !values?.length) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(160, rect.width), h = rect.height || 120;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const pad = { t: 6, r: 6, b: 6, l: 6 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const min = o.min != null ? o.min : Math.min(...values);
  const max = o.max != null ? o.max : Math.max(...values);
  const span = max - min || 1;
  const yAt = (v) => pad.t + ph - ((v - min) / span) * ph;
  const n = values.length, cols = Math.max(1, Math.floor(pw));
  ctx.beginPath();
  if (n <= cols) {
    values.forEach((v, i) => { const x = pad.l + (n <= 1 ? 0 : (i / (n - 1)) * pw); i ? ctx.lineTo(x, yAt(v)) : ctx.moveTo(x, yAt(v)); });
  } else {
    const bucket = n / cols;
    for (let b = 0; b < cols; b++) {
      const s0 = Math.floor(b * bucket), s1 = Math.min(n, Math.floor((b + 1) * bucket));
      let lo = Infinity, hi = -Infinity;
      for (let i = s0; i < s1; i++) { if (values[i] < lo) lo = values[i]; if (values[i] > hi) hi = values[i]; }
      const x = pad.l + (b / (cols - 1 || 1)) * pw;
      b ? ctx.lineTo(x, yAt(hi)) : ctx.moveTo(x, yAt(hi));
      ctx.lineTo(x, yAt(lo));
    }
  }
  ctx.strokeStyle = o.color || getComputedStyle(document.documentElement).getPropertyValue('--viz-accent-bright') || '#0080ff';
  ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
  ctx.stroke();
}

export {
  bars, line,
  frame, stateBlock, empty, error, skeleton, statGrid, delta, ranked, levers, legend,
  PALETTE, colorFor, formatValue, formatSigned, niceTicks, axisFormatter, truncateMiddle, langOf,
};
export const format = formatValue;

export const viz = {
  statGrid, bars, line, spark, radar, gauge, donut, heatmap, timeline, canvasLine,
  skeleton, empty, error, stateBlock, delta, ranked, levers, legend,
  format: formatValue, formatSigned, niceTicks, axisFormatter, colorFor, truncateMiddle,
};
export default viz;
