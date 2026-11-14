/* ══════════════════════════════════════════════════════════════
 * @neorgon/ui, Viz Kit v2: runtime
 *
 * What a string cannot carry. viz.js installs this once per page (never in
 * Node), through delegated listeners and two observers, so a site that only
 * does `el.innerHTML = viz.bars(...)` gets all of it with no call of its own:
 *
 *   text size  every kit svg (svg.viz-svg[data-viz]) is watched; its font-size
 *              becomes 12px times (viewBox width / rendered width), so chart
 *              text renders at 12 CSS px on a phone and on a 1440 screen alike.
 *              A site can pick another size with --viz-text: 13 (unitless px).
 *   layout     y ticks that no longer fit their gutter move inside the plot,
 *              above their gridlines; x labels are thinned by measured
 *              collision (majors first, then an even step, the last kept) and
 *              kept inside the chart; end labels that would leave the chart
 *              move inside it.
 *   hover      marks carry data-viz-tip (JSON); one HTML tooltip follows the
 *              pointer, a tap on touch, and keyboard focus. Escape hides it.
 *   keyboard   marks use a roving tabindex: Tab enters a chart once, arrows,
 *              Home and End move between marks.
 *   draw       a line's draw-in drops its dash pattern on animationend.
 *   tables     viz.ranked sort buttons and row picks, and state-block actions:
 *              cancelable, bubbling `viz:sort`, `viz:pick`, `viz:action`.
 * ════════════════════════════════════════════════════════════ */

const FLAG = '__neoVizRuntime';
const BASE_PX = 12;
const GROUP = '.viz-svg, .viz-marks';

let doc = null, win = null;
let tip = null, anchor = null, activeRow = -1, pinned = false, focused = null, raf = 0;

/** Install once per window. Returns false when already installed or without a DOM. */
export function install(d = typeof document !== 'undefined' ? document : null) {
  if (!d || !d.documentElement) return false;
  const w = d.defaultView || globalThis;
  if (w[FLAG]) return false;
  w[FLAG] = true;
  doc = d; win = w;

  watchSizes();
  doc.addEventListener('pointerover', onOver, true);
  doc.addEventListener('pointerout', onOut, true);
  doc.addEventListener('pointerdown', onDown, true);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  doc.addEventListener('keydown', onKey);
  doc.addEventListener('click', onClick);
  doc.addEventListener('animationend', onAnimEnd, true);
  win.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
  win.addEventListener('resize', schedulePlace, { passive: true });
  return true;
}

/* ── Text size and layout ──────────────────────────────────── */
let ro = null;
const seen = new WeakSet();

function watchSizes() {
  if (!win.ResizeObserver) return;
  ro = new win.ResizeObserver((entries) => {
    for (const e of entries) fit(e.target, e.contentRect.width);
  });
  adopt(doc.documentElement);
  if (win.MutationObserver) {
    new win.MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) adopt(n);
      // A re-render that replaced the chart under the tooltip takes the tooltip with it.
      if (anchor && !anchor.isConnected) hideTip();
    }).observe(doc.documentElement, { childList: true, subtree: true });
  }
}

function adopt(root) {
  if (!ro || !root || root.nodeType !== 1) return;
  const list = root.matches('svg.viz-svg[data-viz]') ? [root] : root.querySelectorAll('svg.viz-svg[data-viz]');
  for (const svg of list) {
    if (seen.has(svg)) continue;
    seen.add(svg);
    ro.observe(svg);
  }
}

/** Size a kit svg's text to the CSS px it should render at, then lay out its labels. */
export function fit(svg, width) {
  const vb = svg.viewBox && svg.viewBox.baseVal;
  if (!vb || !vb.width || !width) return;
  const s = vb.width / width;
  const want = parseFloat(win.getComputedStyle(svg).getPropertyValue('--viz-text')) || BASE_PX;
  svg.style.setProperty('--viz-s', s.toFixed(4));
  svg.style.fontSize = `${(want * s).toFixed(3)}px`;
  try {
    yTicks(svg, s, vb);
    xLabels(svg, s, vb);
    endLabels(svg, s, vb);
  } catch { /* an svg that is not laid out keeps the builder's estimate */ }
}

const box = (t) => { const b = t.getBBox(); if (!b || !b.width) throw new Error('hidden'); return b; };
/** Put an attribute back to what the builder wrote, remembering it the first time. */
function reset(t, name, value) {
  const key = `data-viz-${name}`;
  if (!t.hasAttribute(key)) t.setAttribute(key, t.getAttribute(name) ?? '');
  const orig = t.getAttribute(key);
  if (value === undefined) { if (orig === '') t.removeAttribute(name); else t.setAttribute(name, orig); } else t.setAttribute(name, value);
}

/** Y ticks that would leave the chart's left edge move inside the plot, above their gridlines. */
function yTicks(svg, s, vb) {
  const ticks = [...svg.querySelectorAll('.viz-ytick')];
  if (!ticks.length) return;
  for (const t of ticks) { reset(t, 'x'); reset(t, 'text-anchor'); reset(t, 'dominant-baseline'); reset(t, 'dy'); }
  svg.classList.remove('viz-yin');
  const left = Math.min(...ticks.map((t) => box(t).x));
  if (left >= vb.x - s) return;
  svg.classList.add('viz-yin');
  for (const t of ticks) {
    const x = Number(t.getAttribute('data-viz-x'));
    reset(t, 'x', String(x + 6 + 2 * s));
    reset(t, 'text-anchor', 'start');
    reset(t, 'dominant-baseline', 'auto');
    reset(t, 'dy', String(-4 * s));
  }
}

/** Keep the outer x labels inside the chart, then thin them by measured collision. */
function xLabels(svg, s, vb) {
  const labels = [...svg.querySelectorAll('.viz-xlabel')].filter((l) => l.textContent.trim());
  const n = labels.length;
  if (!n) return;
  for (const l of labels) reset(l, 'x');
  const boxes = labels.map((l) => {
    const b = box(l);
    const lo = vb.x, hi = vb.x + vb.width;
    const shift = b.x < lo ? lo - b.x : b.x + b.width > hi ? hi - b.x - b.width : 0;
    if (shift) reset(l, 'x', String(Number(l.getAttribute('data-viz-x')) + shift));
    return { x: b.x + shift, width: b.width };
  });
  if (n < 2) return;
  const gap = 6 * s;
  const clash = (i, j) => !(boxes[i].x + boxes[i].width + gap <= boxes[j].x
    || boxes[j].x + boxes[j].width + gap <= boxes[i].x);
  const keep = new Set();
  const majors = labels.map((l, i) => (l.classList.contains('viz-xlabel--major') ? i : -1)).filter((i) => i >= 0);
  if (majors.length) {
    for (const i of [...majors, 0, n - 1]) if (![...keep].some((j) => clash(i, j))) keep.add(i);
    for (let i = 0; i < n; i++) if (!keep.has(i) && ![...keep].some((j) => clash(i, j))) keep.add(i);
  } else {
    for (let every = 1; every <= n; every++) {
      const set = [];
      for (let i = 0; i < n; i += every) set.push(i);
      if (set[set.length - 1] !== n - 1) {
        if (set.length > 1 && clash(set[set.length - 1], n - 1)) set.pop();
        set.push(n - 1);
      }
      if (set.every((i, k) => k === 0 || !clash(set[k - 1], i))) { set.forEach((i) => keep.add(i)); break; }
    }
  }
  labels.forEach((l, i) => l.classList.toggle('is-off', !keep.has(i)));
}

/** Direct labels that would run past the chart's right edge sit inside it, above their line's end. */
function endLabels(svg, s, vb) {
  const labels = [...svg.querySelectorAll('.viz-endlabel')];
  if (!labels.length) return;
  for (const l of labels) { reset(l, 'x'); reset(l, 'text-anchor'); reset(l, 'dy'); }
  const right = Math.max(...labels.map((l) => { const b = box(l); return b.x + b.width; }));
  if (right <= vb.x + vb.width + s) return;
  for (const l of labels) {
    reset(l, 'x', String(Number(l.getAttribute('data-viz-x')) - 6 - 2 * s));
    reset(l, 'text-anchor', 'end');
    reset(l, 'dy', String(-10 * s));
  }
}

/* ── Tooltip ───────────────────────────────────────────────── */
const markOf = (t) => (t && t.closest ? t.closest('[data-viz-tip]') : null);

function tipEl() {
  if (tip && tip.isConnected) return tip;
  tip = doc.createElement('div');
  tip.className = 'viz-tip';
  tip.setAttribute('aria-hidden', 'true');
  tip.hidden = true;
  doc.body.appendChild(tip);
  return tip;
}

function el(tag, cls, text) {
  const n = doc.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** Fill the tooltip from a mark's data-viz-tip: { t, v, r: [[label, value, color, on]], f }. */
function fill(data, row) {
  const t = tipEl();
  t.replaceChildren();
  if (data.t) t.append(el('div', 'viz-tip__title', data.t));
  if (data.v != null) t.append(el('div', 'viz-tip__value', data.v));
  if (Array.isArray(data.r) && data.r.length) {
    const ul = el('ul', 'viz-tip__rows');
    data.r.forEach(([label, value, color, total], i) => {
      if (total) ul.append(el('li', 'viz-tip__sep'));
      const li = el('li', total ? 'is-total' : i === row ? 'is-on' : '');
      const sw = el('span', 'viz-tip__swatch');
      if (color) sw.style.background = color;
      li.append(sw, el('span', 'viz-tip__label', label), el('span', 'viz-tip__num', value));
      ul.append(li);
    });
    t.append(ul);
  }
  if (data.f) t.append(el('div', 'viz-tip__foot', data.f));
}

function show(mark, target) {
  let data;
  try { data = JSON.parse(mark.getAttribute('data-viz-tip')); } catch { return; }
  if (!data) return;
  const row = rowOf(target);
  if (anchor && anchor !== mark) anchor.classList.remove('is-active');
  anchor = mark; activeRow = row;
  mark.classList.add('is-active');
  fill(data, row);
  tip.hidden = false;
  place();
}

export function hideTip() {
  if (anchor) anchor.classList.remove('is-active');
  anchor = null; activeRow = -1; pinned = false;
  if (tip) tip.hidden = true;
}

/** Above the mark's visible part (its bars or points), else below; inside the viewport. */
function place() {
  if (!tip || tip.hidden) return;
  if (!anchor || !anchor.isConnected) { hideTip(); return; }
  const parts = anchor.querySelectorAll('.viz-bar, .viz-pt, .viz-cell');
  let r = anchor.getBoundingClientRect();
  if (parts.length) {
    const rects = [...parts].map((p) => p.getBoundingClientRect()).filter((b) => b.width || b.height);
    if (rects.length) {
      const left = Math.min(...rects.map((b) => b.left)), right = Math.max(...rects.map((b) => b.right));
      const top = Math.min(...rects.map((b) => b.top)), bottom = Math.max(...rects.map((b) => b.bottom));
      r = { left, right, top, bottom, width: right - left, height: bottom - top };
    }
  }
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const vw = doc.documentElement.clientWidth, vh = doc.documentElement.clientHeight;
  let x = r.left + r.width / 2 - w / 2;
  let y = r.top - h - 10;
  if (y < 8) y = r.bottom + 10;
  if (y + h > vh - 8) y = Math.max(8, vh - h - 8);
  x = Math.max(8, Math.min(x, vw - w - 8));
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function schedulePlace() {
  if (raf || !tip || tip.hidden) return;
  raf = win.requestAnimationFrame(() => { raf = 0; place(); });
}

/* ── Pointer, touch and keyboard ───────────────────────────── */
const rowOf = (t) => { const k = t && t.getAttribute ? t.getAttribute('data-k') : null; return k == null ? -1 : Number(k); };

function onOver(e) {
  if (e.pointerType === 'touch') return;
  const m = markOf(e.target);
  if (m && (m !== anchor || rowOf(e.target) !== activeRow)) show(m, e.target);
}

function onOut(e) {
  if (e.pointerType === 'touch' || !anchor || pinned || focused === anchor) return;
  const to = e.relatedTarget;
  if (to && markOf(to)) return;
  const root = anchor.closest(GROUP);
  if (to && root && root.contains(to)) return; // still inside the chart: keep it (hoverable)
  hideTip();
}

function onDown(e) {
  if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
  const m = markOf(e.target);
  if (m) { show(m, e.target); pinned = true; } else if (tip && !tip.hidden) hideTip();
}

function rove(m) {
  const group = m.closest(GROUP);
  if (!group) return;
  for (const x of group.querySelectorAll('[data-viz-tip][tabindex="0"]')) if (x !== m) x.setAttribute('tabindex', '-1');
  m.setAttribute('tabindex', '0');
}

function onFocusIn(e) {
  const m = e.target && e.target.matches && e.target.matches('[data-viz-tip]') ? e.target : null;
  if (!m) return;
  rove(m);
  focused = m;
  show(m);
}

function onFocusOut(e) {
  if (e.target !== focused) return;
  focused = null;
  if (!markOf(e.relatedTarget)) hideTip();
}

function onKey(e) {
  if (e.key === 'Escape') { if (tip && !tip.hidden) hideTip(); return; }
  const m = e.target && e.target.matches && e.target.matches('[data-viz-tip][tabindex]') ? e.target : null;
  if (!m) return;
  const group = m.closest(GROUP);
  if (!group) return;
  const list = [...group.querySelectorAll('[data-viz-tip][tabindex]')];
  const i = list.indexOf(m);
  let j;
  switch (e.key) {
    case 'ArrowRight': case 'ArrowDown': j = Math.min(list.length - 1, i + 1); break;
    case 'ArrowLeft': case 'ArrowUp': j = Math.max(0, i - 1); break;
    case 'Home': j = 0; break;
    case 'End': j = list.length - 1; break;
    default: return;
  }
  e.preventDefault();
  if (j !== i) list[j].focus();
}

function onAnimEnd(e) {
  const t = e.target;
  if (t && t.classList && t.classList.contains('viz-fx-draw')) t.classList.add('is-drawn');
}

/* ── Ranked tables and state actions ───────────────────────── */
function onClick(e) {
  const t = e.target;
  if (!t || !t.closest) return;
  const sort = t.closest('[data-viz-sort]');
  if (sort) { sortBy(sort); return; }
  const pick = t.closest('[data-viz-pick]');
  if (pick) { pickRow(pick); return; }
  const act = t.closest('[data-viz-action]');
  if (act) {
    act.dispatchEvent(new CustomEvent('viz:action', { bubbles: true, detail: { id: act.getAttribute('data-viz-action') } }));
    return;
  }
  const row = t.closest('.viz-ranked tbody tr');
  if (row && !t.closest('a, button, input, select, textarea, label, summary')) {
    const b = row.querySelector('[data-viz-pick]');
    if (b) b.click();
  }
}

/** Sort a ranked table in place unless a listener cancels `viz:sort` (to re-render itself). */
function sortBy(btn) {
  const th = btn.closest('th');
  const table = btn.closest('table');
  if (!th || !table || !table.tBodies[0]) return;
  const id = btn.getAttribute('data-viz-sort');
  const cur = th.getAttribute('aria-sort');
  const dir = cur === 'descending' ? 'asc' : cur === 'ascending' ? 'desc' : id === 'name' ? 'asc' : 'desc';
  if (!btn.dispatchEvent(new CustomEvent('viz:sort', { bubbles: true, cancelable: true, detail: { by: id, dir } }))) return;
  const idx = [...th.parentNode.children].indexOf(th);
  const val = (r) => (r.children[idx] ? r.children[idx].getAttribute('data-v') : '');
  const mul = dir === 'asc' ? 1 : -1;
  const rows = [...table.tBodies[0].rows].sort((a, b) => {
    const va = val(a), vb = val(b);
    if (id === 'name') return mul * String(va).localeCompare(String(vb), undefined, { numeric: true });
    const ka = va !== '' && va != null, kb = vb !== '' && vb != null;
    if (!ka || !kb) return ka ? -1 : kb ? 1 : 0;
    return mul * (Number(va) - Number(vb));
  });
  table.tBodies[0].append(...rows);
  for (const h of th.parentNode.children) {
    if (h.hasAttribute('aria-sort')) h.setAttribute('aria-sort', h === th ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  }
}

/** Pick one row (aria-pressed) unless a listener cancels `viz:pick`. */
function pickRow(btn) {
  const pressed = btn.getAttribute('aria-pressed') !== 'true';
  const detail = { key: btn.getAttribute('data-viz-pick'), pressed };
  if (!btn.dispatchEvent(new CustomEvent('viz:pick', { bubbles: true, cancelable: true, detail }))) return;
  const table = btn.closest('table');
  if (table) {
    for (const b of table.querySelectorAll('[data-viz-pick][aria-pressed="true"]')) {
      if (b === btn) continue;
      b.setAttribute('aria-pressed', 'false');
      const tr = b.closest('tr');
      if (tr) tr.classList.remove('is-picked');
    }
  }
  btn.setAttribute('aria-pressed', String(pressed));
  const tr = btn.closest('tr');
  if (tr) tr.classList.toggle('is-picked', pressed);
}
