/**
 * Screens other than the review surface: the deck library, browse, stats and
 * settings. Every handler is wired in js/events.js by delegation, so there is
 * no inline onclick anywhere in this project.
 */

import { state, ledgerBytes, LEDGER_LIMIT_BYTES } from './state.js';
import { expandCards, deckName, needsAttribution } from './deck.js';
import { deckCounts } from './ledger.js';
import { renderStats } from './stats.js';
import { renderCard } from './render-session.js';
import { escHtml, shortDate, mib, $, t, fill, UI } from './utils.js';
import { bindInput } from './transforms.js';
import { humanGap } from './scheduler.js';
import { account } from './account.js';

const STATE_LABEL = { new: UI.stateNew, learning: UI.stateLearning, review: UI.stateReview, relearning: UI.stateRelearning };

/** The engine's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

function root() {
  return $('viewRoot');
}

/**
 * Relabel the static shell in index.html: header buttons, the rail and both
 * dialogs. A node carries data-ui="<key>" for its text, data-ui-html="<key>"
 * when the copy holds markup, data-ui-aria="<key>" for its aria-label.
 */
function applyChrome() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll('[data-ui]').forEach((n) => { n.textContent = L(n.dataset.ui); });
  document.querySelectorAll('[data-ui-html]').forEach((n) => { n.innerHTML = L(n.dataset.uiHtml); });
  document.querySelectorAll('[data-ui-aria]').forEach((n) => { n.setAttribute('aria-label', L(n.dataset.uiAria)); });
}

/** The whole page, from state. Called after every change that alters it. */
export async function render() {
  const el = root();
  if (!el) return;
  applyChrome();
  document.querySelectorAll('.nav-link[data-view]').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.view === state.view);
    b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false');
  });
  if (state.view === 'session') el.innerHTML = renderCard();
  else if (state.view === 'browse') el.innerHTML = renderBrowse();
  else if (state.view === 'settings') el.innerHTML = renderSettings();
  else if (state.view === 'stats') el.innerHTML = await renderStats();
  else el.innerHTML = renderLibrary();
  renderAttribution();
  focusAnswerBox();
}

/**
 * Hand the keyboard to the answer box and give it live romaji conversion.
 * render() replaces the input on every card, so both happen every time.
 */
function focusAnswerBox() {
  const box = document.querySelector('.rp-typed');
  if (!box) return;
  bindInput(box, box.dataset.transform);
  box.focus();
  box.setSelectionRange(box.value.length, box.value.length);
}

/**
 * The licence acknowledgement, at the foot of the main content region and in
 * the site's own markup rather than in the footer kit. C11.3: the licence asks
 * for it on each screen display, the footer kit's minimal mode is budgeted at
 * one line of about 70px, and the EDRDG wording is 213 characters.
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
  holder.hidden = false;
  holder.innerHTML = lines.map((line) => {
    const src = decks.find((d) => d.attribution === line)?.source;
    // A deck document is data from anywhere: only an http(s) URL becomes a link.
    const safe = typeof src === 'string' && /^https?:\/\//i.test(src) ? src : null;
    const link = safe ? ` <a href="${escHtml(safe)}" target="_blank" rel="noopener noreferrer">${escHtml(L('licence'))}</a>` : '';
    // C11.2: the EDRDG wording is accompanied by the two project pages.
    const edrdg = /Electronic Dictionary Research/.test(line)
      ? ' <a href="https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project" target="_blank" rel="noopener noreferrer">JMdict</a> <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" target="_blank" rel="noopener noreferrer">KANJIDIC</a>'
      : '';
    return `<p class="neo-attrib__line">${escHtml(line)}${link}${edrdg}</p>`;
  }).join('');
}

function deckRow(deck) {
  const ids = expandCards(deck).map((c) => c.id);
  const c = deckCounts(deck.id, ids);
  const next = c.nextDueAt ? L('nextIn', humanGap(c.nextDueAt - Date.now())) : L('nothingScheduled');
  return `<div class="card rp-deck" data-deck="${escHtml(deck.id)}">
    <div class="rp-deck__head">
      <h3 class="rp-deck__name">${escHtml(deckName(deck, state.lang))}</h3>
      <span class="rp-deck__version">v${escHtml(deck.version)}</span>
    </div>
    <p class="rp-deck__counts">
      <span class="rp-pill rp-pill--due">${escHtml(L('pillDue', c.due))}</span>
      <span class="rp-pill rp-pill--new">${escHtml(L('pillNew', c.new))}</span>
      <span class="rp-pill">${escHtml(L('pillCards', c.total))}</span>
      <span class="rp-deck__next">${escHtml(next)}</span>
    </p>
    <div class="toolbar">
      <button type="button" class="btn btn--primary btn--sm" data-act="review" data-deck="${escHtml(deck.id)}">${escHtml(L('review'))}</button>
      <button type="button" class="btn btn--secondary btn--sm" data-act="cram" data-deck="${escHtml(deck.id)}">${escHtml(L('cram'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="browse" data-deck="${escHtml(deck.id)}">${escHtml(L('browse'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="export-deck" data-deck="${escHtml(deck.id)}">${escHtml(L('deckJson'))}</button>
      <button type="button" class="btn btn--ghost btn--sm" data-act="export-tsv" data-deck="${escHtml(deck.id)}">${escHtml(L('tsv'))}</button>
      <button type="button" class="btn btn--danger btn--sm" data-act="forget" data-deck="${escHtml(deck.id)}">${escHtml(L('forget'))}</button>
    </div>
  </div>`;
}

function builtinRow(entry) {
  const name = t(entry.name, state.lang) || entry.id;
  // The catalog's note is a bare string (neo-deck-index/1), so when the entry
  // carries its counts the same sentence is rebuilt in the visitor's language.
  const counted = Number.isFinite(entry.cards) && Number.isFinite(entry.notes) && entry.licence;
  const note = counted ? L('shelfNote', entry.cards, entry.notes, entry.licence) : t(entry.note, state.lang);
  return `<div class="card rp-deck rp-deck--builtin">
    <div class="rp-deck__head">
      <h3 class="rp-deck__name">${escHtml(name)}</h3>
      <span class="rp-deck__version">${escHtml(L('builtIn'))}</span>
    </div>
    ${note ? `<p class="rp-note">${escHtml(note)}</p>` : ''}
    <div class="toolbar">
      <button type="button" class="btn btn--secondary btn--sm" data-act="add-builtin" data-deck="${escHtml(entry.id)}">${escHtml(L('addBuiltin'))}</button>
    </div>
  </div>`;
}

/**
 * One sentence about the account path, and it never claims more than it knows.
 * Signed in, it also says what sync does not carry, because a person whose
 * heatmap is empty on a second device deserves the reason on the screen that
 * sent them there rather than only on the one they land on (C12 A4).
 */
function accountLine() {
  if (!account.available) return L('accountNone');
  if (!account.signedIn) return L('accountSignedOut');
  return L('accountSignedIn');
}

function renderLibrary() {
  const decks = Object.values(state.decks);
  const shelf = state.builtin.filter((e) => !state.decks[e.id]);
  const bytes = ledgerBytes();
  const list = decks.length
    ? decks.map(deckRow).join('')
    : `<div class="card rp-empty">
         <h3>${escHtml(L('noDecks'))}</h3>
         <p>${L('noDecksHelp')}</p>
       </div>`;

  return `<section class="section" aria-labelledby="libTitle">
    <div class="section__header">
      <div class="section__titles">
        <h2 class="section__title" id="libTitle">${escHtml(L('decks'))}</h2>
        <p class="section__lead">${escHtml(L('libraryLead'))}</p>
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn--primary btn--sm" data-act="open-import">${escHtml(L('import'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="export-ledger">${escHtml(L('exportLedger'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="open-restore">${escHtml(L('restoreLedger'))}</button>
      </div>
    </div>
    <div class="stack stack--tight">${list}</div>
    ${shelf.length ? `<h3 class="rp-shelf__title">${escHtml(L('shelfTitle'))}</h3>
      <div class="stack stack--tight">${shelf.map(builtinRow).join('')}</div>` : ''}
    <p class="rp-note">${escHtml(L('cardMap', mib(bytes), mib(LEDGER_LIMIT_BYTES)))}
      ${state.storageOk ? '' : `${escHtml(L('storageRefused'))} `}
      ${escHtml(accountLine())}</p>
  </section>`;
}

function renderBrowse() {
  const deck = state.decks[state.activeDeckId];
  if (!deck) return renderLibrary();
  const rows = expandCards(deck).map((card) => {
    const row = state.ledger.decks[deck.id]?.cards?.[card.id];
    const st = row ? t(STATE_LABEL[row.st], state.lang) || row.st : L('stateNew');
    const due = row && row.s !== 0 ? shortDate(row.due, state.lang) : L('now');
    const front = card.template.kind === 'cloze'
      ? card.note.f?.[card.template.text_field]
      : card.note.f?.[deck.fields[0]];
    return `<tr>
      <td class="rp-cell-front">${escHtml(String(front || '').slice(0, 80))}</td>
      <td>${escHtml(card.templateId)}</td>
      <td>${escHtml(st)}</td>
      <td>${escHtml(due)}</td>
      <td class="rp-num">${row ? row.reps : 0}</td>
      <td class="rp-num">${row ? row.lapses : 0}</td>
      <td class="rp-num">${row && row.s ? row.s.toFixed(1) : ''}</td>
      <td class="rp-num">${row && row.d ? row.d.toFixed(1) : ''}</td>
    </tr>`;
  }).join('');

  return `<section class="section" aria-labelledby="browseTitle">
    <div class="section__header">
      <div class="section__titles">
        <h2 class="section__title" id="browseTitle">${escHtml(deckName(deck, state.lang))}</h2>
        <p class="section__lead">${escHtml(L('browseLead'))}</p>
      </div>
      <div class="toolbar">
        <button type="button" class="btn btn--primary btn--sm" data-act="review" data-deck="${escHtml(deck.id)}">${escHtml(L('review'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="library">${escHtml(L('backToDecks'))}</button>
      </div>
    </div>
    <div class="rp-table-wrap">
      <table class="rp-table">
        <thead><tr><th>${escHtml(L('thFront'))}</th><th>${escHtml(L('thTemplate'))}</th><th>${escHtml(L('thState'))}</th><th>${escHtml(L('thDue'))}</th><th>${escHtml(L('thReps'))}</th><th>${escHtml(L('thLapses'))}</th><th>S</th><th>D</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

function renderSettings() {
  const s = state.scheduler;
  return `<section class="section" aria-labelledby="setTitle">
    <div class="section__titles">
      <h2 class="section__title" id="setTitle">${escHtml(L('settings'))}</h2>
      <p class="section__lead">${escHtml(L('settingsLead'))}</p>
    </div>

    <div class="card stack stack--tight">
      <label class="rp-field">
        <span>${escHtml(L('desiredRetention'))}</span>
        <input type="range" id="setRetention" min="0.70" max="0.97" step="0.01" value="${s.desired_retention}">
        <output id="setRetentionOut">${(s.desired_retention * 100).toFixed(0)}%</output>
      </label>
      <p class="rp-note">${escHtml(L('retentionNote'))}</p>

      <label class="rp-field">
        <span>${escHtml(L('learnSteps'))}</span>
        <input type="text" id="setLearn" value="${escHtml(s.learn_steps.join(', '))}" inputmode="numeric">
      </label>
      <label class="rp-field">
        <span>${escHtml(L('relearnSteps'))}</span>
        <input type="text" id="setRelearn" value="${escHtml(s.relearn_steps.join(', '))}" inputmode="numeric">
      </label>
      <label class="rp-field">
        <span>${escHtml(L('dayStart'))}</span>
        <input type="number" id="setHour" min="0" max="23" value="${s.day_start_hour}">
      </label>
      <label class="rp-field rp-field--block">
        <span>${escHtml(L('params'))}</span>
        <textarea id="setParams" rows="3" spellcheck="false">${escHtml(s.w.join(', '))}</textarea>
      </label>
      <p class="rp-note" id="setParamsNote">${escHtml(L('paramsNote'))}</p>
      <div class="toolbar">
        <button type="button" class="btn btn--primary btn--sm" data-act="save-settings">${escHtml(L('save'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="reset-settings">${escHtml(L('backToDefaults'))}</button>
      </div>
    </div>

    <div class="card stack stack--tight">
      <h3>${escHtml(L('language'))}</h3>
      <div class="toolbar">
        <button type="button" class="btn ${state.lang === 'en' ? 'btn--secondary' : 'btn--ghost'} btn--sm" data-act="lang" data-lang="en">English</button>
        <button type="button" class="btn ${state.lang === 'es' ? 'btn--secondary' : 'btn--ghost'} btn--sm" data-act="lang" data-lang="es" lang="es">Español</button>
      </div>
      <p class="rp-note">${escHtml(L('languageNote'))}</p>
    </div>
  </section>`;
}
