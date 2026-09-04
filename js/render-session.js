/**
 * The review surface: one card, a flip, and four ratings.
 *
 * The four buttons are the one piece of copy in this project that has to be
 * exactly right. Anki's own manual warns that FSRS reads Hard as a PASS: "if
 * you press Hard when you have failed to recall the information, all intervals
 * will be unreasonably high". So every button says what happened in your head,
 * not how the card felt, and the line under them says it once more.
 */

import { state } from './state.js';
import { currentCard, optionsFor, nextQueuedAt, LEARN_AHEAD_MS } from './session.js';
import { renderTemplate, renderCloze, expectedAnswer, deckName, fieldText } from './deck.js';
import { previewIntervals, humanGap } from './scheduler.js';
import { escHtml, t, fill, UI } from './utils.js';

const GRADES = [
  { g: 1, key: '1', name: UI.gradeAgain, gloss: UI.gradeAgainGloss, cls: 'rp-grade--again' },
  { g: 2, key: '2', name: UI.gradeHard, gloss: UI.gradeHardGloss, cls: 'rp-grade--hard' },
  { g: 3, key: '3', name: UI.gradeGood, gloss: UI.gradeGoodGloss, cls: 'rp-grade--good' },
  { g: 4, key: '4', name: UI.gradeEasy, gloss: UI.gradeEasyGloss, cls: 'rp-grade--easy' },
];

/** The engine's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

function progressBar(s) {
  const total = s.queued || 1;
  const done = Math.min(s.answered, total);
  return `<div class="rp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}">
    <div class="rp-progress__fill" style="width:${Math.round((done / total) * 100)}%"></div>
  </div>`;
}

function faceFront(card, deck) {
  const tpl = card.template;
  if (tpl.kind === 'cloze') return renderCloze(card.note, tpl, deck, card.ordinal, false);
  if (tpl.front) return renderTemplate(tpl.front, card.note, deck);
  return escHtml(fieldText(card.note, deck.fields[0]));
}

function faceBack(card, deck) {
  const tpl = card.template;
  if (tpl.kind === 'cloze') return renderCloze(card.note, tpl, deck, card.ordinal, true);
  if (tpl.back) return renderTemplate(tpl.back, card.note, deck);
  return escHtml(expectedAnswer(card));
}

function answerInput(card) {
  const tpl = card.template;
  if (tpl.kind === 'typed') {
    return `<div class="rp-answer">
      <label class="rp-visually-hidden" for="typedAnswer">${escHtml(L('yourAnswer'))}</label>
      <input type="text" id="typedAnswer" class="rp-typed" autocomplete="off" autocapitalize="off"
             spellcheck="false" data-transform="${escHtml(tpl.transform || '')}"
             value="${escHtml(state.session.typed || '')}" placeholder="${escHtml(L('typeIt'))}">
    </div>`;
  }
  if (tpl.kind === 'choice') {
    const options = optionsFor(card);
    return `<div class="rp-choices" role="group" aria-label="${escHtml(L('pickAnswer'))}">${options.map((opt, i) => `
      <button type="button" class="btn btn--secondary rp-choice" data-act="choose" data-value="${escHtml(opt)}">
        <span class="rp-choice__key">${i + 1}</span>${escHtml(opt)}
      </button>`).join('')}</div>`;
  }
  return '';
}

function gradeButtons(card) {
  const row = state.ledger.decks[state.session.deckId]?.cards?.[card.id] || null;
  const previews = previewIntervals(row, Date.now(), state.scheduler);
  const now = Date.now();
  return `<div class="rp-grades" role="group" aria-label="${escHtml(L('gradesLabel'))}">
    ${GRADES.map((b) => {
      const p = previews.find((x) => x.grade === b.g);
      return `<button type="button" class="btn rp-grade ${b.cls}" data-act="grade" data-grade="${b.g}">
        <kbd>${b.key}</kbd>
        <span class="rp-grade__name">${escHtml(t(b.name, state.lang))}</span>
        <span class="rp-grade__gloss">${escHtml(t(b.gloss, state.lang))}</span>
        <span class="rp-grade__eta">${escHtml(humanGap(p.due - now))}</span>
      </button>`;
    }).join('')}
  </div>
  <p class="rp-grade__warn">${escHtml(L('hardWarn'))}</p>`;
}

function verdictLine() {
  const s = state.session;
  if (s.lastVerdict === undefined || s.lastVerdict === null) return '';
  return s.lastVerdict
    ? `<p class="rp-verdict rp-verdict--hit" role="status">${escHtml(L('verdictHit'))}</p>`
    : `<p class="rp-verdict rp-verdict--miss" role="status">${escHtml(L('verdictMiss'))}</p>`;
}

/** The whole review area as an HTML string. */
export function renderCard() {
  const s = state.session;
  if (!s) return '';
  const deck = state.decks[s.deckId];
  if (!deck) return '';
  const card = currentCard();

  if (!card) {
    const waiting = nextQueuedAt();
    const waitLine = waiting
      ? `<p class="section__lead">${escHtml(L('nextReady', humanGap(waiting - Date.now()), Math.round(LEARN_AHEAD_MS / 60000)))}</p>`
      : `<p class="section__lead">${escHtml(L('nothingDue'))}</p>`;
    return `<section class="section rp-done" aria-labelledby="doneTitle">
      <h2 class="section__title" id="doneTitle">${escHtml(L('sessionFinished'))}</h2>
      ${waitLine}
      <p class="rp-summary">${escHtml(L('sessionSummary', s.answered, s.grades[1], s.grades[2], s.grades[3], s.grades[4]))}</p>
      <div class="toolbar">
        <button type="button" class="btn btn--primary btn--sm" data-act="end-session">${escHtml(L('backToDecks'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="cram" data-deck="${escHtml(deck.id)}">${escHtml(L('cramThis'))}</button>
      </div>
    </section>`;
  }

  const front = faceFront(card, deck);
  const back = s.flipped ? faceBack(card, deck) : '';
  const kind = card.template.kind;
  const showInput = !s.flipped && (kind === 'typed' || kind === 'choice');

  return `<section class="section rp-session" aria-labelledby="sessTitle">
    <div class="rp-session__bar">
      <h2 class="section__title" id="sessTitle">${escHtml(deckName(deck, state.lang))}</h2>
      <span class="rp-session__count">${escHtml(L('sessionCount', s.answered, s.queued))}${s.mode === 'cram' ? escHtml(L('cramTag')) : ''}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-act="end-session">${escHtml(L('end'))}</button>
    </div>
    ${progressBar(s)}
    <div class="card rp-card" data-kind="${escHtml(kind)}">
      <div class="rp-face rp-face--front">${front}</div>
      ${showInput ? answerInput(card) : ''}
      ${s.flipped ? `<hr class="rp-rule"><div class="rp-face rp-face--back">${back}</div>` : ''}
      ${s.flipped ? verdictLine() : ''}
    </div>
    ${s.flipped
      ? gradeButtons(card)
      : `<div class="toolbar rp-flip-row">
           <button type="button" class="btn btn--primary" data-act="flip">${escHtml(L('showAnswer'))} <kbd>space</kbd></button>
         </div>`}
  </section>`;
}
