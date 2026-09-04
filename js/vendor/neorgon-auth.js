/**
 * Neorgon shared browser auth: Clerk session + ConvexHttpClient JWT (template "convex").
 * Lives in the neorgon-auth-client repo; sites load this module from their deployed URL
 * or from the local CORS dev server (make serve).
 *
 * Sites that set a Content-Security-Policy meta/header must allow Clerk + Turnstile, e.g.:
 * script-src … https://esm.sh https://challenges.cloudflare.com;
 * connect-src … https://challenges.cloudflare.com https://*.clerk.accounts.dev https://api.clerk.com …;
 * frame-src 'self' https://challenges.cloudflare.com https://*.clerk.accounts.dev;
 * worker-src 'self' blob:;
 * See https://clerk.com/docs/security/clerk-csp and Cloudflare Turnstile CSP docs.
 *
 * @typedef {object} NeorgonAuthOptions
 * @property {import("https://esm.sh/convex@1.21.0/browser").ConvexHttpClient} convex
 * @property {string} publishableKey Clerk publishable key (pk_test_… / pk_live_…)
 * @property {HTMLElement | string} signInHost Mount target for SignIn (selector or element)
 * @property {HTMLElement | string} [userButtonHost] Mount target for UserButton when signed in
 * @property {(info: { clerk: import("@clerk/clerk-js").LoadedClerk, hasSession: boolean }) => void} [onSession] Called after load and when session changes
 * @property {Record<string, unknown>} [signInProps] Extra props passed to Clerk `mountSignIn` (e.g. `appearance`, `localization`).
 * @property {Record<string, unknown>} [userButtonProps] Extra props passed to Clerk `mountUserButton` (e.g. `showName: false`).
 * @property {Record<string, unknown>} [clerkAppearance] Passed to `clerk.load({ appearance })` so UserButton popover, menus, and sign-out match your theme.
 */

/** @param {HTMLElement | string | undefined} host */
function el(host) {
  if (!host) return null;
  if (typeof host === "string") return document.querySelector(host);
  return host;
}

/**
 * ConvexHttpClient.setAuth() only accepts a JWT string (unlike ConvexClient WebSocket, which
 * accepts a token fetcher). Resolve Clerk's Convex template token and set or clear auth.
 * @param {import("@clerk/clerk-js").LoadedClerk} clerk
 * @param {import("https://esm.sh/convex@1.21.0/browser").ConvexHttpClient} convex
 */
async function syncConvexHttpJwt(clerk, convex) {
  try {
    const session = clerk.session;
    if (!session) {
      convex.clearAuth();
      return;
    }
    const token = await session.getToken({ template: "convex" });
    if (token) convex.setAuth(token);
    else convex.clearAuth();
  } catch {
    convex.clearAuth();
  }
}

/**
 * Load Clerk, wire Convex JWT, mount Sign-In or UserButton.
 * @param {NeorgonAuthOptions} options
 * @returns {Promise<import("@clerk/clerk-js").LoadedClerk>}
 */
export async function initNeorgonClerkConvex(options) {
  const {
    convex,
    publishableKey,
    signInHost,
    userButtonHost,
    onSession,
    signInProps = {},
    userButtonProps = {},
    clerkAppearance,
  } = options;
  if (!publishableKey) {
    throw new Error("Neorgon auth: set <meta name=\"clerk-publishable-key\" content=\"pk_…\"> or pass publishableKey.");
  }

  const { Clerk } = await import("https://esm.sh/@clerk/clerk-js@5.125.10");
  const clerk = new Clerk(publishableKey);

  const signInEl = el(signInHost);
  const userEl = el(userButtonHost);

  let mounted = /** @type {"signin" | "user" | null} */ (null);

  function unmountClerkUi() {
    if (mounted === "signin" && signInEl) {
      try {
        clerk.unmountSignIn(signInEl);
      } catch {
        /* ignore */
      }
    }
    if (mounted === "user" && userEl) {
      try {
        clerk.unmountUserButton(userEl);
      } catch {
        /* ignore */
      }
    }
    mounted = null;
    if (signInEl) signInEl.replaceChildren();
    if (userEl) userEl.replaceChildren();
  }

  async function mountClerkUi() {
    unmountClerkUi();
    await syncConvexHttpJwt(clerk, convex);
    if (clerk.session && userEl) {
      clerk.mountUserButton(userEl, {
        ...userButtonProps,
      });
      mounted = "user";
    } else if (signInEl) {
      // withSignUp + hash routing: stay in the mounted modal. Do not set signUpUrl /
      // fallbackRedirectUrl to location.href — that becomes a normal navigation and reloads the page.
      clerk.mountSignIn(signInEl, {
        routing: "hash",
        withSignUp: true,
        ...signInProps,
      });
      mounted = "signin";
    }
    onSession?.({ clerk, hasSession: !!clerk.session });
  }

  if (clerkAppearance != null) {
    await clerk.load({ appearance: clerkAppearance });
  } else {
    await clerk.load();
  }
  await mountClerkUi();

  if (typeof clerk.addListener === "function") {
    let prev = !!clerk.session;
    clerk.addListener(() => {
      void (async () => {
        await syncConvexHttpJwt(clerk, convex);
        const next = !!clerk.session;
        if (next !== prev) {
          prev = next;
          await mountClerkUi();
        } else {
          onSession?.({ clerk, hasSession: next });
        }
      })();
    });
  }

  return clerk;
}

/**
 * Sign out and clear Convex credentials (call after clerk.signOut if you handle UI yourself).
 * @param {import("@clerk/clerk-js").LoadedClerk} clerk
 * @param {import("https://esm.sh/convex@1.21.0/browser").ConvexHttpClient} convex
 */
export async function neorgonSignOut(clerk, convex) {
  await clerk.signOut({ redirectUrl: window.location.href });
  convex.clearAuth();
}

/** @param {import("@clerk/clerk-js").LoadedClerk} clerk */
export function neorgonDisplayLabel(clerk) {
  const u = clerk.user;
  if (!u) return "";
  if (u.username) return u.username;
  const email = u.primaryEmailAddress?.emailAddress;
  if (email) return email.split("@")[0] || email;
  if (u.firstName) return u.firstName;
  return "Account";
}
