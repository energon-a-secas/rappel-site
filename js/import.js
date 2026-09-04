/**
 * Import. TSV, CSV and JSON, using Anki's own header dialect verbatim so files
 * round-trip. Contract C4.5.
 *
 * .apkg is closed by PLAN and is not reopened here: the modern inner collection
 * is zstd, DecompressionStream("zstd") is Firefox 138 and later only, and
 * sql.js is 0.69 MB of third-party runtime the zero-build constraint forbids.
 */

import { validateDeck } from './validate-deck.js';

const SEPARATORS = {
  tab: '\t', comma: ',', semicolon: ';', space: ' ', pipe: '|', colon: ':',
};

/** Anki's #key:value header block, which must come before any data row. */
export function parseHeaders(text) {
  const headers = {};
  const lines = String(text).split(/\r?\n/);
  let i = 0;
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('#')) break;
    const at = line.indexOf(':');
    if (at < 0) continue;
    headers[line.slice(1, at).trim().toLowerCase()] = line.slice(at + 1);
  }
  return { headers, body: lines.slice(i).join('\n') };
}

function separatorOf(headers, sample) {
  const raw = (headers.separator || '').trim();
  if (raw) {
    const named = SEPARATORS[raw.toLowerCase()];
    if (named) return named;
    if (raw.length === 1) return raw;
  }
  // No header: pick the delimiter that actually splits the first line.
  const first = sample.split(/\r?\n/).find((l) => l.trim()) || '';
  if (first.includes('\t')) return '\t';
  if (first.includes(';')) return ';';
  return ',';
}

/**
 * A delimited table, quote aware, RFC 4180 style doubling for a literal quote.
 * A file whose quoting never closes (a field that merely starts with a quote,
 * which this site's own TSV export produces) is read again with quotes taken
 * literally, rather than swallowing every later row into one field.
 */
export function parseDelimited(text, sep, opts = {}) {
  const quotes = opts.quotes !== false;
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += ch;
      continue;
    }
    if (quotes && ch === '"' && field === '') { quoted = true; continue; }
    if (ch === sep) { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch === '\r') continue;
    field += ch;
  }
  if (quoted && quotes) return parseDelimited(text, sep, { quotes: false });
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * A stable note id from the front text, so a re-import of an edited file
 * re-keys nothing and the ledger rows keep their notes (C4.5). FNV-1a, 32 bit.
 */
export function noteIdFor(front, seen) {
  let h = 0x811c9dc5;
  const s = String(front || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let id = `n_${h.toString(16).padStart(8, '0')}`;
  while (seen.has(id)) id = `${id}_`;
  seen.add(id);
  return id;
}

function slug(text, fallback) {
  const s = String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Turn a delimited document into a neo-deck/1 document.
 * @param {string} text  the whole file
 * @param {{ name?: string, reverse?: boolean }} opts
 * @returns {{ ok: true, deck: object, notes: number } | { ok: false, error: string }}
 */
export function importDelimited(text, opts = {}) {
  const { headers, body } = parseHeaders(text);
  const sep = separatorOf(headers, body);
  const rows = parseDelimited(body, sep);
  if (rows.length === 0) return { ok: false, error: 'No rows found in the file' };

  const columns = headers.columns
    ? headers.columns.split(sep).map((c) => c.trim()).filter(Boolean)
    : null;
  const width = Math.max(...rows.map((r) => r.length));
  const fields = columns && columns.length >= width
    ? columns
    : Array.from({ length: width }, (_, i) => (i === 0 ? 'Front' : i === 1 ? 'Back' : `Field ${i + 1}`));

  const guidCol = Number.parseInt(headers['guid column'], 10);
  const tagsCol = Number.parseInt(headers['tags column'], 10);
  const deckName = (headers.deck || opts.name || 'Imported deck').trim();

  const notes = [];
  const seen = new Set();
  rows.forEach((cells, i) => {
    const f = {};
    fields.forEach((name, c) => {
      if (Number.isFinite(guidCol) && c === guidCol - 1) return;
      if (Number.isFinite(tagsCol) && c === tagsCol - 1) return;
      f[name] = (cells[c] ?? '').trim();
    });
    const front = Object.values(f)[0] || '';
    if (!front) return;
    let id = Number.isFinite(guidCol) ? (cells[guidCol - 1] || '').trim().replace(/[^A-Za-z0-9._-]/g, '') : '';
    if (id) {
      // ID_RE wants a letter or digit first; a GUID can sanitise down to a leading dot or dash.
      if (!/^[A-Za-z0-9]/.test(id)) id = `g${id}`;
      while (seen.has(id)) id = `${id}_`;
      seen.add(id);
    } else {
      // No GUID column: key the note by its front text, not its row number, so
      // inserting or deleting a line in a re-imported file orphans nothing.
      id = noteIdFor(front, seen);
    }
    const tags = Number.isFinite(tagsCol)
      ? (cells[tagsCol - 1] || '').split(/\s+/).filter(Boolean)
      : [];
    notes.push({ id, f, ...(tags.length ? { tags } : {}) });
  });

  if (notes.length === 0) return { ok: false, error: 'Every row was empty in its first column' };

  const usable = fields.filter((_, c) => {
    if (Number.isFinite(guidCol) && c === guidCol - 1) return false;
    if (Number.isFinite(tagsCol) && c === tagsCol - 1) return false;
    return true;
  });
  const deck = buildDeck({ name: deckName, fields: usable, notes, reverse: opts.reverse });
  return finish(deck, notes.length);
}

/** Assemble a minimal, valid neo-deck/1 from fields and notes. */
export function buildDeck({ name, fields, notes, reverse = false, id = null }) {
  const front = fields[0];
  const back = fields[1] || fields[0];
  const templates = [
    { id: 'recognition', kind: 'basic', front: `{{${front}}}`, back: `{{${back}}}` },
  ];
  if (reverse && fields.length > 1) {
    templates.push({ id: 'recall', kind: 'typed', answer_field: front,
      front: `{{${back}}}`, back: `{{${front}}}`, compare: 'trim|casefold' });
  }
  return {
    format: 'neo-deck/1',
    id: id || slug(name, `deck-${Date.now().toString(36)}`),
    version: today(),
    name,
    lang: { front: 'en', back: 'en' },
    licence: 'unspecified',
    screen: 'none',
    fields,
    templates,
    notes,
  };
}

/**
 * JSON import: either a neo-deck/1 document, or a bare array of pairs or
 * objects, which is what a person actually has to hand.
 */
export function importJson(text, opts = {}) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Not valid JSON: ${e.message}` };
  }
  if (doc && doc.format === 'neo-deck/1') return finish(doc, (doc.notes || []).length);

  if (!Array.isArray(doc) || doc.length === 0) {
    return { ok: false, error: 'Expected a neo-deck/1 document or a non-empty array' };
  }
  const first = doc[0];
  let fields;
  let rows;
  if (Array.isArray(first)) {
    fields = ['Front', 'Back'];
    rows = doc.map((pair) => ({ Front: String(pair[0] ?? ''), Back: String(pair[1] ?? '') }));
  } else if (first && typeof first === 'object') {
    fields = [...new Set(doc.flatMap((o) => Object.keys(o)))];
    rows = doc.map((o) => Object.fromEntries(fields.map((k) => [k, String(o[k] ?? '')])));
  } else {
    return { ok: false, error: 'Array entries must be objects or two-item arrays' };
  }
  const notes = rows
    .filter((f) => Object.values(f)[0])
    .map((f, i) => ({ id: `n_${String(i + 1).padStart(4, '0')}`, f }));
  const deck = buildDeck({ name: opts.name || 'Imported deck', fields, notes, reverse: opts.reverse });
  return finish(deck, notes.length);
}

/** Pick the reader from the file name and the text itself. */
export function importAny(text, opts = {}) {
  // A byte order mark in front of "#separator:tab" would hide every header line.
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const trimmed = clean.trim();
  if (!trimmed) return { ok: false, error: 'The file is empty' };
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    // A cloze list can start with "{{c1::" and a word list with "[sound:", so
    // the first character is a hint, not a verdict: only real JSON goes that way.
    let parsed = null;
    try { parsed = JSON.parse(trimmed); } catch { parsed = null; }
    if (parsed && typeof parsed === 'object') return importJson(trimmed, opts);
  }
  return importDelimited(clean, opts);
}

/** Nothing reaches storage without passing the C4 validator first. */
function finish(deck, count) {
  const report = validateDeck(deck, { name: deck.id || 'imported' });
  if (!report.ok) {
    return { ok: false, error: `${report.errors[0].path}: ${report.errors[0].message}` };
  }
  return { ok: true, deck, notes: count };
}
