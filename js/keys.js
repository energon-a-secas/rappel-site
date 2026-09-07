/**
 * Keyboard shortcuts, through the NeoKeys kit rather than a private listener.
 *
 * The kit brings the ? sheet, one document listener, the typing guard (which
 * covers IME composition, shadow roots and contentEditable) and the WCAG 2.1.4
 * remap panel. A private keydown handler here would have to reimplement all of
 * it, and would bind single letters with no way to turn them off.
 *
 * ? h and g are kit-reserved and register() refuses them, so this site binds
 * neither. The chrome toggle is on in standalone (a dense tool surface) and off
 * inside an iframe, where there is no chrome to hide.
 */

import { init } from './neokeys/index.js';
import { keyAction } from './events.js';
import { state } from './state.js';
import { t, UI } from './utils.js';

/** The sheet's copy, in the language the page booted in. */
function L(key) {
  return t(UI[key], state.lang);
}

function grades() {
  return [
    ['1', L('gradeAgain'), L('gradeAgainGloss')],
    ['2', L('gradeHard'), `${L('gradeHardGloss')}. ${L('keyHardPass')}`],
    ['3', L('gradeGood'), L('gradeGoodGloss')],
    ['4', L('gradeEasy'), L('gradeEasyGloss')],
  ];
}

/**
 * Give Space back to whatever holds the keyboard. WCAG 2.1.1.
 *
 * The kit's single listener calls preventDefault() and only then runs the
 * entry, so a Space on a focused control was cancelled before the browser
 * could activate it: Study, the row menu, Show answer and the armed grade all
 * did nothing, while the hint under the grades promised Enter and Space both.
 * Declining inside run() is too late, the default is already gone.
 *
 * This runs before init() installs the kit's listener, so on a control it
 * stops the event reaching the kit and native activation stands. Everywhere
 * else Space falls through and still flips the card.
 */
function yieldSpaceToControls() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || !(e.target instanceof Element)) return;
    if (e.target.closest('button, a[href], [role="radio"], [role="menuitem"]')) e.stopImmediatePropagation();
  });
}

export function initKeys() {
  yieldSpaceToControls();
  const keys = init({ chromeToggle: state.embed ? false : undefined });
  const group = L('stateReview');
  keys.register([
    {
      key: ' ',
      id: 'rappel:flip',
      label: L('showAnswer'),
      hint: L('keyFlipHint'),
      group,
      // On a focused control Space is that control's own activation, and
      // yieldSpaceToControls() above stops the event before it arrives here.
      run: () => keyAction('flip'),
    },
    ...grades().map(([key, label, hint]) => ({
      key,
      id: `rappel:grade-${key}`,
      label,
      hint,
      group,
      run: () => {
        // Face down with choices on screen, the digit picks the option that
        // prints it as a keycap; face up, it grades.
        if (state.session && !state.session.flipped) {
          const opt = document.querySelectorAll('.rp-choice')[Number(key) - 1];
          if (opt) { opt.click(); return; }
        }
        keyAction(key);
      },
    })),
  ]);
  return keys;
}
