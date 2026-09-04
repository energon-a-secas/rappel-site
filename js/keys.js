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

export function initKeys() {
  const keys = init({ chromeToggle: state.embed ? false : undefined });
  const group = L('stateReview');
  keys.register([
    {
      key: ' ',
      id: 'rappel:flip',
      label: L('showAnswer'),
      hint: L('keyFlipHint'),
      group,
      run: () => {
        // On a focused button or link, Space is that control's own activation.
        const t = document.activeElement;
        if (t && (t.tagName === 'BUTTON' || t.tagName === 'A')) return;
        keyAction('flip');
      },
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
