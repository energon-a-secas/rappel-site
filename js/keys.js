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
 * Space reaches the kit only on a face-down card. WCAG 2.1.1 and 2.1.4.
 *
 * The kit's single listener calls preventDefault() and only then runs the
 * entry, so a Space it receives is cancelled before the browser can act on it:
 * a focused control would not activate, and on the library, browse, stats and
 * settings the page would not scroll. Declining inside run() is too late, the
 * default is already gone.
 *
 * This runs before init() installs the kit's listener. Unless the session
 * shows a face-down card with focus off any control, it stops the event
 * reaching the kit, so native activation and page scrolling stand.
 */
function yieldSpace() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || !(e.target instanceof Element)) return;
    const faceDown = state.view === 'session' && !!state.session && !state.session.flipped;
    if (!faceDown || e.target.closest('button, a[href], [role="radio"], [role="menuitem"]')) e.stopImmediatePropagation();
  });
}

export function initKeys() {
  yieldSpace();
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
      // yieldSpace() above stops the event before it arrives here.
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
