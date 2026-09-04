/**
 * Export. The deck as neo-deck/1 JSON, the deck as Anki-importable TSV, and
 * the ledger as neo-ledger/1 JSON. Contract C4.5.
 *
 * The TSV carries Anki's own headers, including #guid column, so a person can
 * edit the file and re-import it without duplicating notes.
 */

import { deckName } from './deck.js';
import { buildLedgerDocument } from './ledger.js';
import { download } from './utils.js';

function cell(value) {
  // RFC 4180: a value holding a tab, a quote or a line break is quoted with
  // its quotes doubled, so the file round-trips through parseDelimited
  // instead of losing the characters or opening a quote it never closes.
  const s = String(value ?? '');
  return /[\t"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fileSlug(text) {
  return String(text || 'deck').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';
}

/** Anki's text format: a header block, then one row per note. */
export function deckToTsv(deck, lang = 'en') {
  const fields = deck.fields || [];
  const columns = ['GUID', ...fields, 'Tags'];
  const lines = [
    '#separator:tab',
    '#html:false',
    '#notetype:Basic',
    `#deck:${cell(deckName(deck, lang))}`,
    `#columns:${columns.join('\t')}`,
    '#guid column:1',
    `#tags column:${columns.length}`,
  ];
  for (const note of deck.notes || []) {
    const row = [note.id, ...fields.map((f) => cell(note.f?.[f])), (note.tags || []).join(' ')];
    lines.push(row.join('\t'));
  }
  return `${lines.join('\n')}\n`;
}

export function downloadDeckJson(deck, lang = 'en') {
  download(`${fileSlug(deck.id || deckName(deck, lang))}.deck.json`, JSON.stringify(deck, null, 2));
}

export function downloadDeckTsv(deck, lang = 'en') {
  download(`${fileSlug(deck.id || deckName(deck, lang))}.txt`, deckToTsv(deck, lang), 'text/plain');
}

/**
 * The whole ledger, both halves in one document, with the review log included.
 * This is the file that survives a browser, a device, or a partitioned Safari.
 */
export async function downloadLedger(opts = {}) {
  const doc = await buildLedgerDocument({ log: opts.log !== false, deckId: opts.deckId || null });
  const stamp = new Date(doc.exported).toISOString().slice(0, 10);
  download(`rappel-ledger-${stamp}.json`, JSON.stringify(doc, null, 2));
  return doc;
}
