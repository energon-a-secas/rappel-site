/* ══════════════════════════════════════════════════════════════
 * @neorgon/ui, Viz Kit v2: HTML blocks
 *
 * frame, the state block (empty, error, skeleton), statGrid v2, the delta
 * line, ranked (a sortable table with in-cell bars), levers (signed bars
 * from a zero line) and legend. Every builder returns a string; behaviour
 * that needs the page (sorting, picking, actions) lives in viz-runtime.js
 * and reaches the site as bubbling `viz:*` events.
 * ════════════════════════════════════════════════════════════ */

import {
  esc, clamp, colorFor, paletteAt, formatValue, formatSigned, unknownWord, word, truncateMiddle, langOf,
} from './viz-format.js';

/** Wrap a body in the standard .viz-panel frame (title and scale readout). */
export function frame(body, o = {}) {
  if (o.frame === false) return body;
  const head = (o.title || o.scale)
    ? `<div class="viz-head">${o.title ? `<span class="viz-title">${esc(o.title)}</span>` : ''}${o.scale ? `<span class="viz-scale">${esc(o.scale)}</span>` : ''}</div>`
    : '';
  const warn = o.warn ? ` data-viz-warn="${esc(o.warn)}"` : '';
  return `<div class="viz-panel"${warn}>${head}${body}</div>`;
}

/** Frame only when a title or scale asks for one (blocks that are not charts). */
const frameIfTitled = (body, o) => (o.frame !== false && (o.title || o.scale) ? frame(body, o) : body);

/* ── State block ───────────────────────────────────────────── */
/**
 * One sentence per cause, then an optional next step.
 *   state    'empty' | 'nomatch' | 'partial' | 'error' | 'loading'
 *   o.next   a second, shorter sentence (what to do, or where the data ends)
 *   o.action { label, id } renders <button data-viz-action="id">; the runtime
 *            dispatches a bubbling `viz:action` event with detail { id }.
 */
export function stateBlock(state, msg, o = {}) {
  const legacy = state === 'error' ? ' viz-error' : state === 'loading' ? '' : ' viz-empty';
  const action = o.action && o.action.label
    ? `<button type="button" class="viz-state__action" data-viz-action="${esc(o.action.id || 'action')}">${esc(o.action.label)}</button>`
    : '';
  const next = o.next || action
    ? `<p class="viz-state__next">${o.next ? `${esc(o.next)}${action ? ' ' : ''}` : ''}${action}</p>`
    : '';
  return `<div class="viz-state${legacy}" data-state="${esc(state)}" role="status"><p class="viz-state__title">${esc(msg)}</p>${next}</div>`;
}

export function empty(msg, o = {}) {
  const text = msg ?? (word('noData', o));
  return frame(stateBlock(o.state || 'empty', text, o), o);
}
export function error(msg, o = {}) {
  const text = msg ?? word('loadError', o);
  return frame(stateBlock('error', text, o), o);
}
export function skeleton(o = {}) {
  const h = Number(o.height) || 120;
  return frame(`<div class="viz-skeleton" role="status" aria-busy="true" style="--viz-skel-h:${h}px"><span class="viz-sr">${esc(word('loading', o))}</span></div>`, o);
}

/* ── Delta ─────────────────────────────────────────────────── */
/**
 * A change, with arrow, sign and word beside the colour, so a cost rise is
 * never green. d: a number (legacy: a rise is good) or
 *   { value, goodWhen: 'up'|'down'|'neutral', format?, text?, dir? }
 * text replaces the default word ("up", "down", "no change").
 */
export function delta(d, o = {}) {
  if (d == null) return '';
  const spec = typeof d === 'object' ? d : { value: d };
  const v = Number(spec.value);
  const dir = spec.dir || (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
  const goodWhen = spec.goodWhen || o.goodWhen || 'up';
  const tone = dir === 'flat' || goodWhen === 'neutral' ? 'neutral' : dir === goodWhen ? 'good' : 'bad';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
  const fmt = spec.format || o.deltaFormat || 'number';
  const signed = Number.isFinite(v) ? formatSigned(v, fmt, o) : unknownWord(o);
  const text = spec.text != null ? spec.text : word(dir, o);
  return `<span class="viz-delta viz-delta--${tone}" data-dir="${dir}" data-good="${esc(goodWhen)}"><span class="viz-delta__arrow" aria-hidden="true">${arrow}</span> ${esc(signed)}${text ? ` ${esc(text)}` : ''}</span>`;
}

/* ── Stat grid v2 ──────────────────────────────────────────── */
/**
 * items: [{ label, value, format?, foot?, footHtml?, delta?, lead?, state?, edited?,
 *           unknown?, emptyText?, errorText? }]
 *   value null or undefined reads as unknown, never 0.
 *   state 'loading' | 'empty' | 'unknown' | 'edited' | 'error'
 *   edited true (or a word) adds an info pill to the label.
 * o: { cols (most per row, default up to 4), minWidth (px a tile keeps before the row
 *      wraps, default 166, so two fit at 390 and one below 340), format, unknown, empty,
 *      label (the list's accessible name), state: 'loading' (with count tiles), valueFirst
 *      (the figure above its label), goodWhen, lang }
 */
export function statGrid(items = [], o = {}) {
  const loadingGrid = o.state === 'loading';
  if (!items.length && !loadingGrid) return empty(o.emptyText || 'No stats', o.frame === false ? { frame: false } : {});
  const list = items.length ? items : Array.from({ length: o.count || 4 }, () => ({ label: '' }));
  const span = list.reduce((n, it) => n + (it.lead ? 2 : 1), 0);
  const cols = clamp(Math.round(Number(o.cols)) || Math.min(span, 4), 1, 6);
  const min = Number(o.minWidth) > 0 ? `;--viz-stat-min:${Math.round(Number(o.minWidth))}px` : '';
  const attrs = [
    `class="viz-stats"`, `data-cols="${cols}"`, `style="--viz-cols:${cols}${min}"`,
    o.label ? `aria-label="${esc(o.label)}"` : '',
    loadingGrid ? 'aria-busy="true"' : '',
    o.valueFirst ? 'data-order="value"' : '',
  ].filter(Boolean).join(' ');
  return `<dl ${attrs}>${list.map((it) => statTile(it, o, loadingGrid)).join('')}</dl>`;
}

function statTile(it, o, loadingGrid) {
  const state = loadingGrid ? 'loading'
    : it.state || (it.value == null ? 'unknown' : it.edited ? 'edited' : '');
  const io = { ...o, unknown: it.unknown ?? o.unknown };
  let value;
  if (state === 'loading') {
    value = `<span class="viz-skel" aria-hidden="true"></span><span class="viz-sr">${esc(word('loading', o))}</span>`;
  } else if (state === 'empty') {
    value = esc(it.emptyText || o.empty || word('none', o));
  } else if (state === 'unknown') {
    value = esc(unknownWord(io));
  } else if (state === 'error') {
    value = esc(it.errorText || word('error', o));
  } else {
    const f = it.format || o.format;
    value = esc(typeof it.value === 'number' || f ? formatValue(it.value, f || 'number', io) : String(it.value));
  }
  const pill = it.edited
    ? ` <span class="viz-pill viz-pill--info">${esc(typeof it.edited === 'string' ? it.edited : word('edited', o))}</span>`
    : '';
  const foot = it.footHtml != null ? `<dd class="viz-stat__foot">${it.footHtml}</dd>`
    : it.foot != null ? `<dd class="viz-stat__foot">${esc(it.foot)}</dd>` : '';
  const d = it.delta != null ? `<dd class="viz-stat__delta">${delta(it.delta, o)}</dd>` : '';
  const cls = `viz-stat${it.lead ? ' viz-stat--lead' : ''}`;
  const st = state ? ` data-state="${state}"` : '';
  const busy = state === 'loading' ? ' aria-busy="true"' : '';
  return `<div class="${cls}"${st}${busy}><dt class="viz-stat__label">${esc(it.label)}${pill}</dt><dd class="viz-stat__value">${value}</dd>${foot}${d}</div>`;
}

/* ── Ranked list ───────────────────────────────────────────── */
/**
 * A sortable table with in-cell bars, for a breakdown.
 * rows: [{ key, label?, sub?, picked?, dim?, values?: {colId: value}, [colId]: value }]
 * o.columns  [{ id, label, format?, bar?: true, sortable?: true }] value columns;
 *            the bar sits in the column marked bar (else the first)
 * o.name     head of the name column ('Project'), o.caption (visually hidden)
 * o.sort     { by: colId | 'name', dir: 'desc' | 'asc' } (default: the bar column, desc)
 * o.pick     false for plain names (default: a pick button with aria-pressed)
 * o.unknown  the word for unknown values; o.note a line under the table
 * Unknown values sort last, show the word and draw no bar. Dimmed rows stay.
 */
export function ranked(rows = [], o = {}) {
  const cols = o.columns && o.columns.length ? o.columns : [{ id: 'value', label: o.valueLabel || 'Value', format: o.format, bar: true }];
  const barCol = cols.find((c) => c.bar) || cols[0];
  if (!rows.length) return frameIfTitled(stateBlock('empty', o.emptyText || word('noData', o), o), o);
  const valOf = (r, c) => (r.values && c.id in r.values ? r.values[c.id] : r[c.id]);
  const nameOf = (r) => String(r.label ?? r.key ?? '');
  const known = (v) => v != null && Number.isFinite(Number(v));
  const sort = o.sort || { by: barCol.id, dir: 'desc' };
  const sortCol = cols.find((c) => c.id === sort.by);
  const dirMul = sort.dir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sort.by === 'name' || !sortCol) return dirMul * nameOf(a).localeCompare(nameOf(b), undefined, { numeric: true });
    const va = valOf(a, sortCol), vb = valOf(b, sortCol);
    if (!known(va) || !known(vb)) return known(va) ? -1 : known(vb) ? 1 : 0;
    return dirMul * (Number(va) - Number(vb));
  });
  const max = Math.max(0, ...rows.map((r) => Number(valOf(r, barCol))).filter(Number.isFinite)) || 1;
  const ariaSort = (id) => (sort.by === id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  const head = (id, label, numeric, sortable) => {
    const cls = numeric ? ' class="n"' : '';
    if (sortable === false) return `<th role="columnheader" scope="col"${cls}>${esc(label)}</th>`;
    return `<th role="columnheader" scope="col"${cls} aria-sort="${ariaSort(id)}"><button type="button" class="viz-ranked__sort" data-viz-sort="${esc(id)}">${esc(label)}</button></th>`;
  };
  const thead = `<thead role="rowgroup"><tr role="row">${head('name', o.name || 'Name', false, o.sortName)}${cols.map((c) => head(c.id, c.label, true, c.sortable)).join('')}</tr></thead>`;

  const body = sorted.map((r) => {
    const full = nameOf(r);
    const shown = truncateMiddle(full, o.truncate || 28);
    const pickKey = esc(r.key ?? full);
    const name = o.pick === false
      ? `<span class="viz-ranked__name" title="${esc(full)}">${esc(shown)}</span>`
      : `<button type="button" class="viz-ranked__pick" aria-pressed="${r.picked ? 'true' : 'false'}" data-viz-pick="${pickKey}" title="${esc(full)}"${shown !== full ? ` aria-label="${esc(full)}"` : ''}>${esc(shown)}</button>`;
    const cells = cols.map((c) => {
      const v = valOf(r, c);
      const ok = known(v);
      const text = ok ? formatValue(Number(v), c.format || o.format || 'number', o) : unknownWord({ ...o, unknown: c.unknown ?? o.unknown });
      const numCls = ok ? 'viz-ranked__num' : 'viz-ranked__num viz-unknown';
      if (c !== barCol) {
        return `<td role="cell" class="n" data-v="${ok ? Number(v) : ''}" data-label="${esc(c.label)}"><span class="${numCls}">${esc(text)}</span></td>`;
      }
      const bar = ok ? `<span class="viz-ranked__bar" style="--v:${clamp(Number(v) / max, 0, 1).toFixed(4)}"></span>` : '';
      const sub = r.sub ? `<span class="viz-ranked__sub">${esc(r.sub)}</span>` : '';
      return `<td role="cell" class="n viz-ranked__barcell" data-v="${ok ? Number(v) : ''}" data-label="${esc(c.label)}">`
        + `<span class="viz-ranked__cell"><span class="viz-ranked__track" aria-hidden="true">${bar}</span><span class="${numCls}">${esc(text)}</span></span>${sub}</td>`;
    }).join('');
    const cls = [r.picked ? 'is-picked' : '', r.dim ? 'is-dim' : ''].filter(Boolean).join(' ');
    return `<tr role="row" data-key="${pickKey}"${cls ? ` class="${cls}"` : ''}><th role="rowheader" scope="row" data-v="${esc(full)}">${name}</th>${cells}</tr>`;
  }).join('');

  const caption = o.caption ? `<caption class="${o.captionVisible ? 'viz-ranked__caption' : 'viz-sr'}">${esc(o.caption)}</caption>` : '';
  const label = !o.caption && (o.label || o.title) ? ` aria-label="${esc(o.label || o.title)}"` : '';
  const note = o.note ? `<p class="viz-ranked__note">${esc(o.note)}</p>` : '';
  // Explicit roles: the phone layout changes the table's display, which drops native
  // table semantics in WebKit unless the roles are stated.
  const table = `<div class="viz-ranked-wrap"><table role="table" class="viz-ranked${o.pick === false ? '' : ' viz-ranked--pick'}"${label}>${caption}${thead}<tbody role="rowgroup">${body}</tbody></table>${note}</div>`;
  return frameIfTitled(table, o);
}

/* ── Lever list ────────────────────────────────────────────── */
/**
 * What moves a number: one signed bar per lever, drawn from a zero line.
 * items: [{ label, delta, share? }]  (share is delta over the baseline)
 * o: { format: 'usd' (the delta's), baseline?, goodWhen: 'down' (cost: a rise is bad),
 *      label (the list's accessible name), title?, scale? }
 * A rise in a cost reads in the warn tone, a saving in the ok tone, and both
 * carry their sign and percent of the baseline in text.
 */
export function levers(items = [], o = {}) {
  const fmt = o.format || 'number';
  const goodWhen = o.goodWhen || 'down';
  const list = items.filter((it) => Number.isFinite(Number(it.delta)));
  if (!list.length) return frameIfTitled(stateBlock('empty', o.emptyText || word('noData', o), o), o);
  const pos = Math.max(0, ...list.map((it) => Number(it.delta)));
  const neg = Math.max(0, ...list.map((it) => -Number(it.delta)));
  const span = pos + neg || 1;
  const zero = neg / span;
  const pct = (p) => {
    const t = Math.abs(p * 100).toLocaleString(langOf(o) === 'es' ? 'es-CL' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return `${p > 0 ? '+' : p < 0 ? '-' : ''}${t}%`;
  };
  const lis = list.map((it) => {
    const d = Number(it.delta);
    const dir = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
    const tone = dir === 'flat' || goodWhen === 'neutral' ? 'neutral' : dir === goodWhen ? 'good' : 'bad';
    const w = Math.abs(d) / span;
    const a = d >= 0 ? zero : zero - w;
    const share = it.share != null ? Number(it.share) : (o.baseline ? d / o.baseline : null);
    const shareHtml = share != null && Number.isFinite(share)
      ? `<span class="viz-lever__share">${esc(pct(share))}<span class="viz-sr"> ${esc(word('ofBaseline', o))}</span></span>`
      : '<span class="viz-lever__share"></span>';
    return `<li class="viz-lever viz-lever--${tone}" data-sign="${d > 0 ? '+' : d < 0 ? '-' : '0'}" data-tone="${tone}">`
      + `<span class="viz-lever__name">${esc(it.label)}</span>`
      + `<span class="viz-lever__track" aria-hidden="true" style="--z:${(zero * 100).toFixed(2)}%"><span class="viz-lever__bar" style="--a:${(a * 100).toFixed(2)}%;--w:${(w * 100).toFixed(2)}%"></span></span>`
      + `<span class="viz-lever__delta">${esc(formatSigned(d, fmt, o))}</span>${shareHtml}</li>`;
  }).join('');
  const label = o.label || o.title;
  return frameIfTitled(`<div class="viz-levers-wrap"><ol class="viz-levers"${label ? ` aria-label="${esc(label)}"` : ''}>${lis}</ol></div>`, o);
}

/* ── Legend ────────────────────────────────────────────────── */
/**
 * Swatch, label and value, beside a chart (never above content to explain it).
 * items: [{ label, color?, key?, value?, share?, format?, muted? }]
 *   value: a number (formatted), a string (as is) or null (the unknown word)
 * o: { format, colorBy: 'key' (colorFor) | 'index' (palette, default), colors,
 *      shape: 'square' | 'line', label (accessible name), unknown }
 */
export function legend(items = [], o = {}) {
  const lis = items.map((it, i) => {
    const color = it.color || (o.colorBy === 'key' ? colorFor(it.key ?? it.label) : paletteAt(i, o.colors));
    let val = '';
    if (it.value !== undefined) {
      const text = typeof it.value === 'string' ? it.value
        : formatValue(it.value, it.format || o.format || 'number', { ...o, unknown: it.unknown ?? o.unknown });
      val += `<span class="viz-legend__value${it.value === null ? ' viz-unknown' : ''}">${esc(text)}</span>`;
    }
    if (it.share != null) val += `<span class="viz-legend__share">${esc(formatValue(it.share, 'share', o))}</span>`;
    return `<li class="viz-legend__item${it.muted ? ' is-muted' : ''}"><span class="viz-legend__swatch" style="--c:${esc(color)}" aria-hidden="true"></span><span class="viz-legend__label">${esc(it.label)}</span>${val}</li>`;
  }).join('');
  const shape = o.shape === 'line' ? ' viz-legend--line' : '';
  return `<ul class="viz-legend${shape}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}>${lis}</ul>`;
}
