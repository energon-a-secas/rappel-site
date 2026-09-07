---
name: Rappel
description: Spaced repetition flashcards with an FSRS-6 scheduler that runs in the browser
colors:
  ground: "#040714"
  study-teal: "#14b8a6"
  study-teal-bright: "#2dd4bf"
  ink: "#f9f9f9"
  ink-quiet: "#cacaca"
  lapse-rose: "#e11d48"
typography:
  card: { fontFamily: "Avenir Next, -apple-system, Segoe UI, sans-serif", fontSize: "clamp(1.6rem, 5vw, 2.6rem)", fontWeight: 500, lineHeight: 1.25 }
  headline: { fontFamily: "Avenir Next, -apple-system, Segoe UI, sans-serif", fontSize: "1.5rem", fontWeight: 600, lineHeight: 1.25 }
  body: { fontFamily: "Avenir Next, -apple-system, Segoe UI, sans-serif", fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.6 }
  label: { fontFamily: "Avenir Next, -apple-system, Segoe UI, sans-serif", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em" }
rounded: { sm: "6px", md: "10px", lg: "15px" }
spacing: { sm: "8px", md: "16px", lg: "24px", xl: "32px" }
components:
  button-primary: { backgroundColor: "{colors.study-teal}", textColor: "{colors.ground}", rounded: "{rounded.sm}", height: "44px", padding: "0 20px" }
  button-ghost: { backgroundColor: "transparent", textColor: "{colors.ink-quiet}", rounded: "{rounded.sm}", height: "36px" }
  panel: { backgroundColor: "rgba(255,255,255,.03)", rounded: "{rounded.lg}", padding: "{spacing.lg}" }
---

# Design System: Rappel

Screen by screen direction, with the screenshots and the keyboard walk behind
it: **`docs/DESIGN-UX.md`**. Read it first; this file is only the token layer.

## 1. Overview

**Creative North Star: "The desk lamp at 23:00"**. Product register, Restrained
colour strategy: one dark ground, one accent, one large thing to read per
screen. It rejects the study-app arcade, so no confetti on a streak, no badge,
no progress theatre. Density is uneven on purpose: the review surface is one
card in a wide margin, the browse table is a spreadsheet and looks like one.
Rows over cards, one primary action per screen at 44px, colour only where
something is waiting, every learner-facing string bilingual through `js/utils.js`.

## 2. Colors

One teal on near-black; the palette is small because the accent has a job.

- **Primary, Study Teal** (`#14b8a6`, bright `#2dd4bf`): the ready-deck readout, the primary button, the revealed answer, the heatmap ramp.
- **Neutral, Ground** (`#040714`): the fleet ground from the CDN `base.css`. Surfaces are white at 3 to 6 percent over it, borders at 7 to 22.
- **Neutral, Ink** (`#f9f9f9`) and **Quiet Ink** (`#cacaca`), muted at 55 percent: card copy, supporting copy, labels, table state.

**The One Waiting Thing Rule.** The accent marks work that is waiting and
nothing else, so a library with nothing due is monochrome. `--ok` is the accent
and `--warn` is it mixed with rose; a verdict carries a glyph too (WCAG 1.4.1).

## 3. Typography

One family, Avenir Next, over the system stack. Mono is for the parameter array.

- **Card** (500, `clamp(1.6rem, 5vw, 2.6rem)`, 1.25): the front and back, largest type on any screen by at least 1.3 over the deck name.
- **Headline** (600, `--text-2xl`): the single `h2` every view carries and focus lands on.
- **Body** (400, `--text-sm`, 1.6): leads, notes and table cells, capped at 64ch. **Label** (600, `--text-xs`, 0.1em, uppercase): block headings and table headers only.

**The Figure Over Label Rule.** Where a number is the point (stats counters,
intervals, the browse table) the figure takes `--text-2xl` and its label
`--text-sm`, tabular throughout.

## 4. Elevation

Flat, with tonal depth. The modal and the deck overflow menu are the exceptions:
a popover needs an opaque ground, so both take a shadow over a mixed opaque fill.

## 5. Components

- **Buttons.** `--radius-sm`. Primary is teal on the ground at 44px, one per screen; ghost and secondary sit at 36px and are never the first thing.
- **Rows, not cards.** The library is a `<ul>` of rows on `--border-subtle`, one primary and one overflow menu each. Nested cards do not exist here.
- **Panel.** `.rp-panel`, capped at 780px: a form is prose plus controls, and prose has a measure. No hover reaction. **Table.** Sticky header past 24 rows, alternating rows at 1.8 percent, tabular figures, the whole thing a named `role="region"` with `tabindex="0"`.
- **Charts.** The Neorgon Viz Kit draws every one. Never hand-roll a chart; tune type from `css/style.css`, scoped to `.rp-charts`.

## 6. Do's and Don'ts

- **Do** put every learner-facing string through `UI` in `js/utils.js` as `{en, es}`, and give each view one `h2` that focus can land on.
- **Don't** edit a vendored kit file (`neorgon-*.css/js`, `js/neokeys/`, `js/viz.js`); fix `packages/neorgon-ui/` and re-sync, and never redeclare a CDN token locally.
- **Don't** write an em dash, or any of the fleet's five banned words. Both lists live in this project's `CLAUDE.md`, which points at PROJECTS.md and CONTRACTS C9.3, and `scripts/no-em-dash.py` enforces the first.
