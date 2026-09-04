#!/usr/bin/env node
/**
 * The validator against bad documents. Contracts C4 and C5.
 *
 * A validator nobody has fed a broken file is a guess in the same way an
 * unchecked scheduler is. Each case below is a rule the contract states, and
 * the assertion is that the rule fires, not merely that a good file passes.
 *
 *   node tools/test-validate.mjs
 *   make validate
 */

import { validateDeck, validateLedger } from '../js/validate-deck.js';
import { defaultScheduler } from '../js/scheduler.js';
import { expandCards, choiceOptions, renderTemplate, renderCloze, renderFieldValue } from '../js/deck.js';
import { importAny } from '../js/import.js';
import { deckToTsv } from '../js/export.js';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const good = JSON.parse(await readFile(join(ROOT, 'tools/fixtures/demo-capitals.json'), 'utf8'));
const kana = JSON.parse(await readFile(join(ROOT, 'tools/fixtures/demo-kana.json'), 'utf8'));

let pass = 0;
const fails = [];
function ok_(label, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${label} ${detail}`); }
  else { fails.push(label); console.log(`  FAIL ${label} ${detail}`); }
}
function rejects(label, mutate, needle) {
  const doc = JSON.parse(JSON.stringify(good));
  mutate(doc);
  const r = validateDeck(doc, { name: 'case' });
  const hit = !r.ok && r.errors.some((e) => `${e.path} ${e.message}`.includes(needle));
  ok_(label, hit, r.ok ? '(accepted, and should not have been)' : `-> ${r.errors[0].path}`);
}

console.log('\nC4, the deck schema');
ok_('the shipped fixture is valid', validateDeck(good, { name: 'demo' }).ok);
ok_('the kana fixture is valid', validateDeck(kana, { name: 'kana' }).ok);
{
  // C4.4: a third-party deck is stored under ext:<12 hex>:<id>, and that id must validate.
  const ext = JSON.parse(JSON.stringify(good)); ext.id = 'ext:abc123def456:' + good.id;
  ok_('a namespaced third-party deck id is accepted', validateDeck(ext, { name: 'ext' }).ok);
}
rejects('a wrong format string', (d) => { d.format = 'neo-deck/2'; }, 'neo-deck/1');
rejects('a missing id', (d) => { delete d.id; }, '.id');
rejects('a version that is not a date', (d) => { d.version = 'v2'; }, '.version');
rejects('a duplicate note id', (d) => { d.notes[1].id = d.notes[0].id; }, 'duplicate note id');
rejects('a colon inside a note id', (d) => { d.notes[0].id = 'a:b'; }, 'must not contain a colon');
rejects('a duplicate template id', (d) => { d.templates[1].id = d.templates[0].id; }, 'duplicate template id');
rejects('an unknown template kind', (d) => { d.templates[0].kind = 'flip'; }, '.kind');
rejects('a field reference that does not exist', (d) => { d.templates[0].front = '{{Nope}}'; }, 'not in fields[]');
rejects('a typed template with no answer_field', (d) => { delete d.templates[1].answer_field; }, 'answer_field');
rejects('an unknown transform', (d) => { d.templates[1].transform = 'romaji'; }, '.transform');
rejects('an unknown compare token', (d) => { d.templates[1].compare = 'trim|shout'; }, 'unknown token');
rejects('a cloze template with no text_field', (d) => { delete d.templates[3].text_field; }, 'text_field');
rejects('a note field that is not declared', (d) => { d.notes[0].f.Nope = 'x'; }, 'not a declared field');
rejects('a note naming a template the deck does not have', (d) => { d.notes[0].templates = ['ghost']; }, 'not a template');
rejects('media_base as an absolute URL', (d) => { d.media_base = 'https://evil.test/'; }, 'relative path');
rejects('media_base climbing out with ..', (d) => { d.media_base = '../../'; }, '".." segment');
rejects('CC-BY with no attribution', (d) => { d.licence = 'CC-BY-SA-4.0'; }, '.attribution');
rejects('CC-BY with screen none', (d) => { d.licence = 'CC-BY-4.0'; d.attribution = 'x'; d.screen = 'none'; }, 'must be "required"');
{
  const doc = JSON.parse(JSON.stringify(good));
  delete doc.templates[0].skill;
  const r = validateDeck(doc, { name: 'case' });
  ok_('a template with no skill is a warning, not an error', r.ok && r.warnings.length > 0,
      `warnings: ${r.warnings.length}`);
}

console.log('\nC4.2, card identity');
{
  const cards = expandCards(good);
  ok_('every card id is noteId:templateId', cards.filter((c) => c.template.kind !== 'cloze')
    .every((c) => c.id === `${c.noteId}:${c.templateId}`));
  ok_('cloze expands to one card per marker', cards.some((c) => c.id === 'n_0001:gap:1') && cards.some((c) => c.id === 'n_0001:gap:2'),
      cards.filter((c) => c.noteId === 'n_0001').map((c) => c.id).join(' '));
  ok_('ids are unique', new Set(cards.map((c) => c.id)).size === cards.length, `${cards.length} cards`);
  ok_('no id is an index', cards.every((c) => !/^\d+$/.test(c.id)));
}

console.log('\nRendering escapes, because a deck can come from any https origin');
{
  const deck = { ...good, media_base: 'media/' };
  const note = { f: { Country: '<script>alert(1)</script>', Capital: '[sound:a.mp3]', Region: '<img src="x.png">' } };
  const out = renderTemplate('{{Country}}', note, deck);
  ok_('a script tag in a field is escaped', !out.includes('<script'), out.slice(0, 40));
  ok_('a sound token becomes a button', renderFieldValue(note.f.Capital, deck).includes('data-audio="media/a.mp3"'));
  ok_('an img token becomes an img with a relative src', renderFieldValue(note.f.Region, deck).includes('src="media/x.png"'));
  ok_('an absolute media src is dropped', !renderFieldValue('<img src="https://evil.test/x.png">', deck).includes('evil.test'));
  ok_('a media src climbing out is dropped', !renderFieldValue('[sound:../../etc/passwd]', deck).includes('passwd'));
  const cloze = renderCloze(good.notes[0], good.templates[3], deck, 1, false);
  ok_('an unrevealed cloze hides its answer', !cloze.includes('Lima') && cloze.includes('[...]'), cloze.slice(0, 60));
  ok_('a revealed cloze shows it', renderCloze(good.notes[0], good.templates[3], deck, 1, true).includes('Lima'));
}

console.log('\nChoice distractors come from siblings');
{
  const card = expandCards(good).find((c) => c.templateId === 'pick' && c.noteId === 'n_0001');
  const options = choiceOptions(good, card, () => 0.5);
  ok_('the correct answer is present', options.includes('Lima'), options.join(', '));
  ok_('there are four options', options.length === 4, String(options.length));
  ok_('no duplicates', new Set(options).size === options.length);
}

console.log('\nC4.5, Anki header dialect round trip');
{
  const tsv = deckToTsv(good);
  ok_('export writes #separator:tab', tsv.startsWith('#separator:tab'));
  ok_('export writes a guid column', tsv.includes('#guid column:1'));
  const back = importAny(tsv, {});
  ok_('the export re-imports', back.ok, back.ok ? `${back.notes} notes` : back.error);
  ok_('note ids survive the round trip', back.ok && back.deck.notes[0].id === good.notes[0].id,
      back.ok ? back.deck.notes[0].id : '');
  const csv = importAny('#separator:comma\n#columns:Front,Back\nuno,one\ndos,two\n', {});
  ok_('a comma separated file with a header block imports', csv.ok && csv.notes === 2, csv.ok ? '' : csv.error);
  const bare = importAny('gato\tcat\nperro\tdog\n', { name: 'Animals' });
  ok_('a bare two column paste imports', bare.ok && bare.notes === 2, bare.ok ? bare.deck.id : bare.error);
  const quoted = importAny('#separator:comma\n#columns:Front,Back\n"a, b",two\n', {});
  ok_('a quoted comma stays inside its cell', quoted.ok && quoted.deck.notes[0].f.Front === 'a, b',
      quoted.ok ? quoted.deck.notes[0].f.Front : quoted.error);
  const json = importAny(JSON.stringify([['uno', 'one'], ['dos', 'two']]), {});
  ok_('a JSON array of pairs imports', json.ok && json.notes === 2, json.ok ? '' : json.error);
  ok_('an empty file is refused', importAny('', {}).ok === false);
}

console.log('\nC5, the ledger schema');
{
  const base = {
    format: 'neo-ledger/1',
    exported: Date.now(),
    origin: 'https://rappel.neorgon.com',
    scheduler: defaultScheduler(),
    decks: {
      'demo-capitals': {
        deck_version_seen: '2026-09-04',
        cards: { 'n_0001:recognition': { s: 12.41, d: 4.83, due: 1, lr: 1, reps: 5, lapses: 1, st: 'review', step: 0 } },
        log: [{ c: 'n_0001:recognition', t: 1, g: 3, e: 4210, s0: 8.1, d0: 4.9, el: 7, st0: 'review' }],
      },
    },
  };
  ok_('a well formed ledger is valid', validateLedger(base).ok, JSON.stringify(validateLedger(base).errors.slice(0, 1)));

  const bad = (mutate, needle, label) => {
    const doc = JSON.parse(JSON.stringify(base));
    mutate(doc);
    const r = validateLedger(doc);
    ok_(label, !r.ok && r.errors.some((e) => `${e.path} ${e.message}`.includes(needle)),
        r.ok ? '(accepted)' : r.errors[0].path);
  };
  bad((d) => { d.scheduler.w = d.scheduler.w.slice(0, 19); }, '21 finite', 'a 19 value w in a stored ledger');
  bad((d) => { delete d.scheduler.learn_steps; }, 'learn_steps', 'a scheduler with no learn_steps');
  bad((d) => { delete d.scheduler.day_start_hour; }, 'day_start_hour', 'a scheduler with no day_start_hour');
  bad((d) => { delete d.decks['demo-capitals'].log[0].st0; }, 'st0', 'a log entry with no st0');
  bad((d) => { d.decks['demo-capitals'].log[0].g = 5; }, '.g', 'a grade of 5');
  bad((d) => { d.decks['demo-capitals'].cards['n_0001:recognition'].st = 'done'; }, '.st', 'an unknown card state');
  bad((d) => { d.decks['demo-capitals'].cards.bare = d.decks['demo-capitals'].cards['n_0001:recognition']; },
      'noteId + ":" + templateId', 'a card id with no colon');
  bad((d) => { d.decks['demo-capitals'].cards['n_0001:recognition'].d = 44; }, 'between 1 and 10', 'a difficulty of 44');
  bad((d) => { d.decks['demo-capitals'].cards = []; }, 'never an array', 'cards as an array rather than a map');
  bad((d) => { d.format = 'neo-ledger/2'; }, 'neo-ledger/1', 'a future ledger format');

  // Regression. Three producers in this project emit deck_version_seen: null
  // for a deck whose progress has never been read against a version: state.js
  // on first touch, buildLedgerDocument for a deck with orphan log entries, and
  // the sync module's pulled document, which sets it on every deck. The
  // validator rejected all three, so a pulled ledger failed on a message that
  // named none of them and the schedule silently never arrived.
  const nulled = JSON.parse(JSON.stringify(base));
  nulled.decks['demo-capitals'].deck_version_seen = null;
  ok_('deck_version_seen of null means never read against a version',
      validateLedger(nulled).ok, JSON.stringify(validateLedger(nulled).errors.slice(0, 1)));
  bad((d) => { d.decks['demo-capitals'].deck_version_seen = 7; }, 'deck_version_seen',
      'deck_version_seen of a number is still refused');

  // Regression. What ledger.pull returns is { cards, settings } with no
  // scheduler keys the server does not hold, so the document reaching
  // restoreLedger has a partial scheduler block. js/account.js merges it over
  // the local block first; without that merge this is what it would validate.
  const partial = JSON.parse(JSON.stringify(base));
  partial.scheduler = {};
  ok_('a pulled ledger with an empty scheduler block is refused',
      validateLedger(partial).ok === false);
  const remerged = { ...partial, scheduler: { ...defaultScheduler(), desired_retention: 0.85 } };
  ok_('and is valid once merged over the local scheduler', validateLedger(remerged).ok,
      JSON.stringify(validateLedger(remerged).errors.slice(0, 1)));
}

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  failed: ${f}`));
  process.exit(1);
}
