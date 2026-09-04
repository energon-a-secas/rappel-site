// The romaji reader, C12 A16 and A17, run under plain node against the vendored
// wanakana. Both halves are covered: live (what the box shows per keystroke)
// and settle (what is graded at submit). The words are the ones the amendment
// measured in a real browser, so a regression here is the defect coming back.

import { ensureTransforms, applyTransform, bindInput, answersMatch } from '../js/transforms.js';

let passed = 0;
let failed = 0;
function eq(actual, expected, label) {
  if (actual === expected) { passed++; return; }
  failed++;
  console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
}

/** The parts of an <input> the binding touches, and a way to type into it. */
function fakeInput() {
  const listeners = [];
  return {
    value: '',
    dataset: {},
    addEventListener(type, fn) { if (type === 'input') listeners.push(fn); },
    setSelectionRange() {},
    type(text) {
      for (const ch of text) {
        this.value += ch;
        for (const fn of listeners) fn();
      }
    },
  };
}

await ensureTransforms();

// Settle: the submitted answer.
const settle = [
  ['shinbun', 'しんぶん'],
  ['shinbunn', 'しんぶん'],
  ['onna', 'おんな'],
  ['konnichiha', 'こんにちは'],
  ['kyonen', 'きょねん'],
  ['kannkei', 'かんけい'],
  ['sensei', 'せんせい'],
  ['おんな', 'おんな'],
];
for (const [typed, want] of settle) eq(applyTransform('kana', typed), want, `settle ${typed}`);
eq(applyTransform('kana-katakana', 'robotto'), 'ロボット', 'settle katakana robotto');
eq(applyTransform('nope', 'abc'), 'abc', 'an unknown transform passes text through');
eq(applyTransform('kana', ''), '', 'empty stays empty');

// Live: what the box shows after each keystroke.
const box = fakeInput();
eq(bindInput(box, 'kana'), true, 'bindInput binds');
const trace = [];
for (const ch of 'onna') { box.type(ch); trace.push(box.value); }
eq(trace.join(' '), 'お おn おnn おんな', 'live onna keeps the n run revisable');

const box2 = fakeInput();
bindInput(box2, 'kana');
box2.type('shinbun');
eq(box2.value, 'しんぶn', 'live shinbun holds the trailing n');
eq(applyTransform('kana', box2.value), 'しんぶん', 'settle finishes what live held');

const box3 = fakeInput();
bindInput(box3, 'kana');
box3.type('konnichiha');
eq(box3.value, 'こんにちは', 'live konnichiha');

const box4 = fakeInput();
bindInput(box4, 'kana');
box4.type('nihongo');
eq(box4.value, 'にほんご', 'live nihongo');
eq(bindInput(box4, 'kana'), true, 'binding twice is a no-op');

const box5 = fakeInput();
bindInput(box5, 'kana-katakana');
box5.type('gandamu');
eq(box5.value, 'ガンダム', 'live katakana gandamu');

eq(bindInput(fakeInput(), 'nope'), false, 'an unknown transform does not bind');

// Grading, the way session.js does it.
eq(answersMatch(applyTransform('kana', 'onna'), 'おんな', 'trim|casefold|kana'), true, 'onna matches おんな');
eq(answersMatch(applyTransform('kana', 'onna'), 'オンナ', 'trim|casefold|kana'), true, 'kana compare folds katakana');
eq(answersMatch(applyTransform('kana', 'onna'), '女', 'trim|casefold|kana'), false, 'kanji is not kana');

console.log(`test-transforms: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
