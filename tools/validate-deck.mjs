#!/usr/bin/env node
/**
 * Deck and ledger validator, command line front end. Contracts C4 and C5.
 *
 *   node tools/validate-deck.mjs                 # every deck this repo ships
 *   node tools/validate-deck.mjs path/to/x.json  # named files
 *   make validate
 *
 * It exits 0, or it exits 1 and names the file, the record and the field.
 * Nothing runs it for you: it is not in root `make smoke`. Running it is part
 * of the definition of done for any change under data/ or js/validate-deck.js.
 *
 * The rules live in js/validate-deck.js, which the browser imports too, so a
 * document rejected here is rejected in the app and the other way round. The
 * rappel-deck forge skill imports THIS file rather than writing a second
 * notion of valid:
 *
 *   import { validateDeck, formatReport } from '<repo>/projects/rappel-site/tools/validate-deck.mjs';
 *
 * The site is zero-build: package.json exists only so `npx convex dev --once`
 * will run (C12 A7) and carries "type": "module", which is what lets this file
 * import js/validate-deck.js directly rather than keeping a second copy of it.
 */

import { readFile, readdir } from 'node:fs/promises';
import { dirname, resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  validateDeck, validateLedger, validateDeckIndex, formatReport,
  DECK_FORMAT, LEDGER_FORMAT, DECK_INDEX_FORMAT,
} from '../js/validate-deck.js';

export {
  validateDeck, validateLedger, validateDeckIndex, formatReport,
  DECK_FORMAT, LEDGER_FORMAT, DECK_INDEX_FORMAT,
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
/** Where decks live: data/decks is workstream Cb's, tools/fixtures is B's. */
const SEARCH_DIRS = ['data/decks', 'tools/fixtures'];

async function listJson(dir) {
  try {
    const names = await readdir(join(ROOT, dir));
    return names.filter((n) => n.endsWith('.json')).map((n) => join(ROOT, dir, n));
  } catch {
    return [];
  }
}

/** Validate one file, choosing the schema from its own format field. */
export async function validateFile(path) {
  const name = relative(ROOT, path) || path;
  let doc;
  try {
    doc = JSON.parse(await readFile(path, 'utf8'));
  } catch (e) {
    return { name, report: { ok: false, errors: [{ path: name, message: `unreadable: ${e.message}` }], warnings: [] } };
  }
  const format = doc && doc.format;
  if (format === LEDGER_FORMAT) return { name, report: validateLedger(doc, { name }) };
  if (format === DECK_FORMAT) return { name, report: validateDeck(doc, { name }) };
  if (format === DECK_INDEX_FORMAT) return { name, report: validateDeckIndex(doc, { name }) };
  return {
    name,
    report: {
      ok: false,
      errors: [{ path: `${name}.format`, message: `must be "${DECK_FORMAT}", "${DECK_INDEX_FORMAT}" or "${LEDGER_FORMAT}", got ${JSON.stringify(format)}` }],
      warnings: [],
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let files = args.map((a) => resolve(process.cwd(), a));
  if (files.length === 0) {
    for (const dir of SEARCH_DIRS) files.push(...(await listJson(dir)));
  }
  if (files.length === 0) {
    console.log('No deck or ledger documents found under ' + SEARCH_DIRS.join(' or '));
    return 0;
  }

  let bad = 0;
  let warnings = 0;
  for (const file of files) {
    const { name, report } = await validateFile(file);
    warnings += report.warnings.length;
    if (report.ok && report.warnings.length === 0) {
      console.log(`  ok    ${name}`);
      continue;
    }
    console.log(`  ${report.ok ? 'warn ' : 'FAIL '} ${name}`);
    console.log(formatReport(report));
    if (!report.ok) bad += 1;
  }
  console.log(`\n${files.length} document(s), ${bad} invalid, ${warnings} warning(s)`);
  return bad === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
