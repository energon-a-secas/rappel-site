/**
 * The review session: which card is next, and what an answer does.
 *
 * Everything durable is written on the answer itself, never at the end of a
 * session: the card row goes to localStorage through the Persist kit and the
 * log entry goes to IndexedDB, both before the next card is drawn. A closed
 * tab therefore loses at most the queue, and the queue is rebuilt from the
 * clock (js/scheduler.js).
 *
 * This module posts three DOM events rather than calling js/embed.js, so the
 * engine's own review loop has no idea it is ever in an iframe:
 *   rappel-session-start, rappel-answer, rappel-session-end
 */

import { state, cardRow, setCardRow, saveLedger, deckLedger, saveSession, clearSession, persists } from './state.js';
import { expandCards, expectedAnswer, itemIdOf, choiceOptions } from './deck.js';
import { answer as scheduleAnswer, isDue, newCard } from './scheduler.js';
import { appendReview } from './ledger-log.js';
import { showToast } from './utils.js';
import { answersMatch, applyTransform, ensureTransforms } from './transforms.js';

/**
 * Anki's learn-ahead limit. A learning card due inside this window may be shown
 * early, because the alternative is a visitor watching a countdown. Nothing
 * else is ever shown before it is due.
 */
export const LEARN_AHEAD_MS = 20 * 60 * 1000;

/** New cards introduced per session when no limit is given. */
export const DEFAULT_NEW_PER_SESSION = 20;

function emit(type, detail) {
  document.dispatchEvent(new CustomEvent(type, { detail }));
}

/** Every card of a deck, with its ledger row attached. */
export function deckCards(deckId) {
  const deck = state.decks[deckId];
  if (!deck) return [];
  return expandCards(deck).map((card) => ({ ...card, row: cardRow(deckId, card.id) }));
}

/**
 * Build the queue for a session.
 * review: due cards, then new ones. cram: every card, shuffled, no writes.
 */
export function buildQueue(deckId, mode, limit, now = Date.now()) {
  const cards = deckCards(deckId);
  if (mode === 'cram') {
    const all = cards.map((c) => c.id);
    shuffleInPlace(all);
    return limit ? all.slice(0, limit) : all;
  }
  const learning = [];
  const due = [];
  const fresh = [];
  for (const card of cards) {
    const row = card.row;
    if (!row || row.s === 0) { fresh.push(card.id); continue; }
    if (row.st === 'learning' || row.st === 'relearning') { learning.push(card.id); continue; }
    if (isDue(row, now)) due.push(card.id);
  }
  learning.sort((a, b) => (cardRow(deckId, a)?.due || 0) - (cardRow(deckId, b)?.due || 0));
  shuffleInPlace(due);
  const newCap = limit || DEFAULT_NEW_PER_SESSION;
  const queue = [...learning, ...due, ...fresh.slice(0, newCap)];
  return limit ? queue.slice(0, limit) : queue;
}

function shuffleInPlace(list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Start, or restart, a session on a deck. */
export function startSession(deckId, opts = {}) {
  const mode = opts.mode || 'review';
  // Pull the romaji engine in now rather than on the first keystroke of the
  // first typed card, which is where a lazy import would otherwise be felt.
  if ((state.decks[deckId]?.templates || []).some((t) => t.transform)) ensureTransforms();
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : null;
  const queue = buildQueue(deckId, mode, limit);
  state.session = {
    id: `s_${Date.now().toString(36)}`,
    deckId,
    mode,
    startedAt: Date.now(),
    queue,
    queued: queue.length,
    answered: 0,
    correct: 0,
    grades: { 1: 0, 2: 0, 3: 0, 4: 0 },
    ms: 0,
    shownAt: Date.now(),
    flipped: false,
    typed: '',
    choices: null,
    lastGrade: null,
  };
  state.activeDeckId = deckId;
  saveSession();
  emit('rappel-session-start', { deckId, sessionId: state.session.id, queued: queue.length });
  return state.session;
}

/**
 * The card on screen, or null when the queue is spent.
 * A learning card inside the learn-ahead window counts as showable.
 */
export function currentCard(now = Date.now()) {
  const s = state.session;
  if (!s || s.queue.length === 0) return null;
  const cards = new Map(deckCards(s.deckId).map((c) => [c.id, c]));
  if (s.mode === 'cram') return cards.get(s.queue[0]) || null;

  for (const id of s.queue) {
    const card = cards.get(id);
    if (!card) continue;
    if (isDue(card.row, now)) return card;
  }
  for (const id of s.queue) {
    const card = cards.get(id);
    if (!card) continue;
    if (card.row && card.row.due <= now + LEARN_AHEAD_MS) return card;
  }
  return null;
}

/** When the soonest queued card becomes answerable. Null when none is waiting. */
export function nextQueuedAt(now = Date.now()) {
  const s = state.session;
  if (!s) return null;
  const rows = s.queue.map((id) => cardRow(s.deckId, id)).filter(Boolean);
  const future = rows.map((r) => r.due).filter((d) => d > now);
  return future.length ? Math.min(...future) : null;
}

export function flip() {
  const s = state.session;
  if (!s || s.flipped) return;
  s.flipped = true;
  saveSession();
}

/** The options a choice card shows, generated once per showing. */
export function optionsFor(card) {
  const s = state.session;
  if (!s) return [];
  if (!s.choices || s.choices.cardId !== card.id) {
    s.choices = { cardId: card.id, list: choiceOptions(state.decks[s.deckId], card) };
  }
  return s.choices.list;
}

/**
 * Whether the produced answer matched, for a typed or choice card.
 * A basic or cloze card has no produced answer, so `correct` is the grade.
 */
export function producedCorrect(card, produced) {
  const kind = card.template.kind;
  if (kind !== 'typed' && kind !== 'choice') return null;
  // Finish the transform first: the live IME leaves a trailing n as a letter.
  const finished = kind === 'typed' ? applyTransform(card.template.transform, produced) : produced;
  return answersMatch(finished, expectedAnswer(card), card.template.compare || 'trim|casefold');
}

/**
 * Grade the card on screen.
 *
 * @param {object} card    from currentCard()
 * @param {number} grade   1 Again, 2 Hard, 3 Good, 4 Easy. Hard is passing.
 * @param {string} produced what the learner typed or picked, if anything
 */
export async function gradeCard(card, grade, produced = '') {
  const s = state.session;
  if (!s) return null;
  const now = Date.now();
  const deck = state.decks[s.deckId];
  const elapsed = Math.max(0, now - s.shownAt);
  const before = cardRow(s.deckId, card.id) || newCard();
  const { card: next, log } = scheduleAnswer(before, grade, now, state.scheduler);
  const matched = producedCorrect(card, produced);
  const correct = matched === null ? grade >= 2 : matched;

  // C6.1: a cram session writes nothing to the ledger. Not the card row, not
  // the log. It still reports every answer to a host.
  if (s.mode !== 'cram') {
    setCardRow(s.deckId, card.id, next);
    deckLedger(s.deckId).deck_version_seen = deck?.version ?? null;
    saveLedger();
    const entry = { c: card.id, e: elapsed, ...log };
    // ledger=host and a failed storage probe both mean "write nothing to this
    // origin". The log then lives in memory so rappel:progress can still hand
    // the whole history to the host, which is the escape hatch it is for.
    if (persists()) {
      const saved = await appendReview(s.deckId, entry);
      if (!saved) {
        // A quota or transaction failure returns false rather than throwing;
        // the entry is kept in memory so an export still carries it.
        state.memLog.push({ deck: s.deckId, ...entry });
        showToast('The review log refused this write. The entry is kept in memory until you export.');
      }
    } else state.memLog.push({ deck: s.deckId, ...entry });
    // The account path (js/account.js) listens for this and pushes the row
    // when signed in; with no account nothing is listening. C7.5.
    document.dispatchEvent(new CustomEvent('rappel-review', { detail: { deck: s.deckId, ...entry } }));
  }

  s.answered += 1;
  s.grades[grade] += 1;
  s.ms += elapsed;
  if (correct) s.correct += 1;
  s.lastGrade = grade;
  s.flipped = false;
  s.typed = '';
  s.choices = null;
  s.shownAt = Date.now();

  // Again keeps the card in the queue; anything else takes it out. In cram the
  // card leaves the queue either way, because nothing is being scheduled.
  const idx = s.queue.indexOf(card.id);
  if (idx >= 0) s.queue.splice(idx, 1);
  if (s.mode !== 'cram' && (next.st === 'learning' || next.st === 'relearning')) {
    s.queue.push(card.id);
  }
  saveSession();

  emit('rappel-answer', {
    deckId: s.deckId,
    sessionId: s.id,
    cardId: card.id,
    itemId: itemIdOf(deck, card),
    skill: card.skill || '',
    grade,
    correct,
    ms: elapsed,
  });
  return { row: next, correct };
}

/** Close the session and report it. */
export function endSession() {
  const s = state.session;
  if (!s) return null;
  const summary = {
    deckId: s.deckId,
    sessionId: s.id,
    answered: s.answered,
    again: s.grades[1],
    hard: s.grades[2],
    good: s.grades[3],
    easy: s.grades[4],
    ms: s.ms,
  };
  clearSession();
  emit('rappel-session-end', summary);
  return summary;
}

/** Restore a session left behind by a closed tab, when its deck is still here. */
export function resumeSession(saved) {
  if (!saved || !saved.deckId || !state.decks[saved.deckId]) return null;
  state.session = { ...saved, shownAt: Date.now(), flipped: false, choices: null };
  state.activeDeckId = saved.deckId;
  return state.session;
}
