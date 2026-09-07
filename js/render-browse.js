/**
 * The browse screen: every card in one deck, with the scheduler row behind it.
 *
 * It moved out of js/render.js because that file was at the 500 line cap and
 * this screen had to grow: a lead that says what the table is, a header that
 * stays put while the rows scroll, and two column labels that were bare
 * letters. Nothing here is shared with the other screens, so it is a file of
 * its own rather than a section of a longer one.
 */

import { state } from './state.js';
import { expandCards, deckName } from './deck.js';
import { escHtml, shortDate, t, fill, UI } from './utils.js';

const STATE_LABEL = { new: UI.stateNew, learning: UI.stateLearning, review: UI.stateReview, relearning: UI.stateRelearning };
/**
 * Past this many rows the table gets its own scroll box, which is the only
 * way `position: sticky` on a `th` does anything: sticky resolves against the
 * nearest scrolling ancestor, and a wrapper with no height limit never
 * scrolls, so the header travelled off the top of a 900 card deck exactly as
 * if it had not been declared sticky at all.
 */
const TALL_DECK_ROWS = 24;

/** The screen's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

/**
 * A column whose label is one letter. The letter stays, because six words of
 * header across eight columns is what pushed the numbers off a phone screen,
 * and the expansion rides on the `abbr` where a pointer, a focus ring and a
 * screen reader can all reach it.
 */
function abbrHead(letter, key) {
  return `<th scope="col" class="rp-num-head"><abbr title="${escHtml(L(key))}">${letter}</abbr></th>`;
}

function cardRow(deck, card) {
  const row = state.ledger.decks[deck.id]?.cards?.[card.id];
  const st = row ? t(STATE_LABEL[row.st], state.lang) || row.st : L('stateNew');
  const front = card.template.kind === 'cloze' ? card.note.f?.[card.template.text_field] : card.note.f?.[deck.fields[0]];
  const num = (v) => `<td class="rp-num">${v}</td>`;
  return `<tr><td class="rp-cell-front">${escHtml(String(front || '').slice(0, 80))}</td><td>${escHtml(card.templateId)}</td>`
    + `<td>${escHtml(st)}</td><td>${escHtml(row && row.s !== 0 ? shortDate(row.due, state.lang) : L('now'))}</td>`
    + `${num(row ? row.reps : 0)}${num(row ? row.lapses : 0)}${num(row && row.s ? row.s.toFixed(1) : '')}${num(row && row.d ? row.d.toFixed(1) : '')}</tr>`;
}

/**
 * The whole screen as an HTML string. `renderLibrary` is the fallback for a
 * deck id that no longer resolves, which is why it arrives as an argument
 * rather than being imported: js/render.js owns it, and importing it back
 * from here would be a cycle.
 */
export function renderBrowse(fallback) {
  const deck = state.decks[state.activeDeckId];
  if (!deck) return fallback();
  const safe = escHtml(deck.id);
  const cards = expandCards(deck);
  const rows = cards.map((card) => cardRow(deck, card)).join('');
  const head = ['thFront', 'thTemplate', 'thState', 'thDue']
    .map((k) => `<th scope="col">${escHtml(L(k))}</th>`).join('')
    + ['thReps', 'thLapses'].map((k) => `<th scope="col" class="rp-num-head">${escHtml(L(k))}</th>`).join('');
  const tall = cards.length > TALL_DECK_ROWS ? ' rp-table-wrap--tall' : '';
  const name = deckName(deck, state.lang);

  return `<section class="section" aria-labelledby="browseTitle">
    <div class="section__header">
      <div class="section__titles">
        <h2 class="section__title" id="browseTitle" tabindex="-1">${escHtml(name)}</h2>
        <p class="section__lead">${escHtml(L('browseLead'))}</p>
        <p class="rp-version">${escHtml(L('browseCount', cards.length, (deck.notes || []).length))} <span class="rp-version__dot" aria-hidden="true">·</span> ${escHtml(L('deckVersion', deck.version))}</p>
      </div>
      <div class="toolbar"><button type="button" class="btn btn--primary" data-act="review" data-deck="${safe}">${escHtml(L('study'))}</button>
        <button type="button" class="btn btn--ghost" data-act="library">${escHtml(L('backToDecks'))}</button></div>
    </div>
    <div class="rp-table-wrap${tall}" role="region" aria-label="${escHtml(L('tableRegion', name))}" tabindex="0">
      <table class="rp-table">
        <caption class="rp-visually-hidden">${escHtml(L('tableCaption'))}</caption>
        <thead><tr>${head}${abbrHead('S', 'thStability')}${abbrHead('D', 'thDifficulty')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}
