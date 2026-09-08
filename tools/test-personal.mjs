#!/usr/bin/env node
/**
 * The personal deck namespace and its version order. Contract C12 A19.
 *
 *   node tools/test-personal.mjs    # from inside projects/rappel-site
 *   make validate
 *
 * Three rules live here and all three are load bearing:
 *
 *   1. `personal:` is RESERVED. A deck that arrives any other way than a
 *      rappel:load from an allowed origin may not carry it, because the
 *      library shows a personal deck as something a named site sent, and a
 *      ?src= document that could claim the namespace would be claiming that.
 *   2. A personal version may be YYYY-MM-DD.N. A19 rule 5 decides whether a
 *      re-sent deck replaces what is stored, keeps every surviving card's
 *      scheduling, or is ignored, and it decides it by comparing versions. Get
 *      the order wrong and a host that rebuilds twice in one day either
 *      restarts the learner's scheduling or is silently ignored.
 *   3. A19 rule 3 both ways round: a deck this frame may not write can neither
 *      save nor CLEAR the saved session. The clear is the one that bit. It is
 *      a write like any other, and what it deletes is the session of whatever
 *      deck was saved last, which is never the ephemeral one.
 *
 * The rest of the half that needs a browser (the storage decision, the sweep,
 * the ready reply) is exercised cross-origin by the host page under tools/,
 * because it needs two real origins. The session store is here instead: the
 * defect is one branch of js/state.js and a Map is a faithful enough
 * localStorage to pin it.
 */

import { validateDeck, isPersonalDeckId, compareDeckVersions } from '../js/validate-deck.js';

let pass = 0;
const fails = [];

function check(label, got, want) {
  if (got === want) { pass += 1; console.log(`  ok   ${label}  -> ${got}`); }
  else { fails.push(label); console.log(`  FAIL ${label}  -> ${got}, want ${want}`); }
}

/** A minimal valid neo-deck/1, with whatever the case under test overrides. */
function deck(over = {}) {
  return {
    format: 'neo-deck/1',
    id: 'personal:runcible:japanese',
    version: '2026-09-08',
    name: { en: 'Your misses', es: 'Tus fallos' },
    lang: { front: 'ja', back: 'en' },
    licence: 'MIT',
    screen: 'none',
    fields: ['Front', 'Back'],
    templates: [{ id: 'recognition', kind: 'basic', skill: 'jp.word.read', front: '{{Front}}', back: '{{Back}}' }],
    notes: [{ id: 'n1', f: { Front: '水', Back: 'water' } }],
    ...over,
  };
}
const ok = (doc, opts) => validateDeck(doc, { name: 'd', ...opts }).ok;
const firstError = (doc, opts) => validateDeck(doc, { name: 'd', ...opts }).errors[0]?.path || '';

console.log('\nThe namespace is recognised');
check('personal:runcible:japanese', isPersonalDeckId('personal:runcible:japanese'), true);
check('personal:x, one segment', isPersonalDeckId('personal:x'), true);
check('personal:a:b:c:d, deeper', isPersonalDeckId('personal:a:b:c:d'), true);
check('the ext: form of one', isPersonalDeckId('ext:abc123def456:personal:runcible:japanese'), true);
check('a plain deck id', isPersonalDeckId('jp-kana-hiragana'), false);
check('personal with no segment', isPersonalDeckId('personal:'), false);
check('bare personal', isPersonalDeckId('personal'), false);
check('an empty segment', isPersonalDeckId('personal::japanese'), false);
check('a segment starting with a dash', isPersonalDeckId('personal:-bad'), false);
check('a deck merely named personally', isPersonalDeckId('personalish'), false);
check('the prefix in the middle', isPersonalDeckId('jp:personal:x'), false);
check('not a string', isPersonalDeckId(null), false);

console.log('\nThe namespace is reserved (A19, C4 widened for personal: only)');
check('personal id through the rappel:load door', ok(deck(), { personal: true }), true);
check('personal id from anywhere else', ok(deck()), false);
check('and the refusal names the id', firstError(deck()), 'd.id');
check('a plain id needs no permission', ok(deck({ id: 'jp-kana-hiragana' })), true);
check('a plain id is unaffected by the flag', ok(deck({ id: 'jp-kana-hiragana' }), { personal: true }), true);
check('the ext: form of a personal id, allowed', ok(deck({ id: 'ext:abc123def456:personal:x' }), { personal: true }), true);
check('the ext: form of a personal id, elsewhere', ok(deck({ id: 'ext:abc123def456:personal:x' })), false);
check('a malformed personal id is refused either way', ok(deck({ id: 'personal:' }), { personal: true }), false);

console.log('\nThe finer version form');
check('a plain date on a personal deck', ok(deck({ version: '2026-09-08' }), { personal: true }), true);
check('YYYY-MM-DD.1', ok(deck({ version: '2026-09-08.1' }), { personal: true }), true);
check('YYYY-MM-DD.0', ok(deck({ version: '2026-09-08.0' }), { personal: true }), true);
check('YYYY-MM-DD.12', ok(deck({ version: '2026-09-08.12' }), { personal: true }), true);
check('a leading zero in N', ok(deck({ version: '2026-09-08.01' }), { personal: true }), false);
check('a fractional N', ok(deck({ version: '2026-09-08.1.2' }), { personal: true }), false);
check('an empty N', ok(deck({ version: '2026-09-08.' }), { personal: true }), false);
check('.N on a plain deck is refused', ok(deck({ id: 'jp-kana', version: '2026-09-08.1' })), false);
check('and the refusal names the version', firstError(deck({ id: 'jp-kana', version: '2026-09-08.1' })), 'd.version');

console.log('\nVersion order, A19 rule 5');
check('a later date is newer', compareDeckVersions('2026-09-09', '2026-09-08'), 1);
check('an earlier date is older', compareDeckVersions('2026-09-07', '2026-09-08'), -1);
check('the same date is the same', compareDeckVersions('2026-09-08', '2026-09-08'), 0);
check('.1 beats no suffix', compareDeckVersions('2026-09-08.1', '2026-09-08'), 1);
check('no suffix loses to .1', compareDeckVersions('2026-09-08', '2026-09-08.1'), -1);
check('.0 equals no suffix', compareDeckVersions('2026-09-08.0', '2026-09-08'), 0);
check('.2 beats .1', compareDeckVersions('2026-09-08.2', '2026-09-08.1'), 1);
check('.10 beats .9, as a number not a string', compareDeckVersions('2026-09-08.10', '2026-09-08.9'), 1);
check('a later date beats a higher N', compareDeckVersions('2026-09-09', '2026-09-08.99'), 1);
check('the year is compared before the day', compareDeckVersions('2027-01-01', '2026-12-31'), 1);
check('an unreadable side is null, not older', compareDeckVersions('yesterday', '2026-09-08'), null);
check('an unreadable stored version is null', compareDeckVersions('2026-09-08', undefined), null);

console.log('\nA19 rule 3: an ephemeral deck may not write the saved session, and a clear is a write');
// js/state.js reads a bare `localStorage`, so a global stands in for the
// browser's. Nothing here calls loadAll(), so this is the whole surface.
const cells = new Map();
globalThis.localStorage = {
  getItem: (k) => (cells.has(k) ? cells.get(k) : null),
  setItem: (k, v) => { cells.set(k, String(v)); },
  removeItem: (k) => { cells.delete(k); },
};
const { state, markDeckEphemeral, saveSession, clearSession, loadSession, SESSION_KEY } =
  await import('../js/state.js');

const LEARNER = 'personal:runcible:japanese';
const FOREIGN = 'ext:8fcdd0348104:personal:evil:misses';
const learnerSession = () => ({ id: 's_learner', deckId: LEARNER, queue: [] });

state.ledgerMode = 'engine';
state.session = learnerSession();
saveSession();
check('a session on a deck this frame keeps is saved', loadSession()?.id, 's_learner');

markDeckEphemeral(FOREIGN);
state.session = { id: 's_foreign', deckId: FOREIGN, queue: [] };
check('saving a session on an ephemeral deck writes nothing', saveSession(), false);
check('and the learner\'s saved session is still there', loadSession()?.id, 's_learner');
check('the key itself was not touched', typeof cells.get(SESSION_KEY), 'string');

clearSession();
check('ending an ephemeral session does not clear the key', loadSession()?.id, 's_learner');
check('and it did end in memory', state.session, null);

state.session = learnerSession();
clearSession();
check('a session this frame owns still clears normally', loadSession(), null);

console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) {
  fails.forEach((f) => console.log(`  failed: ${f}`));
  process.exit(1);
}
