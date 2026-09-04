import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { readLedger, writeLedger, appendReviews, clearLedger } from "./model/ledger";

// Contract C7.5. Four functions over the two halves of a neo-ledger/1 document.
//
// Each one is an identity check and a call into convex/model/ledger.ts.
// clerkSubject is never an argument: it is always identity.subject, because a
// subject passed in from the client is a subject a client can forge.

const cardRow = v.object({
  cardId: v.string(),
  s: v.number(),
  d: v.number(),
  due: v.number(),
  lr: v.number(),
  reps: v.number(),
  lapses: v.number(),
  st: v.string(),
  step: v.number(),
});

const reviewRow = v.object({
  cardId: v.string(),
  t: v.number(),
  g: v.number(),
  e: v.number(),
  s0: v.number(),
  d0: v.number(),
  el: v.number(),
  st0: v.string(),
});

const settingRow = v.object({
  key: v.string(),
  value: v.string(),
  updatedAt: v.number(),
});

/**
 * The cards half of the ledger plus the scheduler settings. C7.5.
 *
 * With no deckId this reads every deck the visitor has, capped at PAGE cards.
 * `truncated` says the cap was hit, so a caller can pull deck by deck instead
 * of silently believing it has everything.
 *
 * The review log is NOT returned: C7.5 defines ledger.pull as
 * { cards[], settings[] }. A second device therefore restores scheduling state
 * and not review history. Named as a limit rather than left to be discovered.
 */
export const pull = query({
  args: { deckId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, error: "Not authenticated", cards: [], settings: [] };
    return await readLedger(ctx, identity.subject, args.deckId);
  },
});

/**
 * Write the cards half for one deck, and optionally the scheduler settings.
 * C7.6: per-card last-write-wins by lr.
 *
 * `settings` is optional and is the only way settings are ever written: C7.5
 * gives Rappel no separate settings mutation, and without this a visitor's
 * desired retention could be read back but never sent.
 */
export const push = mutation({
  args: {
    deckId: v.string(),
    cards: v.array(cardRow),
    settings: v.optional(v.array(settingRow)),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, error: "Not authenticated", wrote: 0 };
    return await writeLedger(ctx, identity.subject, args);
  },
});

/**
 * Append review log entries. C7.6: keyed by (subject, deckId, cardId, t), so
 * re-pushing the same batch finds every entry already stored and writes
 * nothing. `skipped` counts those, which is how a caller can tell an idempotent
 * repeat from a failed write.
 */
export const pushReviews = mutation({
  args: { deckId: v.string(), reviews: v.array(reviewRow) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, error: "Not authenticated", wrote: 0, skipped: 0 };
    return await appendReviews(ctx, identity.subject, args);
  },
});

/**
 * Delete the visitor's cards and reviews for one deck, or for every deck when
 * deckId is absent. C7.5.
 *
 * Settings are deliberately left alone: they are the visitor's scheduler
 * parameters, not deck rows, and dropping a deck must not reset them.
 *
 * Deletes at most PAGE rows per call and reports what is left, so a caller
 * repeats until `remaining` is 0 rather than hitting a transaction limit.
 */
export const clear = mutation({
  args: { deckId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ok: false, error: "Not authenticated", deleted: 0, remaining: 0 };
    return await clearLedger(ctx, identity.subject, args.deckId);
  },
});
