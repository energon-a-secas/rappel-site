#!/usr/bin/env node
/**
 * The four rules PLAN states and nothing in the fleet checks. DESIGN.md 6.2
 * asked for exactly this, so it exists rather than being remembered.
 *
 *   1. No site JS module over 500 lines.
 *   2. js/app.js under 50 lines.
 *   3. No inline onclick anywhere.
 *   4. No single JSON file over 150 KB.
 *
 *   node tools/check-limits.mjs     # from inside projects/rappel-site
 *   make validate
 *
 * Vendored kit files are excluded by name and by reason: they are not this
 * project's code, they arrive from packages/neorgon-ui through a sync script,
 * and the header kit alone is 825 lines. Editing one to satisfy a line count
 * here would be the exact drift the sync scripts exist to prevent.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve, join, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_MODULE_LINES = 500;
const MAX_APP_LINES = 50;
const MAX_JSON_BYTES = 150 * 1024;

const VENDORED = [
  /^js\/neorgon-.*\.js$/,   // header, footer, beacon, persist kits
  /^js\/neokeys\//,         // NeoKeys kit
  /^js\/viz\.js$/,          // Viz kit
  /^js\/vendor\//,          // third-party, another workstream's directory
];

const failures = [];

async function walk(dir, out = []) {
  let names;
  try {
    names = await readdir(join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of names) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) await walk(rel, out);
    else out.push(rel);
  }
  return out;
}

function isVendored(rel) {
  return VENDORED.some((re) => re.test(rel));
}

async function lines(rel) {
  return (await readFile(join(ROOT, rel), 'utf8')).split('\n').length;
}

async function main() {
  const files = [
    ...(await walk('js')),
    ...(await walk('tools')),
    'index.html',
    '404.html',
  ];

  let checked = 0;
  for (const rel of files) {
    if (rel.endsWith('.js') || rel.endsWith('.mjs')) {
      if (isVendored(rel)) continue;
      checked += 1;
      const n = await lines(rel);
      if (rel === 'js/app.js' && n > MAX_APP_LINES) {
        failures.push(`${rel}: ${n} lines, over the ${MAX_APP_LINES} line cap for an entry point`);
      } else if (n > MAX_MODULE_LINES) {
        failures.push(`${rel}: ${n} lines, over the ${MAX_MODULE_LINES} line module cap`);
      }
    }
    if (rel.endsWith('.js') || rel.endsWith('.mjs') || rel.endsWith('.html')) {
      if (isVendored(rel)) continue;
      const text = await readFile(join(ROOT, rel), 'utf8');
      // In HTML, any on* attribute inside a tag. In JS, the same thing written
      // into a string, which is the only way one can reach the page from here.
      // A DOM property assignment (req.onsuccess = fn) is not an inline
      // handler and is how IndexedDB is spelled, so it is not matched.
      const re = rel.endsWith('.html')
        ? /<[^>]*\son[a-z]+\s*=/i
        : /\bon(click|change|input|submit|keydown|keyup|mouseover|load|error)\s*=\s*\\?["'`]/;
      text.split('\n').forEach((line, i) => {
        if (re.test(line) && !line.trim().startsWith('*')) {
          failures.push(`${rel}:${i + 1}: inline event attribute. Wire it in js/events.js instead`);
        }
      });
    }
  }

  for (const dir of ['data', 'tools/fixtures']) {
    for (const rel of await walk(dir)) {
      if (!rel.endsWith('.json')) continue;
      const size = (await stat(join(ROOT, rel))).size;
      checked += 1;
      if (size > MAX_JSON_BYTES) {
        failures.push(`${rel}: ${(size / 1024).toFixed(1)} KB, over the 150 KB per file cap`);
      }
    }
  }

  if (failures.length === 0) {
    console.log(`  ok    ${checked} file(s) within the module, entry point, onclick and JSON size limits`);
    return 0;
  }
  failures.forEach((f) => console.log(`  FAIL  ${f}`));
  console.log(`\n${failures.length} limit violation(s)`);
  return 1;
}

process.exit(await main());
