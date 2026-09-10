# CLAUDE.md: Rappel

A spaced-repetition flashcard engine that runs in the browser: FSRS-6 with the
published defaults, decks from a built-in library or from TSV, CSV and JSON
import, and a review ledger kept in the visitor's own storage. Any site can
embed a deck in an iframe and read the answers back over `postMessage`; that is
how Runcible attaches a deck to a chapter. No account is needed, nothing is
uploaded, and the Convex sync path is dormant until a Clerk key is on the page.

**Live:** rappel.neorgon.com · **Port:** 8879

## Run

```bash
make serve       # http://localhost:8879
make validate    # six validators, plain node, no install. The definition of done
```

Then open http://localhost:8879. It must be served over HTTP. The app is ES
modules, and `file://` blocks them.

`make validate` is `test-scheduler`, `test-origin`, `test-validate`,
`test-transforms`, `check-limits` and `validate-decks`, each its own `.PHONY`
target appended with a bare `validate: <target>` line (CONTRACTS C12 A8). Add a
validator by adding a target and one more such line; never rewrite another's.

## Architecture

| Module | Lines | Owns |
|---|---:|---|
| `js/vendor/wanakana.js` | 1822 | none (third party, MIT) |
| `js/neorgon-auth.js` | 978 | none (kit) |
| `js/neorgon-header.js` | 826 | none (kit) |
| `js/validate-deck.js` | 450 | `DECK_FORMAT`, `DECK_INDEX_FORMAT`, `LEDGER_FORMAT`, `TEMPLATE_KINDS`, `CARD_STATES` |
| `js/neorgon-footer.js` | 421 | none (kit) |
| `js/viz.js` | 387 | `skeleton`, `empty`, `error`, `statGrid`, `bars` |
| `js/sync.js` | 369 | `syncAvailable`, `initSync`, `pull`, `push`, `pushBatch` |
| `js/events.js` | 321 | `keyAction`, `bindEvents` |
| `js/neokeys/core.js` | 274 | `RESERVED`, `CONVENTIONAL`, `onChange`, `setTypingSelector`, `isTypingTarget` |
| `js/neorgon-beacon.js` | 263 | none (kit) |
| `js/render.js` | 262 | `render`, `renderAttribution` |
| `js/session.js` | 259 | `LEARN_AHEAD_MS`, `DEFAULT_NEW_PER_SESSION`, `deckCards`, `buildQueue`, `startSession` |
| `js/embed.js` | 254 | `PROTOCOL_VERSION`, `readConfig`, `decodeInlineDeck`, `resolveHostOrigin`, `post` |
| `js/stats.js` | 228 | `loadHistory`, `perDay`, `streak`, `heatGrid`, `retentionSeries` |
| `js/deck.js` | 226 | `renderFieldValue`, `renderTemplate`, `fieldText`, `clozeOrdinalsOf`, `renderCloze` |
| `js/import.js` | 210 | `parseHeaders`, `parseDelimited`, `importDelimited`, `buildDeck`, `importJson` |
| `js/ledger-log.js` | 201 | `DB_NAME`, `DB_VERSION`, `STORE`, `RECORD_VERSION`, `logAvailable` |
| `js/scheduler.js` | 200 | `NEW`, `LEARNING`, `REVIEW`, `RELEARNING`, `defaultScheduler` |
| `js/fsrs.js` | 189 | `DEFAULT_W`, `S_MIN`, `S_MAX`, `D_MIN`, `D_MAX` |
| `js/neokeys/overlay.js` | 182 | `open`, `close`, `toggle` |
| `js/state.js` | 179 | `PREFS_KEY`, `LEDGER_KEY`, `DECKS_KEY`, `SESSION_KEY`, `LEDGER_LIMIT_BYTES` |
| `js/transforms.js` | 159 | `ensureTransforms`, `transformsReady`, `kataToHira`, `TRANSFORM_IDS`, `bindInput` |
| `js/neorgon-persist.js` | 152 | `safeGet`, `safeSet`, `safeRemove`, `safeGetJSON`, `safeSetJSON` |
| `js/render-session.js` | 144 | `renderCard` |
| `js/neokeys/fleet.js` | 139 | `setSource`, `open`, `close`, `toggle`, `count` |
| `js/boot.js` | 129 | `boot` |
| `js/origin.js` | 126 | `isNeorgonHost`, `isLocalOrigin`, `isAllowedOrigin`, `isAllowedDeckSrc`, `namespacedDeckId` |
| `js/account.js` | 124 | `account`, `initAccount`, `stopAccount` |
| `js/utils.js` | 124 | `$`, `escHtml`, `t`, `b64urlEncode`, `b64urlDecode` |
| `js/neokeys/chrome.js` | 118 | `isHidden`, `setScope`, `isFull`, `show`, `hide` |
| `js/neokeys/index.js` | 116 | `init` |
| `js/ledger.js` | 111 | `buildLedgerDocument`, `restoreLedger`, `deckCounts` |
| `js/neokeys/store.js` | 88 | `enabled`, `open`, `toggle` |
| `js/deck-load.js` | 85 | `BUILTIN_INDEX`, `fetchJson`, `loadBuiltinCatalog`, `builtinPath`, `acceptDeck` |
| `js/modal.js` | 81 | `openModal`, `closeModal`, `initModals` |
| `js/export.js` | 60 | `deckToTsv`, `downloadDeckJson`, `downloadDeckTsv`, `downloadLedger` |
| `js/keys.js` | 47 | `initKeys` |
| `js/neokeys/boot.js` | 18 | none (kit) |
| `js/app.js` | 14 | none (entry point, wires `boot()` and nothing else) |
| `js/neorgon-auth-sites.js` | 7 | none (kit, generated catalogue) |

Vendored from `packages/neorgon-ui/`, never edited in place, refreshed by the
sync scripts: `js/neorgon-header.js`, `js/neorgon-footer.js`,
`js/neorgon-beacon.js`, `js/neorgon-persist.js`, `js/neorgon-auth.js`,
`js/neorgon-auth-sites.js`, `js/neokeys/*`, `js/viz.js` and the matching
`css/neorgon-*.css`, `css/viz.css`. `js/vendor/wanakana.js` is
upstream 5.3.1 with a licence header, refreshed only by re-vendoring.

The contracts every module cites are `docs/delivery/CONTRACTS.md` at the
monorepo root: C4 (deck), C5 (ledger), C6 (embed), C7 (Convex), C8 (storage
keys), C11 (data and licences), C12 (amendments A1 to A18). The scheduler's
normative source is `docs/delivery/research/srs-algorithm.md` section B.

## Data

- `localStorage['rappel:prefs:v1']`: lang, scheduler parameters, retention, steps, day start
- `localStorage['rappel:ledger:v1']`: the cards half of `neo-ledger/1`, every deck
- `localStorage['rappel:decks:v1']`: imported and fetched deck documents, keyed by the C4.4 id
- `localStorage['rappel:session:v1']`: the in-progress session, so a closed tab loses nothing
- `localStorage['neokeys-prefs']` and the `neo_chrome` cookie: the NeoKeys kit's own
- IndexedDB `rappel` v1, store `reviews`, `keyPath ['deck','t']`, index `by_card`: the append-only review log
- Convex tables: `cards`, `reviews`, `settings` (see `convex/schema.ts`), dormant
- `data/decks/`: `index.json` (`neo-deck-index/1`) plus four generated `neo-deck/1` decks, CC BY-SA 4.0 and CC BY 2.0 FR, all `screen: "required"`. Generated by `projects/runcible-site/tools/build-decks.mjs`; see `data/README.md`

## Conventions

- Zero build step. Plain ES modules loaded by `js/app.js`.
- Header and footer come from the shared kits. Do not add site-local `.neo-footer` or `.header-bar` CSS.
- No authored module over 500 lines, `js/app.js` under 50, no inline `onclick`, no JSON file over 150 KB. `tools/check-limits.mjs` fails the build on any of them; the vendored kits and `js/vendor/` are excluded by name.
- Keyboard shortcuts go through NeoKeys (`js/keys.js`). `?`, `H` and `G` are kit-reserved and `register()` refuses them.
- The only identity knob is `--accent: #14b8a6` plus `--accent-bright: #2dd4bf` in `css/style.css`. Everything else comes from CDN `base.css`.
- No em dashes and none of the fleet's five banned words (the list is in PROJECTS.md's copy rules and CONTRACTS C9.3), in copy or comments alike.

## Gotchas

**Three FSRS-6 facts are silent wrong answers, and each produces plausible
intervals.** (1) `r` and both stability candidates come from the PRE-update
difficulty; `nextState()` in `js/fsrs.js` computes stability before difficulty
for exactly that reason. (2) The mean-reversion target is NOT clamped:
`init_difficulty(w, 4)` is -4.7716 with the defaults, outside the documented
[1, 10] band, and clamping it to 1 is not FSRS-6. (3) `min(s_fail, S / exp(w17 *
w18))` on a lapse is new in FSRS-6 and is what stops a lapse ever raising
stability. `tools/test-scheduler.mjs` computes each wrong answer independently
and asserts the implementation differs; QA injected all three bugs and the
suite caught each one. Implement from the research report, not the wiki pages,
which disagree with the code and with each other.

**`elapsedDays` counts study-day rollovers, not 24-hour chunks.** A card
answered at 22:00 and again at 08:00 has waited one day and takes the recall
branch; floored real time called that 0 and sent it into the short-term
branch, and a review taken earlier in the day than the last one read as
interval minus one. `tools/test-scheduler.mjs` pins 22:00 to 08:00 as 1 and
03:00 to 15:00 two days later as 2. `answer()` passes `day_start_hour`
through; a caller that omits it gets Anki's 04:00.

**Hard is a passing grade.** Anki's manual warns that pressing Hard after a
failed recall makes every future interval too long. The four buttons in
`js/render-session.js` and the NeoKeys hints say what happened in your head
("I recalled it, with effort"), not how the card felt. Do not "simplify" the
copy back to Again/Hard/Good/Easy with no gloss.

**Card identity is `noteId:templateId`, a string, and it is the ledger's
foreign key.** Never an array index, never a generated integer. Cloze adds an
ordinal: `n_0001:gap:2`. A note id may not contain a colon (the validator names
the reason). Renumbering notes, or deriving ids from position, discards a
person's progress on every card touched, and nothing anywhere reports it. The
same rule binds the generator in `runcible-site/tools/build-decks.mjs`: it
derives ids from corpus selection order so re-running over the same corpus
emits the same ids.

**The `skill` in `rappel:answer` is the deck's own name, and a host must not
record evidence under it.** `rappel:answer` carries `skill: note.skill ||
template.skill` from the deck file, and that string is deck-internal so a deck
stays reusable across Books. TEST-REPORT section 3 found Runcible recording
attempts under it (`vocab.first-words.read`) while every chapter goal read a
different name (`jp.vocab.read`), so deck review contributed zero evidence with
no error. The fix landed in the host on 2026-09-04: `runcible-site/js/embed.js`
records the chapter's own `skill` from the deck exercise spec, and
`tools/validate-book.mjs` refuses a deck exercise whose skill nothing in the
Book reads. Nothing here changed, and nothing here should: a template with no
`skill` is a validator warning, not an error, because a standalone deck does not
need one.

**A `?src=` deck from outside `neorgon.com` is stored as
`ext:<12 hex sha256 of src>:<deck.id>`.** C4.4. Proctor accepts any https URL
safely because it stores nothing; here a fetched document influences persistent
card rows, so a third-party deck claiming `"id": "jp-first-words"` must not
merge into the visitor's real progress. The namespaced id is what every
`postMessage` carries as `deckId`. Built-in decks, `*.neorgon.com` sources and
localhost keep the plain id. `acceptDeck()` in `js/deck-load.js` is the one
path in; a second path that skips it is the hole C4.4 closes. A deck carried
in `#d=` is namespaced by a hash of its own content (`ext:<12 hex>:<id>`), so
a crafted link cannot replace a built-in deck's rows, and `DECK_ID_RE` in
the validator accepts that prefix on a deck id (and only there).

**The origin allowlist is a label-boundary check, not a suffix check.**
`isAllowedOrigin()` in `js/origin.js` accepts `https://neorgon.com` and
`https://*.neorgon.com` only; `evil-neorgon.com` and `neorgon.com.evil.io` are
refused, as are origins carrying a path, query, credentials, the string
`"null"` (a sandboxed frame) or a non-string. The localhost clause is gated on
the ENGINE being on localhost, so it is dead code in production. Nothing in
root `make smoke` checks any of this: `tools/test-origin.mjs` (52 cases) is the
whole enforcement. `hostname.endsWith('neorgon.com')` fails five of them.

**Two inbound messages can write, and each refusal condition is exact.**
`rappel:restore` is refused when the origin is unlisted AND
`state.ledgerMode === 'engine'`; under `?ledger=host` or a failed storage probe
it is accepted from anywhere, because then it writes nothing but memory.
`rappel:load` (C12 A19) is never refused for its origin: an unlisted sender's
deck is renamed `ext:<12 hex>:<id>` and marked ephemeral, so it is held for the
life of the frame and no byte of it reaches disk. The invariant, stated once in
three files: an unlisted origin can never cause a write to
`rappel.neorgon.com`'s persistent storage. **Deleting is writing**, and that is
the edge that was open until 2026-09-08: `saveSession()` used to CLEAR
`rappel:session:v1` whenever the session it held sat on an ephemeral deck, so a
`rappel:load` from an unlisted origin deleted the learner's own saved session in
any browser that does not partition the frame's storage from the engine's. Both
`saveSession()` and `clearSession()` now leave that key alone unless the session
in hand is on a deck this frame may write, and `tools/test-personal.mjs` pins
it. `hello`, `start`, `export` and `theme` are accepted from any origin on
purpose: read-only or session-scoped, and the host already knows which deck it
embedded.

**A rejected restore reports `deck-invalid`, and a restore never changes the
scheduler.** There is no `ledger-invalid` code in C6.2, so `restoreLedger()`'s
validator message rides on `deck-invalid`. The incoming `scheduler` block is
validated (21 finite `w`, `name: "fsrs"`, `version: 6`, and so on) but not
applied: a document must never set a reader's memory parameters (C5.2 rule 3).
`exported` (finite ms) and `origin` (non-empty string) are required, which is
where QA's hand-built fixture kept failing. The happy path of a restore from an
allowed origin is unproven end to end (TEST-REPORT section 6, item 2); the
refusal path is proven in a real browser.

**The engine emits `rappel:ready` before the host may be listening.** So
`rappel:hello` makes it re-emit, and `llms.txt` tells hosts to send `hello` on
the iframe's `load` event. A host that omits it has an intermittently blank
panel that looks like a network fault. The iframe also carries
`loading="lazy"`: QA's first cross-origin run recorded zero messages because
the frame never entered a short headless viewport (TEST-REPORT 2.3). Before
filing "the embed is dead", scroll it into view.

**Every message carries `v: 1` in both directions and an unknown `v` is
dropped.** The two sites deploy separately, and a host that stops receiving
`rappel:answer` shows a working deck while quietly recording nothing (C6.7).
Changing a payload shape means a `v: 2` engine keeps emitting `v: 1` for one
release. Outbound posts go to the referrer's origin, never `'*'`; with no
referrer `post()` returns false and nothing is sent.

**Where the ledger lives in an embed is a same-site guarantee only.** Chrome
and Firefox partition third-party storage by top-level site, so Rappel inside
another `neorgon.com` subdomain shares one ledger with standalone Rappel and a
third-party host does not. Safari may partition even the same-site case, and
that question is open (nobody has run Safari; TEST-REPORT 6.4). The design does
not depend on the answer: `decideLedgerMode()` in `js/boot.js` probes both
`localStorage` and IndexedDB before anything is written or posted, and
`rappel:ready` reports `ledger: "engine"` or `"ephemeral"`. `?ledger=host` also
reports `"ephemeral"`. Do not add a feature whose correctness depends on the
partition being shared.

**`storage-unavailable` is in the C6.2 code list and the engine never emits
it.** A failed probe is reported as `ledger: "ephemeral"` on `rappel:ready` and
as a line under the library ("This browser refused a storage write, so nothing
is being saved"), not as an error. Keep the code in the
vocabulary (a host may already branch on it) and do not remove the
`ephemeral` signal thinking the error covers it.

**Under `ledger=host` or a failed probe, the review log lives in
`state.memLog` and `rappel:progress` fires on every answer.** `persists()` is
false, so `appendReview` is skipped and the entry is pushed to memory; the
bridge then posts the whole ledger with `log: true` after each answer and each
session end, because on unload it is gone. The log half of a `restore` is
dropped in that mode (`appendMany` is gated on `persists()`); only card rows
merge into memory. `buildLedgerDocument()` reads `memLog` in place of
IndexedDB, and `stats.js` does the same, so stats work in a frame that cannot
write.

**Cram writes nothing, and the only key that moves is the session record.**
`gradeCard()` skips the card row, the ledger save and the log entry when
`s.mode === 'cram'`, and the card leaves the queue on any grade. QA proved it
with a positive control: review mode wrote one IndexedDB row and 230 bytes of
`rappel:ledger:v1`, cram wrote zero rows and a byte-identical ledger. The one
key that changed was `rappel:session:v1`, which is the resumable-session UI
state, not the ledger. Top-level review mode does not auto-start a session;
only `embed` and `cram` do (`js/boot.js`), which is why a "does review write?"
test at the top level proves nothing.

**The romaji reader has two halves and the vendored `bind()` is not enough.**
C12 A14, A16, A17. wanakana's `IMEMode` reads `nn` as a finished ん, so `onna`
lands as おんあ and `konnichiha` as こんいちは, and no settle step can recover
them because the romaji is gone. `js/transforms.js` holds a trailing run of
`n+y?` back on every keystroke (`live()`), collapses `n{2,}` before a
non-vowel, and settles once at submit (`applyTransform()`), before `compare`.
`producedCorrect()` in `js/session.js` calls the settle step first. The
eleven lines are COPIED from `runcible-site/books/japanese/exercises/kana-input.js`,
not imported: the two sites' only coupling is C6. `tools/test-transforms.mjs`
carries the measured words; a regression there is the defect coming back.

**`kataToHira()` is a code point shift, not a second romaji engine.** The
`kana` compare token runs inside synchronous grading; routing it through the
lazily imported wanakana would make `answersMatch` async and reach the
renderer. Keep it arithmetic.

**wanakana is loaded lazily, and `startSession()` pulls it in early on
purpose.** `js/vendor/README.md` asks for lazy loading (62.6 KB). Loading it
on the first keystroke of the first typed card is where the delay would be
felt, so the session start triggers `ensureTransforms()` when any template
names a transform. `bindInput()` re-binds itself once the module lands.

**The card map refuses to grow past 1.5 MiB, with the number.** C8.3.
`ledgerHeadroom()` projects 123 characters per card row (measured in DESIGN.md
Q9) and `acceptDeck()` refuses with "would take the card map to X MiB, over the
Y MiB ceiling". The browser's own ceiling is about 5 MiB and the Persist kit
never throws, so without this a quota failure would silently drop a session.
The review log has no cap: it is in IndexedDB precisely so history is never
pruned.

**The review log is in IndexedDB because the Persist kit rewrites the whole
value on every save.** DESIGN.md Q9 measured it: at 50,000 reviews a
localStorage log costs a 4 MiB stringify plus a 4 MiB synchronous write per
card answer. `js/ledger-log.js` is the one storage mechanism with no kit
behind it, so it mirrors the kit's two guarantees by hand: a `{ __v: 1 }`
envelope on every record, and nothing ever throws (a failed read returns the
fallback, a failed write returns false). The store is keyed `[deck, t]`, so
re-importing the same export is a no-op rather than a duplicate. If a second
site needs an append-only local store, this graduates into the kit as
`createLog()`; do not copy it.

**Never rename the four `rappel:*:v1` keys.** C8.5. A rename orphans every
visitor's saved progress with no warning. The `:v1` in the key is the format
generation (bumping it orphans on purpose); the `version` argument to
`createStore` is the migration counter inside that generation (bumping it runs
`migrate`). They are different numbers.

**`deck_version_seen: null` is a value, not a mistake.** `state.js` creates a
row group with it, an export carrying orphan log entries emits it, and the
pulled Convex document sets it on every deck. The validator accepts null; a
"tighten the schema" change that rejects it fails three producers this project
ships. `sweepOrphans()` in `state.js` is the C5.2 rule 1 sweep (a deleted
note's row goes when the deck version moves). `acceptDeck()` calls it when a
deck arrives whose `version` differs from the `deck_version_seen` the ledger
holds, and says how many rows went. Do not sweep on load or on a first
acceptance; a note temporarily missing from a re-download would lose its
progress.

**`ledger.pull` returns no review history, and the stats screen must not
print a zero.** C12 A4. A second device restores its schedule and none of its
reviews. `historyGap()` in `js/stats.js` compares reviews visible here against
the `reps` the card map implies and renders `n/a` plus "Review history stays on
the device that made it", with Export and Restore as the route out. QA
confirmed a fresh browser shows `0` and the restored-schedule case shows
`n/a`. Keep those two states visibly different.

**Sync pushes deltas, never running totals, and `pull()` runs before
`push()`.** C12 A1 is described in CONTRACTS as the most dangerous item in the
campaign and no test anywhere touches it (TEST-REPORT 6.1); the two-profile
Convex test has never run because no sign-in exists. Do not pre-aggregate
lifetime counts before calling `pushBatch()`. The review log reaches
`pushBatch()` through the `rappel-review` event `gradeCard()` dispatches:
`js/account.js` queues the rows for two seconds and flushes them when signed
in, and with no account nothing listens (C7.5). `initSync({ deckId })` scopes
`pull()`; without a Clerk meta every function returns the C12 A5 no-account
values and fetches nothing. QA confirmed zero requests to Clerk, Convex or
esm.sh on a real network tab; a static import of the Convex client anywhere
breaks that, and a static import of `js/neorgon-auth.js` would cost every
anonymous visitor the kit module.

**Sign-in is the Neorgon Auth Kit, dormant until a `clerk-publishable-key` meta
is added, and an embed never starts it.** The kit (`js/neorgon-auth.js`,
`css/neorgon-auth.css`, vendored by `packages/neorgon-ui/sync-auth.sh`) owns the
`.neo-auth[data-neo-auth]` slot in `.header-right`, the sign-in dialog and the
Convex token. `initSync()` in `js/sync.js` imports it and the Convex client only
when the meta is present, calls `NeoAuth.start({ convex })`, and registers one
`NeoAuth.onChange` listener for the module's lifetime; a later `initSync()` for
another deck replaces the scope and hooks and adds nothing. That listener is
the old `onSession` body: `sync:whoami`, then pull before push. The kit fires
on real changes only, never on a token refresh, so a `whoami` that fails leaves
sync signed out until a reload or a fresh sign-in. In a frame,
`initAccount({ embed })` returns before `initSync()`, so an embed loads no kit,
no Clerk and no Convex, and `account.available` is false there. Its reviews
reach the server only as card rows, in the next standalone signed-in merge that
shares the frame's storage; their log rows never do. The dialog's lede is
`<meta name="neo-auth-reason">`, and Clerk mounts with virtual routing, which is
what leaves `#d=` alone. Sign-in cannot be exercised on localhost against the
production key, and the kit's localhost `neo-auth:dev-key` override does
nothing here without the meta, because `syncAvailable()` gates the import. To
switch accounts on: add the meta, run a plain `packages/neorgon-ui/sync-auth.sh`
so the other sites' catalogues learn about it, then `sync-auth.sh --check`.

**The Persist kit's `storageAvailable()` and the IndexedDB probe both run
before the first paint, by design.** `boot()` awaits `decideLedgerMode()`
before `startBridge()` and before `render()`, because the host has to be told
`ephemeral` rather than discover it. Moving the probe later to shave startup
makes `rappel:ready` lie.

**The EDRDG acknowledgement is a visible line, not a footer link or a modal.**
C11.3. `renderAttribution()` in `js/render.js` fills the `.neo-attrib` slot
below the review area whenever the loaded deck (or, on the library, any deck)
declares `screen: "required"` with an `attribution` string, in standalone and
embed alike. It is not in the Footer kit (its minimal mode is budgeted at one
70 px line and the wording is 206 characters) and it is structural rather than
checked: nothing in `make smoke` can see a missing acknowledgement. All four
built-in decks require it. Do not move it into the footer, a tooltip or a
dialog.

**A deck can render no markup, ever.** `js/deck.js` escapes everything and
rebuilds only Anki's two media spellings, `[sound:x.mp3]` and
`<img src="x.png">`, as elements. `<br>` in a template becomes a line break.
A media path that is absolute, root-relative or contains `..` is dropped, and
`media_base` may not be a URL. A deck can arrive from any https origin, and a
rendered document that can inject HTML can read the ledger.

**`.apkg` is closed and will stay closed.** The modern inner collection is
zstd, `DecompressionStream("zstd")` is Firefox 138 and later only, and the
SQLite reader is 0.69 MB of third-party runtime. Export from Anki as text.
`import.js` reads Anki's `#separator` header dialect verbatim so the text
round-trips, and `#guid column` is what keeps note ids stable across an edit.
Without a GUID column the note id is a hash of the front text (`noteIdFor`),
not the row number, so inserting a line in a re-imported file re-keys nothing.
A field that merely starts with a quote no longer swallows the rest of the
file (the parser re-reads with quotes taken literally), a byte order mark is
stripped, a file is JSON only if it parses as JSON, and the export quotes any
value the parser would otherwise misread.

**The built-in decks are generated elsewhere, and a hand edit here disappears.**
`projects/runcible-site/tools/build-decks.mjs` writes `data/decks/` from the
Runcible corpus, twice from one source. Change the corpus and re-run. Their
licences are CC BY-SA 4.0 (JMdict, KANJIDIC2) and CC BY 2.0 FR (Tatoeba), not
this repo's MIT; the paragraph C11.2 asks for, excluding `data/` from the MIT
grant, is at the foot of `LICENSE`.

**The `?deck=` list is `data/decks/index.json`, not the directory.** A
static origin cannot list a directory, so
`loadBuiltinCatalog()` reads the index (`neo-deck-index/1`, C12 A12) and
`builtinPath()` falls back to `data/decks/<id>.json`. A deck file added
without an index entry is loadable by `?deck=` and invisible in the library.

**The `Open in Rappel` link drops `embed` and `ledger` from the URL.**
`mountEmbedBar()` keeps every other parameter, so a `?ledger=host` frame
escapes to a top-level page that persists normally. That is the point: the
top-level origin is the one path that always works.

**Headless testing notes.** The Bash sandbox blocks Chrome's network service:
a server started inside it is unreachable from a browser outside it, with zero
requests arriving. The Chrome for Testing binaries under `~/.cache/puppeteer`
never complete an HTTP navigation here; the system Chrome does. `scripts/serve.py`
sends `Access-Control-Allow-Origin: *`, which the cross-origin `?src=` fetch
needs between `localhost:8878` and `localhost:8879`.

## Do not touch

- `js/neorgon-*.js`, `js/neokeys/`, `js/viz.js` and `css/neorgon-*.css`, `css/viz.css`: vendored kits, regenerated by `packages/neorgon-ui/sync-*.sh`.
- `js/vendor/wanakana.js`: upstream 5.3.1 with a licence header, never edited.
- `js/sync.js`: the backend workstream's brokered client (C7.1). A signature change is a three-way edit.
- `data/decks/`: generated by `projects/runcible-site/tools/build-decks.mjs`.
- `convex/_generated/`: rebuilt by `npx convex dev`.
- `favicon.*`, `apple-touch-icon.png`, `web-app-manifest-*.png`, `site.webmanifest`: generated by `packages/neorgon-ui/sync-favicon.sh` from this site's hub card.
