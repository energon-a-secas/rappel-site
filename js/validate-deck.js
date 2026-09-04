/**
 * The deck and ledger validator. Contracts C4 and C5.
 *
 * One validator per schema, and this is it. The browser imports it before a
 * fetched or imported document is allowed anywhere near persistent storage,
 * tools/validate-deck.mjs runs it from the command line, and the rappel-deck
 * forge skill imports that rather than writing a second notion of valid.
 *
 * Pure: no DOM, no fetch, no storage. Every function returns
 * { ok, errors: [{ path, message }], warnings: [...] } and never throws.
 */

export const DECK_FORMAT = 'neo-deck/1';
/**
 * The built-in deck catalog. A static site cannot list a directory, so the
 * decks a build ships are discovered from one file, the same shape C1.1 gives
 * Runcible's books/index.json.
 *
 * Ratified as C12 A12 on 2026-09-04: C6.1 names "a built-in deck id" and this
 * index is how the engine learns the list. Validated here as written.
 */
export const DECK_INDEX_FORMAT = 'neo-deck-index/1';
export const LEDGER_FORMAT = 'neo-ledger/1';
export const TEMPLATE_KINDS = ['basic', 'typed', 'cloze', 'choice'];
export const CARD_STATES = ['new', 'learning', 'review', 'relearning'];
export const TRANSFORMS = ['kana', 'kana-katakana'];
export const COMPARE_TOKENS = ['trim', 'casefold', 'strip-accents', 'collapse-space', 'kana'];
export const SCREEN_VALUES = ['required', 'none'];

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// C4.4: a deck fetched from outside neorgon.com is stored as ext:<12 hex>:<id>,
// and that namespaced id must validate too or every third-party deck is refused.
const DECK_ID_RE = /^(?:ext:[0-9a-f]{12}:)?[A-Za-z0-9][A-Za-z0-9._-]*$/;
const FIELD_RE = /\{\{([^{}]+)\}\}/g;
/** Anki's cloze syntax: {{cN::text}} or {{cN::text::hint}}. C4.2 rule 2. */
export const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

function newReport() {
  const errors = [];
  const warnings = [];
  return {
    errors,
    warnings,
    err(path, message) { errors.push({ path, message }); },
    warn(path, message) { warnings.push({ path, message }); },
    done() { return { ok: errors.length === 0, errors, warnings }; },
  };
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** A bilingual value: a bare string is legal. CONTRACTS.md convention 2. */
function isBilingual(v) {
  if (typeof v === 'string') return true;
  if (!isPlainObject(v)) return false;
  return Object.values(v).every((x) => x === null || typeof x === 'string');
}

/** Field names referenced by a {{Field}} template string, cloze markers aside. */
export function fieldsUsed(text) {
  const out = [];
  const src = String(text || '');
  let m;
  FIELD_RE.lastIndex = 0;
  while ((m = FIELD_RE.exec(src)) !== null) {
    const name = m[1].trim();
    if (!/^c\d+::/.test(name)) out.push(name);
  }
  return out;
}

/** The distinct cloze ordinals in a piece of text, ascending. */
export function clozeOrdinals(text) {
  const seen = new Set();
  const src = String(text || '');
  let m;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(src)) !== null) seen.add(Number(m[1]));
  return [...seen].sort((a, b) => a - b);
}

/**
 * Validate a neo-deck/1 document. C4.
 * @param {any} doc
 * @param {{ name?: string }} [opts] name used in message paths, e.g. a filename
 */
export function validateDeck(doc, opts = {}) {
  const r = newReport();
  const at = opts.name ? `${opts.name}` : 'deck';

  if (!isPlainObject(doc)) {
    r.err(at, 'not a JSON object');
    return r.done();
  }
  if (doc.format !== DECK_FORMAT) {
    r.err(`${at}.format`, `must be "${DECK_FORMAT}", got ${JSON.stringify(doc.format)}`);
  }
  if (typeof doc.id !== 'string' || !DECK_ID_RE.test(doc.id)) {
    r.err(`${at}.id`, 'must be a string of letters, digits, dot, dash or underscore (a third-party deck carries the ext:<hash>: prefix C4.4 gives it)');
  }
  if (typeof doc.version !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(doc.version)) {
    r.err(`${at}.version`, 'must be a YYYY-MM-DD date string, bumped on any content change');
  }
  if (!isBilingual(doc.name)) {
    r.err(`${at}.name`, 'must be a string or an { en, es } object');
  }
  if (!isPlainObject(doc.lang) || typeof doc.lang.front !== 'string' || typeof doc.lang.back !== 'string') {
    r.err(`${at}.lang`, 'must be { front, back } with two language codes');
  }

  validateLicence(doc, at, r);
  validateMediaBase(doc, at, r);

  const fields = Array.isArray(doc.fields) ? doc.fields : null;
  if (!fields || fields.length === 0 || !fields.every((f) => typeof f === 'string' && f)) {
    r.err(`${at}.fields`, 'must be a non-empty array of field names');
  } else if (new Set(fields).size !== fields.length) {
    r.err(`${at}.fields`, 'field names must be unique');
  }
  const fieldSet = new Set(fields || []);

  const templates = Array.isArray(doc.templates) ? doc.templates : null;
  if (!templates || templates.length === 0) {
    r.err(`${at}.templates`, 'must be a non-empty array');
  }
  const templateIds = new Set();
  (templates || []).forEach((t, i) => validateTemplate(t, i, `${at}.templates[${i}]`, fieldSet, templateIds, r));

  const notes = Array.isArray(doc.notes) ? doc.notes : null;
  if (!notes || notes.length === 0) {
    r.err(`${at}.notes`, 'must be a non-empty array');
  }
  const noteIds = new Set();
  (notes || []).forEach((n, i) => validateNote(n, `${at}.notes[${i}]`, fieldSet, templateIds, noteIds, r));

  return r.done();
}

function validateLicence(doc, at, r) {
  if (doc.licence !== undefined && typeof doc.licence !== 'string') {
    r.err(`${at}.licence`, 'must be an SPDX id string when present');
    return;
  }
  if (doc.screen !== undefined && !SCREEN_VALUES.includes(doc.screen)) {
    r.err(`${at}.screen`, `must be one of ${SCREEN_VALUES.join(', ')}`);
  }
  // C4.3 amendment 1: an SPDX id does not carry the required on-screen wording.
  if (typeof doc.licence === 'string' && doc.licence.startsWith('CC-BY')) {
    if (typeof doc.attribution !== 'string' || doc.attribution.trim().length === 0) {
      r.err(`${at}.attribution`, 'required whenever licence starts with CC-BY: the exact on-screen wording');
    }
    if (doc.screen !== 'required') {
      r.err(`${at}.screen`, 'must be "required" whenever licence starts with CC-BY');
    }
  }
}

function validateMediaBase(doc, at, r) {
  if (doc.media_base === undefined) return;
  const v = doc.media_base;
  if (typeof v !== 'string') {
    r.err(`${at}.media_base`, 'must be a string');
    return;
  }
  // C4.3 amendment 4: a deck must not be able to make the engine fetch an
  // arbitrary URL, so this is a same-origin relative path with no ".." in it.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) || v.startsWith('//') || v.startsWith('/')) {
    r.err(`${at}.media_base`, 'must be a relative path, not an absolute URL or a root path');
  }
  if (v.split('/').includes('..')) {
    r.err(`${at}.media_base`, 'must not contain a ".." segment');
  }
}

function validateTemplate(t, i, at, fieldSet, templateIds, r) {
  if (!isPlainObject(t)) {
    r.err(at, 'not an object');
    return;
  }
  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) {
    r.err(`${at}.id`, 'must be a string of letters, digits, dot, dash or underscore');
  } else if (templateIds.has(t.id)) {
    r.err(`${at}.id`, `duplicate template id "${t.id}"; card identity is noteId:templateId`);
  } else {
    templateIds.add(t.id);
  }
  if (!TEMPLATE_KINDS.includes(t.kind)) {
    r.err(`${at}.kind`, `must be one of ${TEMPLATE_KINDS.join(', ')}`);
  }
  if (t.skill !== undefined && typeof t.skill !== 'string') {
    r.err(`${at}.skill`, 'must be a dotted skill string when present');
  } else if (t.skill === undefined) {
    // C4.3 amendment 2: without it, rappel:answer's itemId means nothing to a
    // host and a review cannot become evidence for a chapter goal.
    r.warn(`${at}.skill`, 'no skill: a host embedding this deck gets no usable itemId on rappel:answer');
  }

  for (const side of ['front', 'back']) {
    if (t[side] === undefined) continue;
    if (typeof t[side] !== 'string') {
      r.err(`${at}.${side}`, 'must be a string');
      continue;
    }
    for (const f of fieldsUsed(t[side])) {
      if (!fieldSet.has(f)) r.err(`${at}.${side}`, `references {{${f}}}, which is not in fields[]`);
    }
  }

  if (t.kind === 'basic' && (typeof t.front !== 'string' || typeof t.back !== 'string')) {
    r.err(at, 'a basic template needs front and back');
  }
  if (t.kind === 'typed') {
    if (typeof t.answer_field !== 'string' || !fieldSet.has(t.answer_field)) {
      r.err(`${at}.answer_field`, 'a typed template needs an answer_field naming a declared field');
    }
    if (t.transform !== undefined && !TRANSFORMS.includes(t.transform)) {
      r.err(`${at}.transform`, `must be one of ${TRANSFORMS.join(', ')} when present`);
    }
    if (t.compare !== undefined) validateCompare(t.compare, `${at}.compare`, r);
  }
  if (t.kind === 'cloze') {
    if (typeof t.text_field !== 'string' || !fieldSet.has(t.text_field)) {
      r.err(`${at}.text_field`, 'a cloze template needs a text_field naming a declared field');
    }
  }
  if (t.kind === 'choice') {
    if (typeof t.answer_field !== 'string' || !fieldSet.has(t.answer_field)) {
      r.err(`${at}.answer_field`, 'a choice template needs an answer_field naming a declared field');
    }
    if (t.distractors !== undefined && !['sample-from-deck', 'siblings'].includes(t.distractors)) {
      r.err(`${at}.distractors`, 'must be "sample-from-deck" or "siblings"');
    }
    const n = t.count === undefined ? 4 : t.count;
    if (!Number.isInteger(n) || n < 2 || n > 8) {
      r.err(`${at}.count`, 'must be a whole number from 2 to 8');
    }
  }
}

function validateCompare(value, at, r) {
  if (typeof value !== 'string' || !value) {
    r.err(at, 'must be a pipe separated token list');
    return;
  }
  for (const token of value.split('|')) {
    if (!COMPARE_TOKENS.includes(token)) {
      r.err(at, `unknown token "${token}"; known: ${COMPARE_TOKENS.join(', ')}`);
    }
  }
}

function validateNote(n, at, fieldSet, templateIds, noteIds, r) {
  if (!isPlainObject(n)) {
    r.err(at, 'not an object');
    return;
  }
  if (typeof n.id === 'string' && n.id.includes(':')) {
    // Checked before the character class so the message names the real reason:
    // the colon is the separator in noteId + ":" + templateId.
    r.err(`${at}.id`, 'must not contain a colon: card identity is noteId + ":" + templateId');
  } else if (typeof n.id !== 'string' || !ID_RE.test(n.id)) {
    r.err(`${at}.id`, 'must be a stable string id, never an index');
  } else if (noteIds.has(n.id)) {
    r.err(`${at}.id`, `duplicate note id "${n.id}"; it is the ledger's foreign key`);
  } else {
    noteIds.add(n.id);
  }
  if (!isPlainObject(n.f)) {
    r.err(`${at}.f`, 'must be an object of field values');
  } else {
    for (const [k, v] of Object.entries(n.f)) {
      if (!fieldSet.has(k)) r.err(`${at}.f.${k}`, 'not a declared field');
      if (typeof v !== 'string') r.err(`${at}.f.${k}`, 'field values must be strings');
    }
  }
  if (n.tags !== undefined && (!Array.isArray(n.tags) || !n.tags.every((t) => typeof t === 'string'))) {
    r.err(`${at}.tags`, 'must be an array of strings when present');
  }
  if (n.templates !== undefined) {
    if (!Array.isArray(n.templates) || n.templates.length === 0) {
      r.err(`${at}.templates`, 'must be a non-empty array of template ids when present');
    } else {
      for (const id of n.templates) {
        if (!templateIds.has(id)) r.err(`${at}.templates`, `"${id}" is not a template of this deck`);
      }
    }
  }
}

/** Validate the built-in deck catalog. See DECK_INDEX_FORMAT above. */
export function validateDeckIndex(doc, opts = {}) {
  const r = newReport();
  const at = opts.name || 'index';
  if (!isPlainObject(doc)) {
    r.err(at, 'not a JSON object');
    return r.done();
  }
  if (doc.format !== DECK_INDEX_FORMAT) {
    r.err(`${at}.format`, `must be "${DECK_INDEX_FORMAT}", got ${JSON.stringify(doc.format)}`);
  }
  if (!Array.isArray(doc.decks)) {
    r.err(`${at}.decks`, 'must be an array of catalog entries');
    return r.done();
  }
  const ids = new Set();
  doc.decks.forEach((entry, i) => {
    const eAt = `${at}.decks[${i}]`;
    if (!isPlainObject(entry)) {
      r.err(eAt, 'not an object');
      return;
    }
    if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) r.err(`${eAt}.id`, 'must be a deck id');
    else if (ids.has(entry.id)) r.err(`${eAt}.id`, `duplicate deck id "${entry.id}"`);
    else ids.add(entry.id);
    if (typeof entry.file !== 'string' || !entry.file) {
      r.err(`${eAt}.file`, 'must be the path to the deck document');
    } else if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(entry.file) || entry.file.startsWith('/')
               || entry.file.split('/').includes('..')) {
      r.err(`${eAt}.file`, 'must be a same-origin relative path with no ".." segment');
    }
    if (!isBilingual(entry.name)) r.err(`${eAt}.name`, 'must be a string or an { en, es } object');
    if (entry.note !== undefined && typeof entry.note !== 'string') r.err(`${eAt}.note`, 'must be a string when present');
  });
  return r.done();
}

/** Validate a neo-ledger/1 document. C5. */
export function validateLedger(doc, opts = {}) {
  const r = newReport();
  const at = opts.name || 'ledger';

  if (!isPlainObject(doc)) {
    r.err(at, 'not a JSON object');
    return r.done();
  }
  if (doc.format !== LEDGER_FORMAT) {
    r.err(`${at}.format`, `must be "${LEDGER_FORMAT}", got ${JSON.stringify(doc.format)}`);
  }
  if (!Number.isFinite(doc.exported)) r.err(`${at}.exported`, 'must be a timestamp in ms');
  if (typeof doc.origin !== 'string' || !doc.origin) r.err(`${at}.origin`, 'must be the exporting origin');

  validateSchedulerBlock(doc.scheduler, `${at}.scheduler`, r);

  if (!isPlainObject(doc.decks)) {
    r.err(`${at}.decks`, 'must be an object keyed by deck id');
    return r.done();
  }
  for (const [deckId, entry] of Object.entries(doc.decks)) {
    const dAt = `${at}.decks["${deckId}"]`;
    if (!isPlainObject(entry)) {
      r.err(dAt, 'not an object');
      continue;
    }
    // null is a value, not a mistake: it is "this progress has never been read
    // against a deck version". state.js creates a row group with it, an export
    // that carries orphan log entries emits it, and the sync module's pulled
    // document sets it on every deck. Rejecting it would fail three producers
    // this project ships, on a message that names none of them.
    if (entry.deck_version_seen !== undefined && entry.deck_version_seen !== null
        && typeof entry.deck_version_seen !== 'string') {
      r.err(`${dAt}.deck_version_seen`, 'must be the deck version string it was last read against, or null for never');
    }
    if (!isPlainObject(entry.cards)) {
      r.err(`${dAt}.cards`, 'must be a map keyed by card id, never an array');
    } else {
      for (const [cardId, card] of Object.entries(entry.cards)) {
        validateCardRow(card, cardId, `${dAt}.cards["${cardId}"]`, r);
      }
    }
    if (entry.log !== undefined) {
      if (!Array.isArray(entry.log)) r.err(`${dAt}.log`, 'must be an array when present');
      else entry.log.forEach((e, i) => validateLogEntry(e, `${dAt}.log[${i}]`, r));
    }
  }
  return r.done();
}

function validateSchedulerBlock(s, at, r) {
  if (!isPlainObject(s)) {
    r.err(at, 'missing: a ledger replays identically only if its parameters are recorded');
    return;
  }
  if (s.name !== 'fsrs') r.err(`${at}.name`, 'must be "fsrs"');
  if (s.version !== 6) r.err(`${at}.version`, 'must be 6');
  if (!Array.isArray(s.w) || s.w.length !== 21 || !s.w.every((n) => Number.isFinite(n))) {
    r.err(`${at}.w`, 'must be 21 finite numbers');
  }
  if (!(Number.isFinite(s.desired_retention) && s.desired_retention > 0.5 && s.desired_retention < 1)) {
    r.err(`${at}.desired_retention`, 'must be between 0.5 and 1');
  }
  if (!Number.isInteger(s.maximum_interval) || s.maximum_interval < 1) {
    r.err(`${at}.maximum_interval`, 'must be a whole number of days, at least 1');
  }
  for (const key of ['learn_steps', 'relearn_steps']) {
    const v = s[key];
    if (!Array.isArray(v) || !v.every((n) => Number.isFinite(n) && n > 0)) {
      r.err(`${at}.${key}`, 'must be an array of positive seconds');
    }
  }
  if (!Number.isInteger(s.day_start_hour) || s.day_start_hour < 0 || s.day_start_hour > 23) {
    r.err(`${at}.day_start_hour`, 'must be an hour from 0 to 23');
  }
}

function validateCardRow(card, cardId, at, r) {
  if (!cardId.includes(':')) {
    r.err(at, 'card id must be noteId + ":" + templateId');
  }
  if (!isPlainObject(card)) {
    r.err(at, 'not an object');
    return;
  }
  for (const key of ['s', 'd', 'due', 'lr', 'reps', 'lapses', 'step']) {
    if (!Number.isFinite(card[key])) r.err(`${at}.${key}`, 'must be a finite number');
  }
  if (!CARD_STATES.includes(card.st)) {
    r.err(`${at}.st`, `must be one of ${CARD_STATES.join(', ')}`);
  }
  if (Number.isFinite(card.d) && card.d !== 0 && (card.d < 1 || card.d > 10)) {
    r.err(`${at}.d`, 'difficulty must be 0 (never reviewed) or between 1 and 10');
  }
}

function validateLogEntry(e, at, r) {
  if (!isPlainObject(e)) {
    r.err(at, 'not an object');
    return;
  }
  if (typeof e.c !== 'string' || !e.c.includes(':')) {
    r.err(`${at}.c`, 'must be a noteId:templateId card id');
  }
  for (const key of ['t', 'e', 's0', 'd0', 'el']) {
    if (!Number.isFinite(e[key])) r.err(`${at}.${key}`, 'must be a finite number');
  }
  if (![1, 2, 3, 4].includes(e.g)) r.err(`${at}.g`, 'must be a grade from 1 to 4');
  // C5.3 amendment 1: without st0 a replay cannot tell which branch ran.
  if (!CARD_STATES.includes(e.st0)) {
    r.err(`${at}.st0`, `must be the state BEFORE the review, one of ${CARD_STATES.join(', ')}`);
  }
}

/** One line per problem, for a console or a CLI. */
export function formatReport(report) {
  return [
    ...report.errors.map((e) => `  error  ${e.path}: ${e.message}`),
    ...report.warnings.map((e) => `  warn   ${e.path}: ${e.message}`),
  ].join('\n');
}
