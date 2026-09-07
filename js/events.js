/**
 * Every listener in the app. There is no inline onclick in this project and
 * there never will be: clicks are delegated on [data-act], so a screen that
 * render.js rebuilds keeps working without rebinding anything.
 */

import { state, savePrefs, forgetDeck } from './state.js';
import { render } from './render.js';
import { openModal, closeModal, initModals } from './modal.js';
import { startSession, gradeCard, flip, currentCard, endSession, producedCorrect } from './session.js';
import { restoreLedger } from './ledger.js';
import { clearDeck } from './ledger-log.js';
import { acceptDeck, loadBuiltin } from './deck-load.js';
import { importAny } from './import.js';
import { downloadDeckJson, downloadDeckTsv, downloadLedger } from './export.js';
import { parseParams } from './fsrs.js';
import { defaultScheduler } from './scheduler.js';
import { emitDue, emitResize } from './embed.js';
import { ensureTransforms, transformsReady } from './transforms.js';
import { deckName } from './deck.js';
import { showToast, $, t, fill, UI } from './utils.js';

function deckOf(el) {
  return el?.dataset?.deck || state.activeDeckId;
}

/**
 * Every sentence a learner reads out of this file, in the language they chose.
 * These were English literals, so a Spanish visitor got English at each point
 * where something actually happened to their data: a deck forgotten, a ledger
 * downloaded, an import landed, settings reset.
 */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

// gradeCard awaits the review-log write; a second press inside that window
// would grade the same card again, or the next one unseen.
let grading = false;

async function onAct(act, el) {
  switch (act) {
    case 'library':
      state.view = 'library';
      break;
    case 'review':
    case 'cram': {
      const id = deckOf(el);
      if (!state.decks[id]) return;
      startSession(id, { mode: act === 'cram' ? 'cram' : 'review' });
      state.view = 'session';
      break;
    }
    case 'browse':
      state.activeDeckId = deckOf(el);
      state.view = 'browse';
      break;
    case 'forget': {
      const id = deckOf(el);
      if (!window.confirm(L('forgetConfirm', deckName(state.decks[id], state.lang)))) return;
      // The prompt promises the reviews too, so the reviews go. forgetDeck()
      // drops the deck and its card rows from localStorage; the log lives in
      // IndexedDB and has to be told separately, or a "forget" leaves the
      // history it just said it deleted sitting in the stats screen.
      forgetDeck(id);
      await clearDeck(id);
      state.memLog = state.memLog.filter((e) => e.deck !== id);
      state.view = 'library';
      break;
    }
    case 'export-deck':
      downloadDeckJson(state.decks[deckOf(el)], state.lang);
      return;
    case 'export-tsv':
      downloadDeckTsv(state.decks[deckOf(el)], state.lang);
      return;
    case 'export-ledger':
      await downloadLedger({ log: true });
      showToast(L('ledgerSaved'));
      return;
    case 'add-builtin': {
      const added = await loadBuiltin(el.dataset.deck);
      if (!added) return;
      state.view = 'library';
      break;
    }
    case 'auth-toggle': {
      // The sheet is a plain hidden toggle; Clerk owns everything inside it.
      const panel = $('authPanel');
      if (!panel) return;
      const open = !panel.classList.contains('open');
      panel.classList.toggle('open', open);
      el.setAttribute('aria-expanded', open ? 'true' : 'false');
      return;
    }
    case 'open-import':
      openModal('importModal');
      return;
    case 'open-restore':
      openModal('restoreModal');
      return;
    case 'flip':
      flip();
      break;
    case 'choose': {
      const card = currentCard();
      if (!card) return;
      state.session.typed = el.dataset.value || '';
      state.session.lastVerdict = producedCorrect(card, state.session.typed);
      flip();
      break;
    }
    case 'grade': {
      const card = currentCard();
      if (!card) return;
      const grade = Number.parseInt(el.dataset.grade, 10);
      if (grading) return;
      grading = true;
      try {
        await gradeCard(card, grade, state.session.typed || '');
      } finally {
        grading = false;
      }
      if (!state.session) return;
      state.session.lastVerdict = null;
      // renderCard() keeps its own snapshot of the session and draws the
      // results screen from it once the session is gone, which is what the
      // keyboard path has always relied on. Leaving for the library with a
      // toast instead meant a learner who graded with the mouse, with Enter or
      // with Space never saw their own results at all.
      if (!currentCard()) endSession();
      break;
    }
    case 'end-session':
      endSession();
      state.view = 'library';
      break;
    case 'save-settings':
      saveSettings();
      break;
    case 'reset-settings':
      state.scheduler = defaultScheduler();
      savePrefs();
      showToast(L('settingsReset'));
      break;
    case 'lang':
      state.lang = el.dataset.lang === 'es' ? 'es' : 'en';
      savePrefs();
      break;
    case 'do-import':
      await runImport();
      return;
    case 'do-restore':
      await runRestore();
      return;
    default:
      return;
  }
  await render();
  emitResize();
}

function saveSettings() {
  const retention = Number.parseFloat($('setRetention')?.value);
  const learn = readSteps($('setLearn')?.value, [60, 600]);
  const relearn = readSteps($('setRelearn')?.value, [600]);
  const hour = Number.parseInt($('setHour')?.value, 10);
  const parsed = parseParams($('setParams')?.value || '');
  if (!parsed.ok) {
    showToast(L('paramsRejected', parsed.error));
    return;
  }
  state.scheduler = {
    ...state.scheduler,
    w: parsed.w,
    desired_retention: Number.isFinite(retention) ? retention : 0.9,
    learn_steps: learn,
    relearn_steps: relearn,
    day_start_hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : 4,
  };
  savePrefs();
  showToast(L('settingsSaved'));
}

function readSteps(text, fallback) {
  const list = String(text || '').split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0);
  return list.length ? list : fallback;
}

async function runImport() {
  const text = $('importText')?.value || '';
  const name = $('importName')?.value || '';
  const reverse = $('importReverse')?.checked || false;
  const result = importAny(text, { name, reverse });
  if (!result.ok) {
    const note = $('importNote');
    if (note) note.textContent = result.error;
    return;
  }
  const added = await acceptDeck(result.deck, null);
  if (!added) return;
  closeModal('importModal');
  state.view = 'library';
  await render();
  showToast(L('imported', result.notes, added.id));
  emitResize();
}

async function runRestore() {
  const text = $('restoreText')?.value || '';
  const strategy = document.querySelector('input[name="restoreStrategy"]:checked')?.value || 'merge';
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    const note = $('restoreNote');
    if (note) note.textContent = L('notValidJson', e.message);
    return;
  }
  const res = await restoreLedger(doc, strategy);
  if (!res.ok) {
    const note = $('restoreNote');
    if (note) note.textContent = res.error;
    return;
  }
  closeModal('restoreModal');
  await render();
  showToast(L('restored', res.cards, res.log));
}

function onFile(input, target) {
  const file = input.files && input.files[0];
  if (!file) return;
  file.text().then((text) => {
    const box = $(target);
    if (box) box.value = text;
    if (target === 'importText' && !$('importName').value) {
      $('importName').value = file.name.replace(/\.[^.]+$/, '');
    }
  });
}

/**
 * Keep the session's copy of what is in the answer box.
 * The romaji conversion itself is wanakana's binding, installed by render.js:
 * doing it here would re-convert text that is already kana.
 */
function onTypedInput(e) {
  const el = e.target;
  if (!el.classList || !el.classList.contains('rp-typed')) return;
  if (state.session) state.session.typed = el.value;
}

async function onTypedKey(e) {
  if (!e.target.classList || !e.target.classList.contains('rp-typed')) return;
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const card = currentCard();
  if (!card || state.session.flipped) return;
  state.session.typed = e.target.value;
  // The reader loads lazily; an Enter that beats it would compare raw romaji
  // against kana and call a right answer wrong.
  if (!transformsReady()) { try { await ensureTransforms(); } catch { /* graded without it, as before */ } }
  state.session.lastVerdict = producedCorrect(card, state.session.typed);
  flip();
  await render();
}

/** Grade or flip from the keyboard. Registered through NeoKeys in js/keys.js. */
export async function keyAction(name) {
  if (state.view !== 'session' || !state.session) return;
  const card = currentCard();
  if (name === 'flip') {
    if (!card) return;
    if (!state.session.flipped) {
      if (card.template.kind === 'typed') state.session.lastVerdict = producedCorrect(card, state.session.typed);
      flip();
      await render();
    }
    return;
  }
  const grade = Number.parseInt(name, 10);
  if (!card || !state.session.flipped || !(grade >= 1 && grade <= 4)) return;
  await gradeCard(card, grade, state.session.typed || '');
  state.session.lastVerdict = null;
  if (!currentCard()) endSession();
  await render();
  emitResize();
}

/** Wire everything. Called once from js/boot.js. */
export function bindEvents() {
  initModals();

  document.addEventListener('click', (e) => {
    const nav = e.target.closest('.nav-link[data-view]');
    if (nav) {
      state.view = nav.dataset.view;
      render();
      return;
    }
    const act = e.target.closest('[data-act]');
    if (act) onAct(act.dataset.act, act);
  });

  document.addEventListener('input', onTypedInput);
  document.addEventListener('keydown', onTypedKey);

  document.addEventListener('change', (e) => {
    if (e.target.id === 'importFile') onFile(e.target, 'importText');
    if (e.target.id === 'restoreFile') onFile(e.target, 'restoreText');
    if (e.target.id === 'setRetention') {
      const out = $('setRetentionOut');
      if (out) out.textContent = `${Math.round(Number(e.target.value) * 100)}%`;
    }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'setRetention') return;
    const out = $('setRetentionOut');
    if (out) out.textContent = `${Math.round(Number(e.target.value) * 100)}%`;
  });

  // A host asked for a session. C6.3.
  document.addEventListener('rappel-host-start', async (e) => {
    if (!state.activeDeckId) return;
    startSession(state.activeDeckId, { limit: e.detail.limit, mode: e.detail.mode || 'review' });
    state.view = 'session';
    await render();
  });

  document.addEventListener('rappel-restored', async () => {
    await render();
    if (state.activeDeckId) emitDue(state.activeDeckId);
  });

  // Sign-in or sign-out. js/account.js has already merged whatever the server
  // held by the time this fires, so the screen is redrawn from state rather
  // than reaching for the account itself.
  document.addEventListener('rappel-auth', async () => {
    await render();
    emitResize();
  });

  // Play a deck's audio, without ever letting a deck name an absolute URL.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.rp-media-audio');
    if (!btn) return;
    const audio = new Audio(btn.dataset.audio);
    audio.play().catch(() => showToast(L('audioMissing')));
  });
}
