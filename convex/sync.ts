import { query } from "./_generated/server";

/**
 * Who the Clerk-issued JWT says this caller is. Contract C7.5.
 * Returns null when the request carries no identity, which is the answer an
 * anonymous visitor gets and is not an error.
 */
export const whoami = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return { subject: identity.subject };
  },
});
