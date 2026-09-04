// Entry point. It wires and nothing else: every decision is in js/boot.js.
// Kept under 50 lines on purpose (PLAN constraint 2).

import { boot } from './boot.js';

boot().catch((err) => {
  console.error('Rappel failed to start', err);
  const root = document.getElementById('viewRoot');
  if (root) {
    root.innerHTML = '<div class="card"><h3>Rappel could not start</h3>'
      + '<p>Reload the page. If it keeps failing, something is blocking this site\'s scripts, '
      + 'and the browser console names it. Nothing was written to storage.</p></div>';
  }
});
