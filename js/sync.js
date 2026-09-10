/**
 * sync.js: the brokered Convex client interface for Rappel. Contract C7.1.
 *
 * Imported by the engine, never edited by it. A signature change here is a
 * three-way edit that travels through delivery-lead (C7.8).
 *
 * Three things to know before calling anything:
 *
 * 1. It is dormant by default. With no <meta name="clerk-publishable-key"> on
 *    the page, every function returns the "no account" result below and NOTHING
 *    is fetched: no Clerk, no Convex, no esm.sh, not even the Auth Kit module.
 *    Both imports are dynamic and live inside the guard, unlike
 *    memes-site/js/state.js:7, which imports the Convex client statically at
 *    module top level and pays for it on every anonymous load.
 * 2. Nothing throws. A network failure, an Auth Kit that did not load, a
 *    malformed ledger: all of them return a result, because the engine is
 *    local-first and a sync failure must never cost the learner a session.
 * 3. pull() runs before push() on sign-in, always, inside this file, so the
 *    read path is exercised on the happy path rather than never. The repo has
 *    shipped a sync script that pushed for months with nothing reading back.
 */

/** The dev deployment. Public, per C7.7: a Convex URL is not a secret. */
const CONVEX_URL = 'https://academic-bee-4.convex.cloud';

/** Pinned, matching this project's convex dependency. Fetched only when a Clerk key is present. */
const CONVEX_CLIENT = 'https://esm.sh/convex@1.43.0/browser';

/**
 * The Neorgon Auth Kit, vendored by packages/neorgon-ui/sync-auth.sh. It owns
 * the header slot, the sign-in dialog and the Convex token; this file starts it
 * and listens to it, once. Fetched only when a Clerk key is present.
 */
const AUTH_KIT = './neorgon-auth.js';

/** Function names, C7.5. Strings at runtime, so there is no build step. */
const FN = {
  whoami: 'sync:whoami',
  pull: 'ledger:pull',
  push: 'ledger:push',
  pushReviews: 'ledger:pushReviews',
  clear: 'ledger:clear',
};

/** Rows per mutation. The server refuses more than 500 in one call. */
const CHUNK = 200;

/** No account, or no Clerk key on the page. Returned by push and pushBatch. */
const NO_ACCOUNT_WRITE = { ok: false, error: 'no-account', wrote: 0 };

/** No account, or no Clerk key on the page. Returned by clearRemote. */
const NO_ACCOUNT_OK = { ok: false, error: 'no-account' };

let client = null;
let scope = { deckId: null };
let hooks = {};
let auth = { signedIn: false, subject: null };
const listeners = new Set();

/** The unsubscribe for this module's one NeoAuth.onChange listener. Set once, by initSync. */
let kitListener = null;

function warn(...args) {
  console.warn('Rappel sync:', ...args);
}

function clerkKey() {
  return document.querySelector('meta[name="clerk-publishable-key"]')?.content?.trim() || '';
}

function num(x) {
  return Number.isFinite(Number(x)) ? Number(x) : 0;
}

function chunk(rows, size) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function setAuth(signedIn, subject) {
  auth = { signedIn, subject };
  for (const fn of listeners) {
    try {
      fn({ ...auth });
    } catch (err) {
      warn('an onAuthChange listener threw', err);
    }
  }
}

/** True when the page carries a clerk-publishable-key meta. C7.2. */
export function syncAvailable() {
  return clerkKey().length > 0;
}

/**
 * Start sync. Safe to call with no account: it returns null and touches the
 * network zero times.
 *
 * @param {object} [opts]
 * @param {string} [opts.deckId] scope for pull, push and clearRemote.
 * @param {(remote: object|null) => object|null} [opts.applyRemote] merge the
 *        server ledger into local state on sign-in and return what to push back.
 * @param {() => object|null} [opts.readLocal] used when applyRemote is absent or
 *        returns nothing: the local neo-ledger/1 document to push.
 * @param {(r: {pulled: object|null, pushed: object|null}) => void} [opts.onSync]
 * @returns {Promise<{signedIn: boolean, subject: string|null}|null>} null when dormant.
 *
 * The returned state is what is known at that instant. A restored session
 * resolves a moment later, so read sign-in state from onAuthChange rather than
 * from this return value.
 *
 * A second call, for another deck, replaces the scope and the hooks and adds
 * nothing. The Convex client is made once, NeoAuth.start() is idempotent and
 * already has that client bound, and the onChange listener is registered on
 * the first call only, so no sign-in ever runs the merge twice.
 */
export async function initSync(opts = {}) {
  scope = { deckId: typeof opts.deckId === 'string' ? opts.deckId : null };
  hooks = {
    applyRemote: opts.applyRemote,
    readLocal: opts.readLocal,
    onSync: opts.onSync,
  };

  if (!clerkKey()) return null; // dormant. No import, no request, no error.

  try {
    const { ConvexHttpClient } = await import(CONVEX_CLIENT);
    client ||= new ConvexHttpClient(CONVEX_URL);
    const { NeoAuth } = await import(AUTH_KIT);
    // Checked and set with no await in between, so two calls racing through the
    // imports above still leave exactly one listener. The kit calls it with the
    // settled state, then only on a real change, never on a token refresh.
    kitListener ||= NeoAuth.onChange(({ signedIn }) => {
      void onSession(signedIn);
    });
    await NeoAuth.start({ convex: client });
    return { ...auth };
  } catch (err) {
    warn('init failed, staying local-only', err);
    client = null;
    return null;
  }
}

/**
 * Sign-in and sign-out, from the kit's one onChange listener. The subject comes
 * from the server, never from Clerk. The kit binds the Convex token before it
 * reports signed-in, so whoami runs authenticated. It does not call again on a
 * token refresh the way the old helper did, so a whoami that fails here leaves
 * sync signed out until the next real change: a reload, or signing in again.
 */
async function onSession(signedIn) {
  if (!signedIn) {
    if (auth.signedIn) setAuth(false, null);
    return;
  }
  let subject = null;
  try {
    const who = await client.query(FN.whoami, {});
    subject = who?.subject ?? null;
  } catch (err) {
    warn('whoami failed', err);
  }
  if (!subject) {
    setAuth(false, null);
    return;
  }
  if (auth.subject === subject) return;
  setAuth(true, subject);
  await mergeOnSignIn();
}

/** C7.6: read first, then write. Not the other way round, and not optional. */
async function mergeOnSignIn() {
  const pulled = await pull();
  let outgoing = null;
  try {
    if (typeof hooks.applyRemote === 'function') outgoing = await hooks.applyRemote(pulled);
    if (!outgoing && typeof hooks.readLocal === 'function') outgoing = await hooks.readLocal();
  } catch (err) {
    warn('merging the server ledger into local state failed', err);
  }
  const pushed = outgoing ? await push(outgoing) : null;
  if (typeof hooks.onSync === 'function') {
    try {
      hooks.onSync({ pulled, pushed });
    } catch (err) {
      warn('an onSync listener threw', err);
    }
  }
}

/** Shape the server rows back into a neo-ledger/1 document. */
function toLedger(res) {
  const decks = {};
  for (const row of res.cards) {
    const deck = (decks[row.deckId] ||= { deck_version_seen: null, cards: {}, log: [] });
    deck.cards[row.cardId] = {
      s: row.s,
      d: row.d,
      due: row.due,
      lr: row.lr,
      reps: row.reps,
      lapses: row.lapses,
      st: row.st,
      step: row.step,
    };
  }
  const scheduler = {};
  for (const row of res.settings) {
    try {
      scheduler[row.key] = JSON.parse(row.value);
    } catch {
      scheduler[row.key] = row.value;
    }
  }
  return {
    format: 'neo-ledger/1',
    exported: Date.now(),
    origin: location.origin,
    scheduler,
    decks,
  };
}

/**
 * The server's copy of the ledger, or null with no account.
 *
 * Two honest limits. Every `log` array is empty: C7.5 defines ledger.pull as
 * { cards, settings }, so a second device restores scheduling state and not
 * review history. And `scheduler` carries only the keys the server holds, so a
 * missing key means "keep the local default", not "reset to zero".
 */
export async function pull() {
  if (!client || !auth.signedIn) return null;
  try {
    const res = await client.query(FN.pull, scope.deckId ? { deckId: scope.deckId } : {});
    if (!res || res.ok === false) return null;
    if (res.truncated) warn('the server has more cards than one pull returns, pull per deck instead');
    return toLedger(res);
  } catch (err) {
    warn('pull failed', err);
    return null;
  }
}

/** Write a neo-ledger/1 document. Per-card last-write-wins by lr, server side. */
export async function push(ledger) {
  if (!client || !auth.signedIn) return { ...NO_ACCOUNT_WRITE };
  const decks = ledger?.decks;
  if (!decks || typeof decks !== 'object') return { ok: false, error: 'not-a-neo-ledger', wrote: 0 };

  const settings = Object.entries(ledger.scheduler || {}).map(([key, value]) => ({
    key,
    value: JSON.stringify(value),
    updatedAt: num(ledger.exported) || Date.now(),
  }));

  let wrote = 0;
  let sentSettings = false;
  try {
    for (const [deckId, deck] of Object.entries(decks)) {
      const cards = Object.entries(deck?.cards || {}).map(([cardId, c]) => ({
        cardId: String(cardId),
        s: num(c.s),
        d: num(c.d),
        due: num(c.due),
        lr: num(c.lr),
        reps: num(c.reps),
        lapses: num(c.lapses),
        st: String(c.st ?? 'new'),
        step: num(c.step),
      }));
      for (const batch of chunk(cards, CHUNK)) {
        const args = { deckId, cards: batch };
        if (!sentSettings && settings.length) {
          args.settings = settings;
          sentSettings = true;
        }
        const res = await client.mutation(FN.push, args);
        if (!res?.ok) return { ok: false, error: res?.error || 'push-failed', wrote };
        wrote += res.wrote;
      }
    }
    if (!sentSettings && settings.length) {
      // A ledger with preferences and no decks yet. deckId is ignored for
      // settings rows, which are keyed by (subject, key) alone.
      const res = await client.mutation(FN.push, {
        deckId: scope.deckId || '',
        cards: [],
        settings,
      });
      if (!res?.ok) return { ok: false, error: res?.error || 'push-failed', wrote };
      wrote += res.wrote;
    }
    return { ok: true, wrote };
  } catch (err) {
    warn('push failed', err);
    return { ok: false, error: 'push-threw', wrote };
  }
}

/**
 * Append review log entries. Idempotent: the server keys them by
 * (deckId, cardId, t), so re-sending a batch writes nothing.
 *
 * Accepts the IndexedDB record shape from C8.4, a neo-ledger/1 log entry plus
 * `deck`. An entry with no deck falls back to the deckId passed to initSync.
 */
export async function pushBatch(entries) {
  if (!client || !auth.signedIn) return { ...NO_ACCOUNT_WRITE };
  const byDeck = new Map();
  for (const row of entries || []) {
    const deckId = row?.deck || row?.deckId || scope.deckId;
    const cardId = row?.c || row?.cardId;
    if (!deckId || !cardId) continue;
    if (!byDeck.has(deckId)) byDeck.set(deckId, []);
    byDeck.get(deckId).push({
      cardId: String(cardId),
      t: num(row.t),
      g: num(row.g),
      e: num(row.e),
      s0: num(row.s0),
      d0: num(row.d0),
      el: num(row.el),
      st0: String(row.st0 ?? 'new'),
    });
  }

  let wrote = 0;
  try {
    for (const [deckId, rows] of byDeck) {
      for (const batch of chunk(rows, CHUNK)) {
        const res = await client.mutation(FN.pushReviews, { deckId, reviews: batch });
        if (!res?.ok) return { ok: false, error: res?.error || 'push-failed', wrote };
        wrote += res.wrote;
      }
    }
    return { ok: true, wrote };
  } catch (err) {
    warn('pushBatch failed', err);
    return { ok: false, error: 'push-threw', wrote };
  }
}

/** Delete every server row for the scoped deck, or for every deck when unscoped. */
export async function clearRemote() {
  if (!client || !auth.signedIn) return { ...NO_ACCOUNT_OK };
  let deleted = 0;
  try {
    for (let pass = 0; pass < 20; pass++) {
      const res = await client.mutation(FN.clear, scope.deckId ? { deckId: scope.deckId } : {});
      if (!res?.ok) return { ok: false, error: res?.error || 'clear-failed', deleted };
      deleted += res.deleted;
      if (!res.remaining) return { ok: true, deleted };
    }
    return { ok: false, error: 'clear-incomplete', deleted };
  } catch (err) {
    warn('clearRemote failed', err);
    return { ok: false, error: 'clear-threw', deleted };
  }
}

/**
 * Subscribe to sign-in and sign-out. Called immediately with the current state,
 * so a caller never has to ask separately.
 * @param {(s: {signedIn: boolean, subject: string|null}) => void} fn
 * @returns {() => void} unsubscribe
 */
export function onAuthChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  try {
    fn({ ...auth });
  } catch (err) {
    warn('an onAuthChange listener threw', err);
  }
  return () => listeners.delete(fn);
}
