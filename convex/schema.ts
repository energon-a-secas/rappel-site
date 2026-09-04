import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Contract C7.4, transcribed. Every row is owned by its clerkSubject and no
// user ever reads another's, which is why neither project needs an admin role
// or a Convex environment variable (C7.7).
export default defineSchema({
  /** The cards half of a neo-ledger/1 document, one row per card. */
  cards: defineTable({
    clerkSubject: v.string(),
    deckId: v.string(),
    cardId: v.string(), // noteId:templateId, per C4.2
    s: v.number(),
    d: v.number(),
    due: v.number(),
    lr: v.number(),
    reps: v.number(),
    lapses: v.number(),
    st: v.string(),
    step: v.number(),
  })
    .index("by_owner_card", ["clerkSubject", "deckId", "cardId"])
    .index("by_owner_deck", ["clerkSubject", "deckId"]),

  /** The append-only log half. Keyed by (subject, deck, card, t), so a
   *  re-pushed batch is a no-op rather than a duplicate. C7.6. */
  reviews: defineTable({
    clerkSubject: v.string(),
    deckId: v.string(),
    cardId: v.string(),
    t: v.number(),
    g: v.number(),
    e: v.number(),
    s0: v.number(),
    d0: v.number(),
    el: v.number(),
    st0: v.string(),
  }).index("by_owner_card_t", ["clerkSubject", "deckId", "cardId", "t"]),

  /** Scheduler parameters, not deck content. A deck author must never be able
   *  to set a reader's memory parameters (C5.2 rule 3). */
  settings: defineTable({
    clerkSubject: v.string(),
    key: v.string(), // "w" | "desired_retention" | "learn_steps"
    value: v.string(),
    updatedAt: v.number(),
  }).index("by_owner_key", ["clerkSubject", "key"]),
});
