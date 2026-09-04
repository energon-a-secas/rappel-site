/**
 * The data half of contract C7.5 for Rappel, with the owner passed in.
 *
 * Why the split: convex/ledger.ts is then three lines of identity check per
 * function and nothing else, and these helpers can be exercised against a real
 * deployment without a Clerk session. See convex/README.md for that recipe.
 * The Convex convention for helper modules is convex/model/, and stash-site
 * already does the same thing at convex/lib/validate.ts.
 *
 * Nothing here reads identity. The caller supplies `owner`, and the only
 * caller that ships is the one that takes it from identity.subject.
 */
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { cardWins, settingWins } from "../merge";

/** Read and write caps. A caller with more rows than this pages, see js/sync.js. */
export const PAGE = 500;

export type CardRow = {
  cardId: string;
  s: number;
  d: number;
  due: number;
  lr: number;
  reps: number;
  lapses: number;
  st: string;
  step: number;
};
export type ReviewRow = {
  cardId: string;
  t: number;
  g: number;
  e: number;
  s0: number;
  d0: number;
  el: number;
  st0: string;
};
export type SettingRow = { key: string; value: string; updatedAt: number };

export async function readLedger(ctx: QueryCtx, owner: string, deckId?: string) {
  const cardDocs = await ctx.db
    .query("cards")
    .withIndex("by_owner_deck", (q) =>
      deckId === undefined
        ? q.eq("clerkSubject", owner)
        : q.eq("clerkSubject", owner).eq("deckId", deckId),
    )
    .take(PAGE);

  const settingDocs = await ctx.db
    .query("settings")
    .withIndex("by_owner_key", (q) => q.eq("clerkSubject", owner))
    .take(PAGE);

  return {
    ok: true as const,
    truncated: cardDocs.length === PAGE,
    cards: cardDocs.map((d) => ({
      deckId: d.deckId,
      cardId: d.cardId,
      s: d.s,
      d: d.d,
      due: d.due,
      lr: d.lr,
      reps: d.reps,
      lapses: d.lapses,
      st: d.st,
      step: d.step,
    })),
    settings: settingDocs.map((d) => ({ key: d.key, value: d.value, updatedAt: d.updatedAt })),
  };
}

export async function writeLedger(
  ctx: MutationCtx,
  owner: string,
  args: { deckId: string; cards: CardRow[]; settings?: SettingRow[] },
) {
  const settings = args.settings ?? [];
  if (args.cards.length + settings.length > PAGE) {
    return { ok: false as const, error: `Too many rows in one push, cap is ${PAGE}`, wrote: 0 };
  }

  let wrote = 0;

  for (const row of args.cards) {
    const stored = await ctx.db
      .query("cards")
      .withIndex("by_owner_card", (q) =>
        q.eq("clerkSubject", owner).eq("deckId", args.deckId).eq("cardId", row.cardId),
      )
      .first();
    if (!stored) {
      await ctx.db.insert("cards", { clerkSubject: owner, deckId: args.deckId, ...row });
      wrote++;
    } else if (cardWins(stored.lr, row.lr)) {
      await ctx.db.patch(stored._id, {
        s: row.s,
        d: row.d,
        due: row.due,
        lr: row.lr,
        reps: row.reps,
        lapses: row.lapses,
        st: row.st,
        step: row.step,
      });
      wrote++;
    }
  }

  for (const row of settings) {
    const stored = await ctx.db
      .query("settings")
      .withIndex("by_owner_key", (q) => q.eq("clerkSubject", owner).eq("key", row.key))
      .first();
    if (!stored) {
      await ctx.db.insert("settings", { clerkSubject: owner, ...row });
      wrote++;
    } else if (settingWins(stored.updatedAt, row.updatedAt)) {
      await ctx.db.patch(stored._id, { value: row.value, updatedAt: row.updatedAt });
      wrote++;
    }
  }

  return { ok: true as const, wrote };
}

export async function appendReviews(
  ctx: MutationCtx,
  owner: string,
  args: { deckId: string; reviews: ReviewRow[] },
) {
  if (args.reviews.length > PAGE) {
    return {
      ok: false as const,
      error: `Too many reviews in one push, cap is ${PAGE}`,
      wrote: 0,
      skipped: 0,
    };
  }

  let wrote = 0;
  let skipped = 0;
  for (const row of args.reviews) {
    const stored = await ctx.db
      .query("reviews")
      .withIndex("by_owner_card_t", (q) =>
        q
          .eq("clerkSubject", owner)
          .eq("deckId", args.deckId)
          .eq("cardId", row.cardId)
          .eq("t", row.t),
      )
      .first();
    if (stored) {
      skipped++;
      continue;
    }
    await ctx.db.insert("reviews", { clerkSubject: owner, deckId: args.deckId, ...row });
    wrote++;
  }

  return { ok: true as const, wrote, skipped };
}

export async function clearLedger(ctx: MutationCtx, owner: string, deckId?: string) {
  let deleted = 0;

  const cardDocs = await ctx.db
    .query("cards")
    .withIndex("by_owner_deck", (q) =>
      deckId === undefined
        ? q.eq("clerkSubject", owner)
        : q.eq("clerkSubject", owner).eq("deckId", deckId),
    )
    .take(PAGE);
  for (const doc of cardDocs) {
    await ctx.db.delete(doc._id);
    deleted++;
  }

  const reviewDocs = await ctx.db
    .query("reviews")
    .withIndex("by_owner_card_t", (q) =>
      deckId === undefined
        ? q.eq("clerkSubject", owner)
        : q.eq("clerkSubject", owner).eq("deckId", deckId),
    )
    .take(PAGE);
  for (const doc of reviewDocs) {
    await ctx.db.delete(doc._id);
    deleted++;
  }

  const remaining = cardDocs.length === PAGE || reviewDocs.length === PAGE ? 1 : 0;
  return { ok: true as const, deleted, remaining };
}
