// Run with: node --test convex/merge.test.ts   (node 22.6+ strips the types)
//
// Convex ignores this file: its bundler skips any basename with more than one
// dot (convex/dist/cjs/bundler/index.js, the entryPoints walk), so it is never
// pushed to a deployment.
import test from "node:test";
import assert from "node:assert/strict";
import { cardWins, settingWins, reviewKey } from "./merge.ts";

test("cardWins: a strictly later review replaces, equal and earlier do not", () => {
  assert.equal(cardWins(1000, 1001), true);
  assert.equal(cardWins(1000, 1000), false, "a re-push of an unchanged card must write nothing");
  assert.equal(cardWins(1000, 999), false);
  assert.equal(cardWins(1000, 0), false, "a never-reviewed card must not displace a reviewed one");
});

test("per-card last-write-wins keeps both devices, blob last-write-wins would not", () => {
  // Two devices, same day, different cards. This is the exact case C7.6 names.
  type Row = { lr: number; reps: number };
  const server = new Map<string, Row>();
  const push = (rows: Record<string, Row>) => {
    for (const [id, row] of Object.entries(rows)) {
      const stored = server.get(id);
      if (!stored || cardWins(stored.lr, row.lr)) server.set(id, row);
    }
  };

  push({ "n_0001:recognition": { lr: 1000, reps: 5 } }); // phone, morning
  push({ "n_0002:recognition": { lr: 1200, reps: 3 } }); // laptop, evening

  assert.equal(server.size, 2);
  assert.equal(server.get("n_0001:recognition")?.reps, 5, "the phone's morning is still here");
  assert.equal(server.get("n_0002:recognition")?.reps, 3);

  // Under one blob with last-write-wins over the whole ledger, the evening
  // document would have replaced the morning one and n_0001 would be gone.
  const blob = { "n_0002:recognition": { lr: 1200, reps: 3 } };
  assert.equal(Object.keys(blob).length, 1);
});

test("reviewKey is stable, so re-pushing a batch is a no-op", () => {
  const seen = new Set<string>();
  const batch = [
    { deck: "jp-kana-hiragana", c: "n_0001:recognition", t: 1787875200000 },
    { deck: "jp-kana-hiragana", c: "n_0001:recognition", t: 1787875260000 },
    { deck: "jp-kana-hiragana", c: "n_0002:recognition", t: 1787875200000 },
  ];
  const append = (rows: typeof batch) => {
    let wrote = 0;
    for (const r of rows) {
      const k = reviewKey(r.deck, r.c, r.t);
      if (seen.has(k)) continue;
      seen.add(k);
      wrote++;
    }
    return wrote;
  };
  assert.equal(append(batch), 3);
  assert.equal(append(batch), 0, "the second push of the same batch writes nothing");
  assert.equal(seen.size, 3);
});

test("settingWins is last-write-wins by updatedAt", () => {
  assert.equal(settingWins(5, 6), true);
  assert.equal(settingWins(6, 6), false);
  assert.equal(settingWins(6, 5), false);
});
