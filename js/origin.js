/**
 * The embed origin allowlist. Contract C6.4.
 *
 * Pure functions, no DOM, no globals. That is deliberate: nothing in root
 * `make smoke` checks this rule and QA cannot easily exercise the negative case
 * in a browser, so the only thing standing between an unlisted origin and a
 * write to rappel.neorgon.com is tools/test-origin.mjs.
 *
 * The invariant, stated once: an unlisted origin can never cause a write to
 * rappel.neorgon.com's persistent storage.
 *
 * The classic bug this file exists to avoid is suffix matching. "neorgon.com"
 * is a suffix of "evil-neorgon.com", so the check is on the LABEL boundary:
 * either the host is exactly neorgon.com, or it ends with ".neorgon.com".
 */

const APEX = 'neorgon.com';
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/** Parse an origin string into a URL, or null. Never throws. */
function parseOrigin(value) {
  if (typeof value !== 'string' || !value || value === 'null') return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  // An origin carries no path, query or fragment. Anything longer is not one.
  if (url.pathname !== '/' || url.search || url.hash) return null;
  if (url.username || url.password) return null;
  return url;
}

/** true when the host is neorgon.com itself or a subdomain of it. */
export function isNeorgonHost(hostname) {
  return hostname === APEX || hostname.endsWith(`.${APEX}`);
}

/** true when this is a local development origin over plain http. */
export function isLocalOrigin(value) {
  const url = parseOrigin(value);
  if (!url) return false;
  return url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname);
}

/**
 * The allowlist. C6.4.
 *
 * @param {string} origin      the event.origin of an inbound message
 * @param {string} selfOrigin  the engine's own location.origin
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, selfOrigin) {
  const url = parseOrigin(origin);
  if (!url) return false;

  if (url.protocol === 'https:' && isNeorgonHost(url.hostname)) return true;

  // The localhost clause exists so QA can exercise the real cross-origin path
  // at http://localhost:8878 embedding http://localhost:8879. It is gated on
  // the ENGINE itself being local, so it is dead code in production.
  if (isLocalOrigin(selfOrigin) && isLocalOrigin(origin)) return true;

  return false;
}

/**
 * Whether ?src= may be fetched. C6.1 says an https:// URL.
 *
 * The localhost half mirrors isAllowedOrigin's clause and for the same reason:
 * without it, the cross-origin embed cannot be exercised at all before the two
 * sites are published, which is the one test PLAN says must not be simulated.
 * Gated on the engine being local, so it is dead code in production.
 *
 * @param {string} src         the raw ?src= value
 * @param {string} selfOrigin  the engine's own location.origin
 */
export function isAllowedDeckSrc(src, selfOrigin) {
  if (typeof src !== 'string' || !src) return false;
  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return isLocalOrigin(selfOrigin) && isLocalOrigin(url.origin);
}

/**
 * The deck id a document gets once stored. C4.4.
 *
 * A deck fetched from an origin other than the engine's own, and not from
 * *.neorgon.com, is namespaced so a third-party document claiming
 * "id": "jp-kana-hiragana" cannot merge into the visitor's real progress.
 * Proctor can accept any https URL safely because it stores nothing; the
 * moment a fetched document influences persistent card rows, it cannot.
 *
 * @param {string} deckId    the deck document's own id
 * @param {string|null} src  where it came from, or null for built-in and local
 * @param {string} hash      first 12 hex of SHA-256 of src, from sha256Hex()
 */
export function namespacedDeckId(deckId, src, hash) {
  if (!src) return deckId;
  let url;
  try {
    url = new URL(src);
  } catch {
    return deckId;
  }
  if (isNeorgonHost(url.hostname)) return deckId;
  if (isLocalOrigin(url.origin)) return deckId;
  return `ext:${hash}:${deckId}`;
}

/** First 12 hex characters of the SHA-256 of a string. */
export async function sha256Hex(text, len = 12) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len);
}
