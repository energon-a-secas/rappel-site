/**
 * Reading a neo-deck/1 document: card expansion, rendering, distractors.
 * Contract C4.
 *
 * Card identity is noteId + ":" + templateId, a string, stable across
 * re-downloads, and it is the ledger's foreign key. Nothing here ever derives
 * an id from an array index. C4.2 rule 1 and C4.6.
 *
 * Rendering escapes everything by default. A deck can arrive from any https
 * origin (C6.1) and a rendered document that can inject HTML is a rendered
 * document that can read the ledger, so the two Anki media spellings are
 * recognised as tokens and rebuilt as elements rather than passed through.
 */

import { escHtml } from './utils.js';
import { CLOZE_RE } from './validate-deck.js';

const MEDIA_RE = /\[sound:([^\]]+)\]|<img\s+src="([^"]+)"[^>]*>/g;
const FIELD_RE = /\{\{([^{}]+)\}\}/g;
const BR_RE = /<br\s*\/?>/gi;

/** A media filename must be a plain relative path. C4.3 amendment 4. */
function safeMediaPath(deck, name) {
  const raw = String(name || '').trim();
  if (!raw || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) || raw.startsWith('/') || raw.startsWith('//')) return null;
  if (raw.split('/').includes('..')) return null;
  const base = typeof deck.media_base === 'string' ? deck.media_base : '';
  return `${base}${raw}`;
}

/**
 * One field value, escaped, with Anki's two media spellings rebuilt.
 * `[sound:a.mp3]` becomes a play button, `<img src="a.png">` becomes an image.
 */
export function renderFieldValue(raw, deck) {
  const src = String(raw ?? '');
  let out = '';
  let last = 0;
  let m;
  MEDIA_RE.lastIndex = 0;
  while ((m = MEDIA_RE.exec(src)) !== null) {
    out += escHtml(src.slice(last, m.index));
    const path = safeMediaPath(deck, m[1] || m[2]);
    if (path && m[1]) {
      out += `<button type="button" class="rp-media-audio" data-audio="${escHtml(path)}" aria-label="Play audio">Play</button>`;
    } else if (path) {
      out += `<img class="rp-media-img" src="${escHtml(path)}" alt="">`;
    }
    last = m.index + m[0].length;
  }
  out += escHtml(src.slice(last));
  return out;
}

/**
 * A template string with {{Field}} substituted. Literal text is escaped; the
 * one token that survives is <br>, which becomes a real line break, because
 * decks converted out of Anki carry it and losing it merges two lines.
 */
export function renderTemplate(tpl, note, deck) {
  const src = String(tpl || '').replace(BR_RE, '\n');
  let out = '';
  let last = 0;
  let m;
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(src)) !== null) {
    out += escHtml(src.slice(last, m.index));
    out += renderFieldValue(note.f?.[m[1].trim()] ?? '', deck);
    last = m.index + m[0].length;
  }
  out += escHtml(src.slice(last));
  return out;
}

/** The plain text a field holds, with media tokens dropped. */
export function fieldText(note, name) {
  return String(note.f?.[name] ?? '').replace(MEDIA_RE, '').trim();
}

/** The distinct cloze ordinals in a note's cloze field, ascending. */
export function clozeOrdinalsOf(note, template) {
  const text = String(note.f?.[template.text_field] ?? '');
  const seen = new Set();
  let m;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(text)) !== null) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

/**
 * Render a cloze field, blanking one ordinal and revealing the rest.
 * @param {number} ordinal the c<N> to hide
 * @param {boolean} reveal true to show the answer in place instead of a blank
 */
export function renderCloze(note, template, deck, ordinal, reveal) {
  const src = String(note.f?.[template.text_field] ?? '');
  let out = '';
  let last = 0;
  let m;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(src)) !== null) {
    out += escHtml(src.slice(last, m.index));
    const n = Number(m[1]);
    const body = m[2];
    const hint = m[3];
    if (n !== ordinal) {
      out += renderFieldValue(body, deck);
    } else if (reveal) {
      out += `<span class="rp-cloze rp-cloze--shown">${renderFieldValue(body, deck)}</span>`;
    } else {
      out += `<span class="rp-cloze">${hint ? escHtml(hint) : '[...]'}</span>`;
    }
    last = m.index + m[0].length;
  }
  out += escHtml(src.slice(last));
  return out;
}

/** The answer text of a cloze card, for grading and for the log. */
export function clozeAnswer(note, template, ordinal) {
  const src = String(note.f?.[template.text_field] ?? '');
  let m;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(src)) !== null) {
    if (Number(m[1]) === ordinal) return m[2];
  }
  return '';
}

/**
 * Every card in a deck, in deck order.
 *
 * @returns {{ id, noteId, templateId, ordinal, note, template, skill }[]}
 */
export function expandCards(deck) {
  const templates = new Map((deck.templates || []).map((t) => [t.id, t]));
  const cards = [];
  for (const note of deck.notes || []) {
    const wanted = Array.isArray(note.templates) ? note.templates : [...templates.keys()];
    for (const tid of wanted) {
      const template = templates.get(tid);
      if (!template) continue;
      const skill = note.skill || template.skill || '';
      if (template.kind === 'cloze') {
        for (const ordinal of clozeOrdinalsOf(note, template)) {
          cards.push({
            id: `${note.id}:${tid}:${ordinal}`,
            noteId: note.id, templateId: tid, ordinal, note, template, skill,
          });
        }
        continue;
      }
      cards.push({
        id: `${note.id}:${tid}`,
        noteId: note.id, templateId: tid, ordinal: null, note, template, skill,
      });
    }
  }
  return cards;
}

/** The itemId a host receives on rappel:answer. Stable, and not the card id. */
export function itemIdOf(deck, card) {
  return `${deck.id}:${card.noteId}`;
}

/** The expected answer string for a graded card. */
export function expectedAnswer(card) {
  const { template, note } = card;
  if (template.kind === 'cloze') return clozeAnswer(note, template, card.ordinal);
  if (template.kind === 'typed' || template.kind === 'choice') {
    return fieldText(note, template.answer_field);
  }
  return '';
}

function shuffle(list, rng = Math.random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Options for a choice card. Siblings first: a distractor drawn at random from
 * the whole deck is not a discriminator (C10.3 rule 4). When there are not
 * enough siblings, the rest come from the deck so the card is still answerable.
 */
export function choiceOptions(deck, card, rng = Math.random) {
  const want = Number.isInteger(card.template.count) ? card.template.count : 4;
  const field = card.template.answer_field;
  const correct = fieldText(card.note, field);
  const tags = new Set(card.note.tags || []);
  const pool = (deck.notes || []).filter((n) => n.id !== card.note.id && fieldText(n, field));

  const siblings = card.template.distractors === 'sample-from-deck'
    ? []
    : pool.filter((n) => (n.tags || []).some((t) => tags.has(t)));

  const picked = [];
  const seen = new Set([correct]);
  for (const n of [...shuffle(siblings, rng), ...shuffle(pool, rng)]) {
    if (picked.length >= want - 1) break;
    const value = fieldText(n, field);
    if (seen.has(value)) continue;
    seen.add(value);
    picked.push(value);
  }
  return shuffle([correct, ...picked], rng);
}

/** The deck's own name, resolved to a language. */
export function deckName(deck, lang = 'en') {
  const v = deck?.name;
  if (typeof v === 'string') return v;
  if (!v) return deck?.id || 'Deck';
  return v[lang] || v.en || v.es || deck?.id || 'Deck';
}

/** true when this deck's licence obliges an on-screen acknowledgement. C11.3. */
export function needsAttribution(deck) {
  return deck?.screen === 'required' && typeof deck?.attribution === 'string' && !!deck.attribution.trim();
}
