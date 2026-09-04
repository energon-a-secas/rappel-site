/**
 * The account path: it wires js/sync.js into local state and does nothing else.
 *
 * js/sync.js belongs to the backend workstream and this file never edits it
 * (C7.1). It only supplies the two things that file cannot reach: how a server
 * ledger merges into local state, and what to send back.
 *
 * Every call here is safe with no account. CONTRACTS C12 A5 pins the values, so
 * they are what this file codes against rather than something it probes for:
 *
 *   syncAvailable()  false
 *   initSync()       null
 *   pull()           null
 *   push/pushBatch   { ok: false, error: 'no-account', wrote: 0 }
 *   clearRemote()    { ok: false, error: 'no-account' }
 *   onAuthChange(fn) fires fn immediately with { signedIn: false, subject: null }
 *                    and returns an unsubscribe function
 *
 * With no <meta name="clerk-publishable-key"> on the page that path fetches
 * nothing: no Clerk, no Convex, no esm.sh. There is no eager import here for
 * the same reason, so the dormancy the backend verified on a real network tab
 * stays true from this side too.
 */

import { initSync, onAuthChange, syncAvailable, pushBatch } from './sync.js';
import { state, savePrefs, saveLedger } from './state.js';
import { buildLedgerDocument, restoreLedger } from './ledger.js';
import { showToast } from './utils.js';

/**
 * What the page last heard about sign-in. Read by render.js; written only here.
 * `available` answers "could there be an account", `signedIn` answers "is there
 * one", and they are different questions on a page that ships the sync module
 * but no key.
 */
export const account = { available: false, signedIn: false, subject: null };

let onChange = null;

/**
 * Review rows waiting to go to the server, C7.5. One graded card is one row;
 * they are flushed together two seconds after the first, so a fast session
 * makes a handful of mutations rather than one per answer.
 */
const pending = [];
let flushTimer = null;

function queueReview(e) {
  if (!account.signedIn) return;
  pending.push(e.detail);
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const batch = pending.splice(0, pending.length);
    const res = await pushBatch(batch);
    if (!res.ok && res.error !== 'no-account') console.warn('Rappel sync: review push failed:', res.error);
  }, 2000);
}

/**
 * Merge the server's ledger into local state and return what to send back.
 *
 * Two things about the incoming document, both from its own contract:
 *
 * 1. Every `log` array is empty. `ledger.pull` returns { cards, settings } and
 *    no review history (C12 A4), so this restores the schedule and leaves the
 *    stats screen with nothing behind it. That is rendered honestly in
 *    js/stats.js rather than papered over here.
 * 2. `scheduler` carries only the keys the server holds, so it is merged OVER
 *    the local block rather than replacing it. A key the server does not have
 *    means "keep the local value", not "reset to zero", and a partial block
 *    would fail validation on its own.
 */
async function applyRemote(remote) {
  if (!remote) return buildLedgerDocument();

  const merged = { ...remote, scheduler: { ...state.scheduler, ...remote.scheduler } };
  const res = await restoreLedger(merged, 'merge');
  if (!res.ok) {
    // Loud on purpose. A server ledger this build refuses must not be
    // indistinguishable from an empty one, and returning null hands the push
    // back to readLocal rather than writing over what is up there.
    console.error('Rappel sync: the server ledger was refused:', res.error);
    showToast(`Sync sent a ledger this build will not accept: ${res.error}`);
    return null;
  }

  state.scheduler = merged.scheduler;
  savePrefs();
  saveLedger();
  if (res.cards > 0) showToast(`Sync restored ${res.cards} card${res.cards === 1 ? '' : 's'}`);
  return buildLedgerDocument();
}

/**
 * Start the account path. Dormant unless the page carries a Clerk key.
 *
 * @param {{ deckId?: string }} [opts]
 *
 * `pull()` and `push()` take no scope of their own: scope is fixed once, here,
 * through initSync (C12 A2), and for Rappel `deckId` is optional. It is left
 * unset in standalone mode on purpose, because the library holds many decks and
 * one pull should bring all of them back. An embed passes the one deck it hosts.
 *
 * The document handed to `push` carries `scheduler`, which the sync module maps
 * onto `ledger.push`'s optional `settings` array (C12 A3). That is the whole of
 * how rappel:prefs:v1 reaches the server: there is no second call, and nothing
 * here needs to know the array exists beyond passing a complete document.
 */
export async function initAccount(opts = {}) {
  account.available = syncAvailable();

  // The header's account button exists in the markup but is hidden until a key
  // is on the page, so a visitor with no account never meets a dead control.
  const toggle = document.getElementById('authToggle');
  if (toggle) toggle.hidden = !account.available;
  const panel = document.getElementById('authPanel');
  if (panel) panel.hidden = !account.available;

  document.addEventListener('rappel-review', queueReview);

  onChange = onAuthChange((s) => {
    account.signedIn = s.signedIn;
    account.subject = s.subject;
    if (toggle) toggle.classList.toggle('logged-in', !!s.signedIn);
    document.dispatchEvent(new CustomEvent('rappel-auth', { detail: { ...s } }));
  });

  await initSync({
    deckId: typeof opts.deckId === 'string' ? opts.deckId : undefined,
    signInHost: '#neorgon-signin-mount',
    userButtonHost: '#neorgon-user-mount',
    applyRemote,
    readLocal: () => buildLedgerDocument(),
    onSync: ({ pulled, pushed }) => {
      if (!pulled && !pushed) return;
      console.info('Rappel sync:', pulled ? 'read the server ledger' : 'found nothing on the server',
        pushed?.ok ? `and wrote ${pushed.wrote} row${pushed.wrote === 1 ? '' : 's'}` : 'and wrote nothing');
    },
  });
}

/** Drop the auth listener. Used by tests; the page itself never stops. */
export function stopAccount() {
  if (onChange) onChange();
  onChange = null;
  document.removeEventListener('rappel-review', queueReview);
}
