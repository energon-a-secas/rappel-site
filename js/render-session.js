/**
 * The review surface: one card, a reveal, and four grades.
 *
 * The four buttons are the one piece of copy in this project that has to be
 * exactly right. Anki's own manual warns that FSRS reads Hard as a PASS: "if
 * you press Hard when you have failed to recall the information, all intervals
 * will be unreasonably high". So every button says what happened in your head,
 * not how the card felt, and the note under them says it once per session and
 * then stays attached to Hard as its accessible description, rather than being
 * repeated under card 224.
 *
 * Two seams with the rest of the app, neither of them invented here:
 *
 *   - focus and the #announce live region belong to render(), which resolves
 *     both after every repaint. This file asks for the one target render()
 *     cannot infer, the armed grade after a reveal, with [data-autofocus];
 *     everything else it already gets right from .rp-typed and .rp-card.
 *   - the grade group's roving tabindex is here, because it is a property of
 *     this control and of nothing else: four ratings, one tab stop.
 *
 * The queue, the scheduler and the ledger are elsewhere and untouched. This
 * module reads state and listens; it never grades, and never ends a session.
 */

import { state, cardRow } from './state.js';
import { currentCard, optionsFor, LEARN_AHEAD_MS } from './session.js';
import { renderTemplate, renderCloze, expectedAnswer, deckName, fieldText } from './deck.js';
import { previewIntervals, humanGap } from './scheduler.js';
import { escHtml, t, fill, UI } from './utils.js';

const GRADES = [
  { g: 1, key: '1', name: UI.gradeAgain, gloss: UI.gradeAgainGloss, cls: 'again' },
  { g: 2, key: '2', name: UI.gradeHard, gloss: UI.gradeHardGloss, cls: 'hard' },
  { g: 3, key: '3', name: UI.gradeGood, gloss: UI.gradeGoodGloss, cls: 'good' },
  { g: 4, key: '4', name: UI.gradeEasy, gloss: UI.gradeEasyGloss, cls: 'easy' },
];
/** The group arms itself here on every reveal: the honest answer, most often. */
const GOOD = 2;
/**
 * What survives endSession(). The keyboard path ends a session and only then
 * repaints, so without this the view would be drawn from a null session and
 * the learner would get an empty screen instead of their own results.
 */
let last = null;
let armed = GOOD;
let noteShown = false;
let ackAt = -1;
/** The intervals the four buttons promised for the card now being graded. */
let promised = null;

/** The engine's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

/** Per-session presentation state. Reset when a new session id appears. */
function reset() {
  armed = GOOD;
  noteShown = false;
  ackAt = -1;
  promised = null;
}

/* ── The session as it will be remembered ───────────────────── */

function keep(s, deck) {
  last = {
    sid: s.id,
    deckId: s.deckId,
    name: deck ? deckName(deck, state.lang) : '',
    mode: s.mode,
    answered: s.answered,
    queued: s.queued,
    grades: { ...s.grades },
    queue: [...s.queue],
  };
}

/** When the soonest card still in the queue becomes answerable. */
function nextDueIn(snap) {
  const now = Date.now();
  const due = snap.queue
    .map((id) => cardRow(snap.deckId, id)?.due)
    .filter((d) => Number.isFinite(d) && d > now);
  return due.length ? Math.min(...due) : null;
}

/* ── Pieces of the screen ───────────────────────────────────── */

function progress(s) {
  const total = s.queued || 1;
  const done = Math.min(s.answered, total);
  const text = L('progressText', done, total);
  return `<div class="rp-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}"
       aria-valuenow="${done}" aria-label="${escHtml(text)}" aria-valuetext="${escHtml(text)}">
    <div class="rp-progress__fill" style="width:${Math.round((done / total) * 100)}%"></div>
  </div>`;
}

function sessionBar(s, deck) {
  const tag = s.mode === 'cram' ? `<span class="rp-tag">${escHtml(L('cramBadge'))}</span>` : '';
  return `<div class="rp-session__bar">
    <div class="rp-session__title">
      <h2 class="section__title" id="sessTitle" tabindex="-1">${escHtml(deckName(deck, state.lang))}</h2>
      ${tag}
    </div>
    <span class="rp-session__count">${escHtml(L('sessionCount', s.answered, s.queued))}</span>
    <button type="button" class="btn btn--ghost rp-session__end" data-act="end-session">${escHtml(L('endSession'))}</button>
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

/** Face down: the box a produced answer goes into, and how it is being read. */
function answerBox(card) {
  const tpl = card.template;
  if (tpl.kind === 'typed') {
    const mode = tpl.transform ? `<p class="rp-answer__mode">${escHtml(L('kanaMode'))}</p>` : '';
    return `<div class="rp-answer">
      <label class="rp-visually-hidden" for="typedAnswer">${escHtml(L('yourAnswer'))}</label>
      <input type="text" id="typedAnswer" class="rp-typed" autocomplete="off" autocapitalize="off"
             spellcheck="false" data-transform="${escHtml(tpl.transform || '')}"
             value="${escHtml(state.session.typed || '')}" placeholder="${escHtml(L('typeIt'))}">
      ${mode}
    </div>`;
  }
  if (tpl.kind === 'choice') {
    return `<div class="rp-choices" role="group" aria-label="${escHtml(L('pickAnswer'))}">${optionsFor(card).map((opt, i) => `
      <button type="button" class="btn btn--secondary rp-choice" data-act="choose" data-value="${escHtml(opt)}">
        <span class="rp-choice__label">${escHtml(opt)}</span><kbd class="rp-key" aria-hidden="true">${i + 1}</kbd>
      </button>`).join('')}</div>`;
  }
  return '';
}

/**
 * Face up: what the learner actually produced. Without it a miss shows the
 * right answer and hides the wrong one, which is the half you need to see.
 */
function answerEcho(card) {
  const kind = card.template.kind;
  if (kind !== 'typed' && kind !== 'choice') return '';
  const written = String(state.session.typed || '').trim();
  if (!written) return '';
  // A choice card is picked, not written, and saying "you wrote" of a button
  // the learner pressed reads as the app describing someone else's session.
  const line = fill(t(kind === 'choice' ? UI.youPicked : UI.youWrote, state.lang), `<b>${escHtml(written)}</b>`);
  return `<p class="rp-answer__echo rp-reveal">${line}</p>`;
}

/** A chip, so hit and miss are a glyph as well as a colour (WCAG 1.4.1). */
function verdict() {
  const v = state.session.lastVerdict;
  if (v === undefined || v === null) return '';
  const hit = Boolean(v);
  return `<p class="rp-verdict rp-verdict--${hit ? 'hit' : 'miss'} rp-reveal">
    <span class="rp-verdict__glyph" aria-hidden="true">${hit ? '✓' : '✗'}</span>${escHtml(L(hit ? 'verdictHit' : 'verdictMiss'))}</p>`;
}

/** The gap a grade promised, from the previews the buttons were drawn with. */
function promisedGap(grade) {
  if (!promised) return '';
  const now = Date.now();
  const hit = promised.find((x) => x.grade === grade);
  return hit ? humanGap(hit.due - now) : '';
}

/**
 * The four grades: one tab stop, four radios, a roving tabindex. Arrow keys
 * move the armed one, Enter or Space commits it, 1 to 4 go straight through
 * NeoKeys. The keycap is a box of its own, never a prefix on the label.
 */
function gradeGroup(card) {
  const row = cardRow(state.session.deckId, card.id);
  const now = Date.now();
  promised = previewIntervals(row, now, state.scheduler);
  const buttons = GRADES.map((b, i) => {
    const eta = humanGap((promised.find((x) => x.grade === b.g)?.due || now) - now);
    return `
      <button type="button" class="btn rp-grade rp-grade--${b.cls}" role="radio"
              aria-checked="${i === armed ? 'true' : 'false'}" tabindex="${i === armed ? '0' : '-1'}"
              data-act="grade" data-grade="${b.g}"${i === armed ? ' data-autofocus' : ''}${b.g === 2 ? ' aria-describedby="rpNote"' : ''}>
        <span class="rp-grade__name">${escHtml(t(b.name, state.lang))}</span>
        <span class="rp-grade__gloss">${escHtml(t(b.gloss, state.lang))}</span>
        <span class="rp-grade__eta">${escHtml(eta)}</span>
        <kbd class="rp-key" aria-hidden="true">${b.key}</kbd>
      </button>`;
  }).join('');
  const noteClass = noteShown ? 'rp-visually-hidden' : 'rp-grade__note';
  noteShown = true;
  return `<div class="rp-grades" role="radiogroup" aria-label="${escHtml(L('gradesLabel'))}" aria-describedby="rpHint">${buttons}
  </div>
  <p class="rp-visually-hidden" id="rpHint">${escHtml(L('gradesHint'))}</p>
  <p class="${noteClass}" id="rpNote">${escHtml(L('hardWarn'))}</p>`;
}

/** The grade just given, acknowledged on the next card and gone in 2.4s. */
function ackChip(s) {
  const b = GRADES[s.lastGrade - 1];
  if (!b) return '';
  const gap = s.mode === 'cram' ? '' : promisedGap(s.lastGrade);
  return `<p class="rp-card__ack rp-card__ack--${b.cls}"><span>${escHtml(t(b.name, state.lang))}</span> ${escHtml(gap)}</p>`;
}

/* ── The end of a session ───────────────────────────────────── */

function results(snap) {
  const next = nextDueIn(snap);
  const wait = next
    ? L('nextReady', humanGap(next - Date.now()), Math.round(LEARN_AHEAD_MS / 60000))
    : L('nothingDue');
  const tally = GRADES.map((b) => ({ b, n: snap.grades[b.g] || 0 }));
  const spread = snap.answered
    ? `<div class="rp-done__bar" aria-hidden="true">${tally.filter((x) => x.n).map((x) => `
        <span class="rp-done__seg rp-done__seg--${x.b.cls}" style="flex-grow:${x.n}"></span>`).join('')}
      </div>
      <ul class="rp-done__legend">${tally.map((x) => `
        <li class="rp-done__item rp-done__item--${x.b.cls}"><span class="rp-done__swatch" aria-hidden="true"></span>${escHtml(t(x.b.name, state.lang))} <b>${x.n}</b></li>`).join('')}
      </ul>`
    : '';
  // One number for the work done, then the four that break it down. The
  // ceiling moves rather than the count: an Again puts its card back in the
  // queue, so a session can answer more times than it queued cards.
  const count = snap.answered
    ? `<p class="rp-done__lead">${escHtml(L('progressText', snap.answered, Math.max(snap.queued, snap.answered)))}</p>`
    : '';

  return `<section class="rp-done" aria-labelledby="doneTitle">
    <p class="rp-done__deck">${escHtml(snap.name)}</p>
    <h2 class="section__title" id="doneTitle" tabindex="-1" data-autofocus>${escHtml(L('sessionFinished'))}</h2>
    ${count}
    <p class="rp-done__lead">${escHtml(wait)}</p>
    ${spread}
    <div class="rp-done__actions">
      <button type="button" class="btn btn--primary" data-act="end-session">${escHtml(L('backToDecks'))}</button>
      <button type="button" class="btn btn--ghost" data-act="cram" data-deck="${escHtml(snap.deckId)}">${escHtml(L('cramThis'))}</button>
    </div>
  </section>`;
}

/* ── The whole review area as an HTML string ────────────────── */

export function renderCard() {
  const s = state.session;
  // endSession() has already run: draw the results from what was kept, rather
  // than handing render() an empty string and the learner a blank screen.
  if (!s) return last ? results(last) : '';
  const deck = state.decks[s.deckId];
  if (!deck) return '';
  if (!last || last.sid !== s.id) reset();

  const card = currentCard();
  keep(s, deck);
  if (!card) return results(last);

  // True on the first paint after a grade, and only that one.
  const graded = Boolean(s.lastGrade) && s.answered > 0 && ackAt !== s.answered;
  const ack = graded ? ackChip(s) : '';
  if (graded) ackAt = s.answered;

  const kind = card.template.kind;
  const index = Math.min(s.answered + 1, s.queued || s.answered + 1);
  const front = faceFront(card, deck);
  const showInput = !s.flipped && (kind === 'typed' || kind === 'choice');
  if (!s.flipped) armed = GOOD;

  const body = s.flipped
    ? `${answerEcho(card)}
      <hr class="rp-rule rp-reveal">
      <div class="rp-face rp-face--back rp-reveal">${faceBack(card, deck)}</div>
      ${verdict()}`
    : (showInput ? answerBox(card) : '');

  const control = s.flipped
    ? gradeGroup(card)
    : (showInput ? '' : `<div class="rp-flip">
        <button type="button" class="btn btn--primary rp-flip__btn" data-act="flip">
          <span class="rp-flip__label">${escHtml(L('showAnswer'))}</span>
          <span class="rp-flip__label--touch">${escHtml(L('tapToReveal'))}</span>
          <kbd class="rp-key" aria-hidden="true">space</kbd>
        </button>
      </div>`);

  return `<section class="rp-session" aria-labelledby="sessTitle" data-mode="${escHtml(s.mode)}">
    ${sessionBar(s, deck)}
    ${progress(s)}
    <div class="rp-card" id="rpCard" data-kind="${escHtml(kind)}" role="group"
         tabindex="-1" aria-label="${escHtml(L('cardRegion', index, s.queued))}">
      ${ack}
      <div class="rp-face rp-face--front">${front}</div>
      ${body}
    </div>
    ${control}
  </section>`;
}

/* ── Keyboard, inside the grade group ───────────────────────── */

function paint(list) {
  list.forEach((el, i) => {
    el.setAttribute('aria-checked', i === armed ? 'true' : 'false');
    el.tabIndex = i === armed ? 0 : -1;
  });
}

const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

function onKey(e) {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target instanceof Element ? e.target : null;
  const button = target?.closest('.rp-grade');

  if (button) {
    const list = [...button.parentElement.querySelectorAll('.rp-grade')];
    let i = list.indexOf(button);
    if (STEP[e.key]) i = (i + STEP[e.key] + list.length) % list.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = list.length - 1;
    else if (/^[1-4]$/.test(e.key)) {
      // After a reveal the keyboard is always on one of these four, so this
      // branch returned before the digit block below could ever run and a
      // graded digit was felt and never seen. NeoKeys still does the grading.
      armed = Number(e.key) - 1;
      paint(list);
      list[armed].classList.add('is-pressed');
      return;
    } else return;
    e.preventDefault();
    armed = i;
    paint(list);
    list[i].focus();
    return;
  }

  // A digit graded the card. Fill its box before the repaint, so a keyboard
  // press is seen and not only felt: NeoKeys owns the grading itself.
  if (!/^[1-4]$/.test(e.key)) return;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
  const hit = document.querySelector(`.rp-grade[data-grade="${e.key}"]`);
  if (!hit) return;
  armed = Number(e.key) - 1;
  paint([...hit.parentElement.querySelectorAll('.rp-grade')]);
  hit.classList.add('is-pressed');
}

/**
 * js/session.js emits this after it has taken the card out of the queue, which
 * is the last moment the session is both complete and still alive. Keeping the
 * snapshot here is what lets the results screen outlive endSession().
 */
function onAnswered() {
  const s = state.session;
  if (s) keep(s, state.decks[s.deckId]);
}

document.addEventListener('keydown', onKey);
document.addEventListener('rappel-answer', onAnswered);
