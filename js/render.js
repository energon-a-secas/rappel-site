/**
 * Screens other than the review surface: the deck library, browse, stats and
 * settings, and the navigation model all of them share.
 *
 * Actions are wired in js/events.js by delegation, so there is no inline
 * onclick anywhere here. What lives in this file instead is the half of
 * navigation that belongs to the markup: which control is the single tab stop
 * of its group, where the keyboard goes after innerHTML has thrown the old
 * tree away, and what a person who cannot see the screen change is told.
 */

import { state, ledgerBytes, LEDGER_LIMIT_BYTES } from './state.js';
import { expandCards, deckName, needsAttribution } from './deck.js';
import { deckCounts } from './ledger.js';
import { renderStats } from './stats.js';
import { renderCard } from './render-session.js';
import { renderBrowse } from './render-browse.js';
import { renderSettings } from './render-settings.js';
import { escHtml, mib, $, t, fill, UI } from './utils.js';
import { bindInput } from './transforms.js';
import { humanGap } from './scheduler.js';
import { account } from './account.js';

/** The overflow menu, as [action, dictionary key]. */
const DECK_MENU = [['cram', 'cram'], ['browse', 'browse'], ['export-deck', 'deckJson'], ['export-tsv', 'tsv'], ['forget', 'forget']];
/** Arrow keys as a step. Both axes: the rail is a column at 940px, a row below. */
const STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

let lastView = null;
let lastFront = '';
let lastFlipped = false;
let rowIndex = 0;
let navBound = false;

/** The engine's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

function root() {
  return $('viewRoot');
}
/** Relabel the static shell: data-ui is text, data-ui-html markup, data-ui-aria a name. */
function applyChrome() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-ui]').forEach((n) => { n.textContent = L(n.dataset.ui); });
  document.querySelectorAll('[data-ui-html]').forEach((n) => { n.innerHTML = L(n.dataset.uiHtml); });
  document.querySelectorAll('[data-ui-aria]').forEach((n) => { n.setAttribute('aria-label', L(n.dataset.uiAria)); });
}
/**
 * The whole page, from state. `focusAfter` is an optional selector in the new
 * tree; with none given, focusTarget() works one out and never answers `body`.
 */
export async function render(focusAfter) {
  const el = root();
  if (!el) return;
  initNav();
  applyChrome();
  paintRail();

  const held = !!document.activeElement && document.activeElement !== document.body;
  const prevKey = focusKeyOf(document.activeElement);
  const viewChanged = state.view !== lastView;
  if (viewChanged) rowIndex = 0;

  const views = { session: renderCard, browse: () => renderBrowse(renderLibrary), settings: renderSettings, stats: renderStats };
  el.innerHTML = await (views[state.view] || renderLibrary)();
  lastView = state.view;

  renderAttribution();
  dressSession();
  paintRows();
  // "Skip to content" promises this screen's own heading, not the div holding it.
  $('skipMain')?.setAttribute('href', `#${el.querySelector('h2')?.id || 'viewRoot'}`);
  const box = el.querySelector('.rp-typed');
  if (box) bindInput(box, box.dataset.transform);
  // Restoring focus is for a repaint that TOOK it. When nothing held the
  // keyboard (the first paint, a background repaint from a sync event), only a
  // control that actively wants it gets it: a ring on a heading the visitor
  // never navigated to is noise, not an affordance.
  const aim = focusTarget(focusAfter, prevKey, viewChanged);
  if (held || aim?.matches('.rp-typed, [data-autofocus]')) applyFocus(aim);
  announceSession();
}

/* ── Focus ────────────────────────────────────────────────────────────────
 * innerHTML throws away the node holding the keyboard and the browser's answer
 * is body, from which Tab starts again at the top of the document: a keyboard
 * session was a page-length walk back to the card after every answer. Every
 * repaint now ends by choosing a target, first match wins: an explicit
 * selector, [data-autofocus], the answer box, the card region, the view's h2
 * when the view changed, what had focus before (by data-focus-key), the h2.
 */
function focusKeyOf(el) {
  if (!el || el === document.body || !el.dataset) return null;
  if (el.dataset.focusKey) return el.dataset.focusKey;
  if (el.dataset.act) return `${el.dataset.act}:${el.dataset.deck || ''}`;
  return el.id ? `#${el.id}` : null;
}
function byFocusKey(key) {
  if (!key) return null;
  if (key.startsWith('#')) return document.getElementById(key.slice(1));
  return document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
}
function focusTarget(sel, prevKey, viewChanged) {
  const el = root();
  if (!el) return null;
  if (sel) return el.querySelector(sel) || document.querySelector(sel);
  return el.querySelector('[data-autofocus]') || el.querySelector('.rp-typed') || el.querySelector('.rp-card')
    || (viewChanged ? null : byFocusKey(prevKey)) || el.querySelector('h2') || el;
}
function applyFocus(el) {
  if (!el) return;
  if (!/^(a|button|input|select|textarea)$/i.test(el.tagName) && !el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
  el.focus();
  // A repaint mid-answer must not drop the caret in front of what is typed.
  if (el.classList.contains('rp-typed')) el.setSelectionRange(el.value.length, el.value.length);
}

/**
 * #announce is in index.html and empty at load, because a region created with
 * its text already in it is not reliably read. Written one frame after the
 * paint and cleared first, so the same card answered twice still speaks.
 */
function say(text) {
  const el = $('announce');
  if (!el || !text) return;
  el.textContent = '';
  requestAnimationFrame(() => { el.textContent = text; });
}

/**
 * A safety net that sets only what is absent. js/render-session.js now names
 * the card region and the progress bar itself, so every keep() below is a
 * no-op; what is still live is hiding "Skip to the card" when there is none.
 */
function dressSession() {
  const el = root();
  const s = state.session;
  const card = el.querySelector('.rp-card');
  const skip = $('skipCard');
  const keep = (n, k, v) => { if (n && !n.hasAttribute(k)) n.setAttribute(k, v); };
  if (skip) skip.hidden = !card;
  if (!card || !s) return;
  if (!card.id) card.id = 'rpCard';
  keep(card, 'tabindex', '-1');
  keep(card, 'role', 'group');
  keep(card, 'aria-label', L('cardRegion', Math.min(s.answered + 1, s.queued), s.queued));
  const bar = el.querySelector('.rp-progress[role="progressbar"]');
  const progress = L('progressText', s.answered, s.queued);
  keep(bar, 'aria-label', progress);
  keep(bar, 'aria-valuetext', progress);
}

/** Text as a reader would get it: an [aria-hidden] child is decoration. */
function readable(el) {
  if (!el) return '';
  return [...el.childNodes].map((n) => (n.nodeType !== 1 ? n.textContent : (n.getAttribute('aria-hidden') === 'true' ? '' : readable(n)))).join('').replace(/\s+/g, ' ').trim();
}
/**
 * What changed on the review surface, said once: the grade just given, the
 * front of each new card, the answer on a reveal, the summary at the end.
 */
function announceSession() {
  const el = root();
  const s = state.session;
  const card = state.view === 'session' ? el.querySelector('.rp-card') : null;
  if (!card) {
    if (state.view === 'session' && lastFront) say(L('sessionDone'));
    lastFront = '';
    lastFlipped = false;
    return;
  }
  const front = readable(el.querySelector('.rp-face--front'));
  const flipped = !!el.querySelector('.rp-face--back');
  const n = Math.min((s?.answered || 0) + 1, s?.queued || 0);
  if (front && `${s?.answered ?? 0}|${front}` !== lastFront) {
    const tally = n > 1 && (n - 1) % 5 === 0 ? ` ${L('progressText', s.answered, s.queued)}` : '';
    // The chip reporting the grade just given is visual, and was only that.
    const ack = readable(el.querySelector('.rp-card__ack'));
    say((ack ? `${ack}. ` : '') + L('announceFront', n, s?.queued || 0, front) + tally);
  } else if (flipped && !lastFlipped) {
    const back = readable(el.querySelector('.rp-face--back'));
    say([readable(el.querySelector('.rp-verdict')), back ? L('answerIs', back) : ''].filter(Boolean).join(' '));
  }
  lastFront = front ? `${s?.answered ?? 0}|${front}` : '';
  lastFlipped = flipped;
}
/* ── The rail ─────────────────────────────────────────────────────────────
 * A nav, not a tablist: its items lead to whole screens with their own
 * headings, not to panels beside a tab strip. aria-current is set on the
 * current item and REMOVED from the others: "false" is not absent, readers
 * announce the attribute's presence, so a rail that spelled it out everywhere
 * had three items each claiming a state. A roving tabindex makes it one stop.
 */
function paintRail() {
  const items = [...document.querySelectorAll('.nav-link[data-view]')];
  items.forEach((b) => {
    const on = b.dataset.view === state.view;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
    b.tabIndex = on ? 0 : -1;
  });
  // browse and session are reached from a deck, so on those screens nothing is
  // current and the rail would otherwise have no tab stop at all.
  if (items.length && !items.some((b) => b.tabIndex === 0)) items[0].tabIndex = 0;
}
/* ── Deck rows ────────────────────────────────────────────────────────────
 * Both lists carry .rp-decks, a person's decks and the shelf, and they rove as
 * one group: the library is two tab stops (a row's Study, then its menu) and
 * not one per button, which at six a row was 24 before the shelf started.
 */
const deckRows = () => [...document.querySelectorAll('.rp-decks .rp-deck')];
function paintRows(to, move) {
  const rows = deckRows();
  if (!rows.length) return;
  rowIndex = Math.max(0, Math.min(to ?? rowIndex, rows.length - 1));
  rows.forEach((r, i) => r.querySelectorAll('.rp-deck__go, .rp-menu__btn').forEach((b) => { b.tabIndex = i === rowIndex ? 0 : -1; }));
  if (move) rows[rowIndex].querySelector('.rp-deck__go')?.focus();
}

const menuList = (btn) => document.getElementById(btn.getAttribute('aria-controls'));
function closeMenus(except) {
  document.querySelectorAll('.rp-menu__btn[aria-expanded="true"]').forEach((btn) => {
    if (btn === except) return;
    btn.setAttribute('aria-expanded', 'false');
    if (menuList(btn)) menuList(btn).hidden = true;
  });
}
function openMenu(btn, focusFirst) {
  closeMenus(btn);
  const list = menuList(btn);
  if (!list) return;
  btn.setAttribute('aria-expanded', 'true');
  list.hidden = false;
  if (focusFirst) list.querySelector('[role="menuitem"]')?.focus();
}

/** Returns true when the menu consumed the key, so nothing else reads it. */
function menuKey(e, menu) {
  const btn = menu.querySelector('.rp-menu__btn');
  const items = [...menu.querySelectorAll('[role="menuitem"]')];
  if (!btn || !items.length) return false;
  if (e.target === btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    openMenu(btn, true);
    if (e.key === 'ArrowUp') items[items.length - 1].focus();
    return true;
  }
  if (btn.getAttribute('aria-expanded') !== 'true') return false;
  if (e.key === 'Escape') { e.preventDefault(); closeMenus(); btn.focus(); return true; }
  if (e.key === 'Tab') { closeMenus(); return false; }
  const at = items.indexOf(document.activeElement);
  if (at < 0) return false;
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
  if (to === undefined) return false;
  e.preventDefault();
  items[(to + items.length) % items.length].focus();
  return true;
}
function railKey(e, rail) {
  const items = [...rail.querySelectorAll('.nav-link[data-view]')];
  const at = items.indexOf(document.activeElement);
  const to = at < 0 ? undefined : (STEP[e.key] ? at + STEP[e.key] : { Home: 0, End: items.length - 1 }[e.key]);
  if (to === undefined) return;
  e.preventDefault();
  const next = items[Math.max(0, Math.min(items.length - 1, to))];
  items.forEach((b) => { b.tabIndex = b === next ? 0 : -1; });
  next.focus();
}
function rowKey(e) {
  const go = e.target.classList.contains('rp-deck__go');
  const to = { ArrowDown: rowIndex + 1, ArrowUp: rowIndex - 1, Home: 0, End: deckRows().length - 1 }[e.key];
  if (to !== undefined) { e.preventDefault(); paintRows(to, true); return; }
  // Left and right cross between the row's two controls; Tab does the same,
  // and leaves the list after the second one.
  if (e.key === 'ArrowRight' && go) e.target.closest('.rp-deck').querySelector('.rp-menu__btn')?.focus();
  else if (e.key === 'ArrowLeft' && !go) e.target.closest('.rp-deck').querySelector('.rp-deck__go')?.focus();
  else return;
  e.preventDefault();
}

/**
 * The keyboard and pointer behaviour of the navigation itself, bound once.
 * Nothing here performs an action: a menu item carries its own data-act and
 * js/events.js runs it, so this only decides what has focus and what is open.
 */
function initNav() {
  if (navBound) return;
  navBound = true;
  document.addEventListener('focusin', (e) => {
    const row = e.target.closest?.('.rp-decks .rp-deck');
    const at = row ? deckRows().indexOf(row) : -1;
    if (at >= 0 && at !== rowIndex) paintRows(at);
  });
  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('.rp-menu__btn');
    if (toggle) {
      if (toggle.getAttribute('aria-expanded') === 'true') closeMenus();
      else openMenu(toggle, false);
      return;
    }
    // A menu item's action is events.js's; this only puts the menu away and
    // hands the keyboard back to the button that opened it.
    const item = e.target.closest('.rp-menu__item');
    if (item) {
      const btn = item.closest('.rp-menu')?.querySelector('.rp-menu__btn');
      closeMenus();
      btn?.focus();
      return;
    }
    if (!e.target.closest('.rp-menu')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const menu = e.target.closest?.('.rp-menu');
    if (menu && menuKey(e, menu)) return;
    const rail = e.target.closest?.('.shell__rail');
    if (rail) railKey(e, rail);
    else if (e.target.closest?.('.rp-decks .rp-deck')) rowKey(e);
  });
}

/**
 * The licence acknowledgement, at the foot of the main content region and in
 * the site's own markup rather than in the footer kit. C11.3: the licence asks
 * for it on each screen display, the kit's minimal footer is budgeted at one
 * line of about 70px, and the EDRDG wording is 213 characters.
 */
export function renderAttribution() {
  const holder = $('attrib');
  if (!holder) return;
  const decks = state.view === 'session' || state.view === 'browse'
    ? [state.decks[state.activeDeckId]].filter(Boolean)
    : Object.values(state.decks);
  const lines = [...new Set(decks.filter(needsAttribution).map((d) => d.attribution))];
  if (lines.length === 0) {
    holder.hidden = true;
    holder.innerHTML = '';
    return;
  }
  const out = (href, text) => ` <a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  const wiki = 'https://www.edrdg.org/wiki/index.php/';
  holder.hidden = false;
  holder.innerHTML = lines.map((line) => {
    const src = decks.find((d) => d.attribution === line)?.source;
    // A deck document is data from anywhere: only an http(s) URL becomes a link.
    const safe = typeof src === 'string' && /^https?:\/\//i.test(src) ? src : null;
    // C11.2: the EDRDG wording is accompanied by the two project pages.
    const edrdg = /Electronic Dictionary Research/.test(line)
      ? out(`${wiki}JMdict-EDICT_Dictionary_Project`, 'JMdict') + out(`${wiki}KANJIDIC_Project`, 'KANJIDIC')
      : '';
    return `<p class="neo-attrib__line">${escHtml(line)}${safe ? out(escHtml(safe), escHtml(L('licence'))) : ''}${edrdg}</p>`;
  }).join('');
}

/**
 * One sentence per row, and exactly one of the three states is drawn. The
 * accent is spent on `ready` alone, so a library with nothing due is
 * monochrome and the deck with work waiting is the only coloured thing on it.
 * The row this replaces drew "0 due" in that same accent.
 */
function deckReadout(deck) {
  const c = deckCounts(deck.id, expandCards(deck).map((card) => card.id));
  const rows = state.ledger.decks[deck.id]?.cards;
  const waiting = c.due + c.new;
  if (!(rows && Object.keys(rows).length)) return { text: L('deckUntouched', c.total), ready: false, split: '' };
  if (waiting > 0) {
    return { text: L('deckReady', waiting), ready: true, split: c.due && c.new ? L('readoutSplit', c.due, c.new) : '' };
  }
  return { text: c.nextDueAt ? L('deckQuiet', humanGap(c.nextDueAt - Date.now())) : L('deckUntouched', c.total), ready: false, split: '' };
}
/** One library row. A shelf deck is the same object in another state. */
function libraryRow({ id, name, readout, ready = false, split = '', act, label, menu = '' }) {
  const safe = escHtml(id);
  const line = readout ? `<p class="rp-deck__readout${ready ? ' rp-deck__readout--ready' : ''}">${escHtml(readout)}${split ? `<span class="rp-deck__split">${escHtml(split)}</span>` : ''}</p>` : '';
  return `<li class="rp-deck" data-deck="${safe}">
    <div class="rp-deck__text"><h3 class="rp-deck__name">${escHtml(name)}</h3>${line}</div>
    <button type="button" class="btn ${ready ? 'btn--primary' : 'btn--secondary'} rp-deck__go" data-act="${act}" data-deck="${safe}" data-focus-key="${act}:${safe}">${escHtml(label)}</button>
    ${menu}
  </li>`;
}
function deckRow(deck, i) {
  const safe = escHtml(deck.id);
  const name = deckName(deck, state.lang);
  const r = deckReadout(deck);
  const mid = `deckMenu${i}`;
  const items = DECK_MENU.map(([a, k]) => `<button type="button" role="menuitem" class="rp-menu__item${a === 'forget' ? ' rp-menu__item--danger' : ''}" data-act="${a}" data-deck="${safe}">${escHtml(L(k))}</button>`).join('');
  const menu = `<div class="rp-menu">
      <button type="button" class="rp-menu__btn" id="${mid}Btn" aria-haspopup="menu" aria-expanded="false" aria-controls="${mid}" aria-label="${escHtml(L('moreActions', name))}" data-focus-key="menu:${safe}"><span aria-hidden="true">···</span></button>
      <div class="rp-menu__list" id="${mid}" role="menu" aria-labelledby="${mid}Btn" hidden>${items}</div>
    </div>`;
  return libraryRow({ id: deck.id, name, readout: r.text, ready: r.ready, split: r.split, act: 'review', label: L('study'), menu });
}
function builtinRow(entry) {
  // The catalog's note is a bare string (neo-deck-index/1), so when the entry
  // carries its counts the same sentence is rebuilt in the visitor's language.
  const counted = Number.isFinite(entry.cards) && Number.isFinite(entry.notes) && entry.licence;
  const readout = counted ? L('shelfNote', entry.cards, entry.notes, entry.licence) : t(entry.note, state.lang);
  return libraryRow({ id: entry.id, name: t(entry.name, state.lang) || entry.id, readout, act: 'add-builtin', label: L('addBuiltin') });
}

/**
 * One sentence about the account path, never claiming more than it knows.
 * Signed in it says what sync does not carry: a person whose heatmap is empty
 * on a second device deserves the reason on the screen that sent them there
 * rather than only on the one they land on (C12 A4).
 */
function accountLine() {
  if (!account.available) return L('accountNone');
  return account.signedIn ? L('accountSignedIn') : L('accountSignedOut');
}

function renderLibrary() {
  const decks = Object.values(state.decks);
  const shelf = state.builtin.filter((e) => !state.decks[e.id]);
  const list = decks.length
    ? `<ul class="rp-decks" role="list">${decks.map(deckRow).join('')}</ul>`
    : `<div class="rp-panel rp-empty"><h3>${escHtml(L('noDecks'))}</h3><p>${L('noDecksHelp')}</p>
        <div class="toolbar"><button type="button" class="btn btn--primary" data-act="open-import">${escHtml(L('import'))}</button></div></div>`;

  return `<section class="section" aria-labelledby="libTitle">
    <div class="section__titles"><h2 class="section__title" id="libTitle" tabindex="-1">${escHtml(L('decks'))}</h2>
      <p class="section__lead">${escHtml(L('libraryLead'))}</p></div>
    ${list}
    ${shelf.length ? `<div class="rp-shelf"><h3 class="rp-shelf__title">${escHtml(L('shelfTitle'))}</h3>
      <ul class="rp-decks" role="list">${shelf.map(builtinRow).join('')}</ul></div>` : ''}
    <div class="rp-storage">
      <h3 class="rp-storage__title">${escHtml(L('storage'))}</h3>
      <p class="rp-note">${escHtml(L('cardMap', mib(ledgerBytes()), mib(LEDGER_LIMIT_BYTES)))}
        ${state.storageOk ? '' : `${escHtml(L('storageRefused'))} `}${escHtml(accountLine())}</p>
      <div class="toolbar"><button type="button" class="btn btn--ghost btn--sm" data-act="export-ledger">${escHtml(L('exportLedger'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="open-restore">${escHtml(L('restoreLedger'))}</button></div>
    </div>
  </section>`;
}
