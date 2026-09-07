/**
 * The settings screen: the scheduler's five knobs and the language switch.
 *
 * It moved out of js/render.js at the 500 line cap. What changed on the way
 * out: the two controls with a paragraph of explanation under them now point
 * at it with aria-describedby, so the explanation is read with the field
 * rather than only by whoever happens to look below it, and the five fields
 * are two fieldsets, because a legend is the only grouping a screen reader
 * repeats as it moves from one field to the next.
 */

import { state } from './state.js';
import { escHtml, t, fill, UI } from './utils.js';

/** The screen's own copy in the visitor's language. */
function L(key, ...args) {
  return fill(t(UI[key], state.lang), ...args);
}

/** A labelled control. */
function field(key, input, block = '') {
  return `<label class="rp-field${block}"><span>${escHtml(L(key))}</span>${input}</label>`;
}
function note(id, key) {
  return `<p class="rp-note" id="${id}">${escHtml(L(key))}</p>`;
}
function group(legendKey, body) {
  return `<fieldset class="rp-group"><legend class="rp-group__legend">${escHtml(L(legendKey))}</legend>${body}</fieldset>`;
}

export function renderSettings() {
  const s = state.scheduler;
  const lang = (code, label) => `<button type="button" class="btn ${state.lang === code ? 'btn--secondary' : 'btn--ghost'}" data-act="lang" data-lang="${code}" aria-pressed="${state.lang === code}"${code === 'es' ? ' lang="es"' : ''}>${label}</button>`;

  const model = group('setGroupModel', [
    field('desiredRetention', `<input type="range" id="setRetention" min="0.70" max="0.97" step="0.01" value="${s.desired_retention}" aria-describedby="setRetentionNote">
      <output id="setRetentionOut">${(s.desired_retention * 100).toFixed(0)}%</output>`),
    note('setRetentionNote', 'retentionNote'),
    field('params', `<textarea id="setParams" rows="3" spellcheck="false" aria-describedby="setParamsNote">${escHtml(s.w.join(', '))}</textarea>`, ' rp-field--block'),
    note('setParamsNote', 'paramsNote'),
  ].join(''));

  const day = group('setGroupDay', [
    field('learnSteps', `<input type="text" id="setLearn" value="${escHtml(s.learn_steps.join(', '))}" inputmode="numeric">`),
    field('relearnSteps', `<input type="text" id="setRelearn" value="${escHtml(s.relearn_steps.join(', '))}" inputmode="numeric">`),
    field('dayStart', `<input type="number" id="setHour" min="0" max="23" value="${s.day_start_hour}">`),
  ].join(''));

  return `<section class="section" aria-labelledby="setTitle">
    <div class="section__titles"><h2 class="section__title" id="setTitle" tabindex="-1">${escHtml(L('settings'))}</h2>
      <p class="section__lead">${escHtml(L('settingsLead'))}</p></div>
    <div class="rp-panel stack stack--tight">
      <h3 class="rp-panel__title">${escHtml(L('schedulingTitle'))}</h3>
      ${model}
      ${day}
      <div class="toolbar"><button type="button" class="btn btn--primary" data-act="save-settings">${escHtml(L('save'))}</button>
        <button type="button" class="btn btn--ghost btn--sm" data-act="reset-settings">${escHtml(L('backToDefaults'))}</button></div>
    </div>

    <div class="rp-panel stack stack--tight">
      <h3 class="rp-panel__title">${escHtml(L('language'))}</h3>
      <div class="toolbar">${lang('en', 'English')}${lang('es', 'Español')}</div>
      <p class="rp-note">${escHtml(L('languageNote'))}</p>
    </div>
  </section>`;
}
