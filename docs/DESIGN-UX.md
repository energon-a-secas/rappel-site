# Rappel: design and navigation direction

Written 2026-09-04 from the impeccable process (product register, Restrained colour strategy), the
code as of this date, screenshots at 390, 820 and 1280 (`/private/tmp/claude-501/rappel-shots/`)
and a keyboard-only session. The engine is frozen; everything here is presentation and navigation
in `index.html`, `css/style.css`, `js/render.js`, `js/render-session.js`, `js/events.js`,
`js/keys.js`, `js/stats.js`, `js/utils.js`. `PRODUCT.md` still carries three `CHANGE ME` markers
and there is no `DESIGN.md`; this document is the interim answer to both.

**Scene.** A learner drilling kana on a phone at 23:00 with the room dark, and the same person at a
laptop beside a textbook in the afternoon. The fleet ground (`base.css`, `#040714`) is a given, and
the night scene is the one that has to work: quiet surface, one large thing to read, one obvious key.

## 1. What the screenshots and the keyboard walk say

**Plain.** The library is four identical cards, each with six equal buttons, a saturated red
`Forget` on every row, and three pills that carry no meaning: `0 due` is drawn in the accent even
when it is zero (`css/style.css:734`), `217 new` and `225 cards` sit at the same weight, the version
stamp reads as noise. The header kit paints the hub magenta over a teal site (`index.html:76` has no
skin). The review card is a wide box with the prompt in its top-left corner and 180px of nothing
below it (`style.css:763`); `Show answer` floats 60px under it; the four grades are a second, equal
row of boxes; the Hard warning repeats under every single card (`render-session.js:86`). The results
screen is a heading and one sentence.

**Two behaviours that are bugs, not taste.**

- `renderCard()`'s "Session finished" branch is unreachable from either grade path: when
  `currentCard()` is null, `events.js:115-120` and `events.js:275` both `endSession()` and leave. It
  renders only when a saved session is resumed with nothing due. Every real session ends with a jump
  to the library and a 2.6 second toast (mouse), or, by keyboard, a blank `#viewRoot` with no toast
  (`cram-end-keyboard-1280.png`). The summary string `sessionSummary` has never been seen by a learner.
- Twelve learner-facing strings bypass the dictionary: the `Forget` confirm (`events.js:49`), six
  toasts in `events.js:68,119,133,171,194,217`, `Parameters rejected` (`:159`), the audio failure
  (`:338`), and the three boot toasts in `boot.js:44,50,58`. All English only.

**Keyboard-only session (1280).** Focus lands on `body` after: Enter on `Review` (the whole view is
`innerHTML`), every reveal, every grade unless the next card is typed, `End`, and the cram end.
`render()` only ever focuses `.rp-typed` (`render.js:62`). The rail ignores arrow keys and sets
`aria-current="false"` on the inactive buttons (`render.js:47`). `Import` and `Export ledger` are tab
stops twice (header and toolbar). Four decks cost 24 tab stops before the shelf. `ArrowRight` on a
grade does nothing; the digits work through NeoKeys and the visible state never shows which one fired.

**Not announced.** The verdict `role="status"` is created together with its text on each repaint
(`render-session.js:93`), which screen readers do not reliably read; the toast is created on first use
with its text already set (`utils.js:299-308`), so the first toast is silent; the progress bar has no
name (`render-session.js:32`); the `x of y` count, the new card front, a view change and the session
end are plain text swaps with no live region; the stats screen has no `h2` (only the `h1` in the
header); the attribution `aside` has no name. Nothing is mouse-only, but the card lift and table row
highlight are hover-only decoration, and the `space` keycap shows on touch screens.

**Targets and contrast.** Every `.btn--sm` is 36px tall (34 controls under 44px on the library at
390; `End` in a session). The retention slider track is 16px. Contrast is clean: muted text about
6:1 after alpha, accent pills 10.8:1, grade ink 8:1, amber verdict 12:1. Reduced motion is honoured
globally (`style.css:665`), so new motion only has to stay under that rule.

## 2. Direction: a library that reads as designed

Rows, not cards. `.rp-deck` becomes a `<li>` in a `<ul role="list">`, rows separated by
`--border-subtle`, no border box, no hover lift. Each row is one line of hierarchy:

| slot | content | type |
|---|---|---|
| name | deck name, `--text-lg` 600 | version moves to the browse header |
| readout | one sentence that means something (below) | `--text-sm`, tabular numerals |
| primary | `Study` (44px, `.btn--primary`) | secondary style when nothing is ready |
| overflow | one `⋯` button, `aria-haspopup="menu"` | Cram, Browse, Deck JSON, TSV, Forget |

The readout replaces the three pills. Only one of the three states is drawn, and the accent is spent
only on the first: `deckReady` in `--accent-bright` when `due + new > 0`, `deckQuiet` muted when the
deck is scheduled but nothing is due, `deckUntouched` muted when no row exists. `due` and `new` are
kept as a second muted figure (`readoutSplit`) only when both are non-zero. `Forget` moves into the
menu, so the page has one red thing at most, and only after a person opens a menu.

The built-in shelf uses the same row with `Add to my decks` as its primary; the dashed border goes.
The `Card map` sentence and the account line move under a small `Storage` heading at the foot. The
header takes `data-header-skin="custom"` with teal stops declared under the kit's exact selector
(`packages/neorgon-ui/header/README.md`, section `custom`), derived from `--accent` with `color-mix`.

## 3. Direction: a review surface with presence, hierarchy and rhythm

One column, `max-width: 720px`, centred in `.shell__main`. Vertical rhythm from the top:
bar → 12px → progress (4px) → 24px → card → 16px → the one control → 32px → grades → 12px → note.

- **Bar.** `grid-template-columns: 1fr auto auto`: deck name (truncates), count `4 / 25` in tabular
  numerals, `End session` at 44px. At 390 nothing wraps.
- **Card.** `min-height: 280px` (220 at 390), `padding: var(--space-8)`, front centred both ways,
  `font-size: clamp(1.6rem, 5vw, 2.6rem)`, `line-height: 1.25`. Card copy is the largest type on the
  page by a ratio of at least 1.3 over the deck name.
- **Reveal.** The rule and the back appear with a 160ms opacity ease-out (gated by the existing
  reduced-motion rule). The back keeps `--accent-bright`. The verdict becomes a chip under the back
  with a glyph (`✓` / `✗`) as well as colour, so it survives WCAG 1.4.1. Hit and miss colours are
  declared once in the `:root` extras block as `--ok` and `--warn`, beside `--danger`, instead of the
  four hex literals at `style.css:798-822`.
- **Control.** For basic and cloze cards the `Show answer` button sits directly under the card, full
  width at 390. The `space` keycap is hidden under `@media (hover: none)` and the label reads
  `tapToReveal` there. Typed cards keep the input inside the card; choice cards need no button.
- **Hard warning.** Shown once per session under the grades, then attached to the Hard button by
  `aria-describedby` so it is read on focus and not repeated on screen 224 times.

**The four grades as a keyboard-first control.** One tab stop, `role="radiogroup"` with the label
`gradesLabel`, four `role="radio"` buttons and a roving `tabindex`. After reveal, focus lands on
`Good`. Left/Right move, `1` to `4` select directly (NeoKeys keeps those), `Enter` or `Space` commits.
Visible pressed state: the box fills with `color-mix(in srgb, <grade colour> 18%, transparent)` for
one frame before the repaint so a digit press is seen. Each button reads name, then interval, and the
gloss stays on desktop only; the name and the gloss are what `keys.js` already puts in the `?` sheet.

**Session end.** Both grade paths, mouse and keyboard, stop leaving the view when the queue empties.
`renderCard()` shows the summary (`sessionFinished`, `sessionSummary`, `nextReady` or `nothingDue`)
with focus on its heading, and `Back to decks` is the primary. The library toast goes away.

## 4. Navigation model

- **Landmarks.** `header` (banner, kit), `nav aria-label=navLabel`, `main`, the session `section`
  labelled by the deck name, the grades group, `aside aria-label=attribLabel`, `footer` (kit). Every
  view has exactly one `h2` with `tabindex="-1"`; stats gains `stats` as its `h2`.
- **The rail is a nav with `aria-current`, not a tablist.** The views are whole screens with their
  own headings, not panels beside a tab strip. Keep the buttons, remove `aria-current` from inactive
  items rather than setting it to `false`, add a roving `tabindex` so the rail is one tab stop with
  Up/Down and Home/End, and activating an item moves focus to the new view's `h2`.
- **Deck rows.** Roving `tabindex` on the `Study` button of each row; Up/Down move between rows, Tab
  leaves the list. The overflow menu is a `.header-menu`-style list: Down opens, Escape closes and
  returns focus to `⋯`, `Forget` confirms with `forgetConfirm` naming the deck.
- **Focus after every repaint.** `render()` grows a `focusAfter` argument resolved after
  `innerHTML`: view change → `h2`; session start and every new card → the card region
  (`tabindex="-1"`, `aria-label` from `cardRegion`) or `.rp-typed` for typed; reveal → `Good`;
  session end → the summary `h2`; `End` → the library `h2`. Nothing ever lands on `body`.
- **Live regions.** One `<div id="announce" role="status" aria-live="polite">` in `index.html`,
  present from load, written one frame after each repaint. It announces `announceFront` on each card,
  the verdict, `gradedNext` after a grade, `progressText` every five cards, `sessionDone`, and every
  toast (`showToast` writes there and keeps its visual). The progress bar gets `aria-label` and
  `aria-valuetext` from `progressText`.
- **Skip links.** Keep `Skip to content` pointing at the view `h2`, and during a session add
  `skipToCard` as the first link, pointing at the card region.
- **Touch targets.** Primary actions per screen at 44px: `Study`, `Show answer`, the grades, `End
  session`, `Save`, `Import` in the dialog. Secondary `.btn--sm` may stay 36px with 8px spacing.
  The slider gets a 44px hit area with `padding-block`.
- **Reduced motion.** The reveal fade, the grade press fill and the menu open all sit under the
  global 0.01ms rule; nothing animates layout.
- **Language.** `announce` text and every string above go through `UI` as `{en, es}`, including the
  twelve that bypass it today.

## 5. New strings

```js
navLabel:       { en: 'Sections', es: 'Secciones' },
attribLabel:    { en: 'Licences', es: 'Licencias' },
study:          { en: 'Study', es: 'Estudiar' },
deckReady:      { en: '{0} to study now', es: '{0} para estudiar ahora' },
readoutSplit:   { en: '{0} due, {1} new', es: '{0} pendientes, {1} nuevas' },
deckQuiet:      { en: 'Nothing due. Next card in {0}.', es: 'Nada pendiente. Siguiente tarjeta en {0}.' },
deckUntouched:  { en: 'Not started. {0} cards.', es: 'Sin empezar. {0} tarjetas.' },
moreActions:    { en: 'More actions for {0}', es: 'Más acciones para {0}' },
storage:        { en: 'Storage', es: 'Almacenamiento' },
forgetConfirm:  { en: 'Forget "{0}" and every review of it in this browser?', es: '¿Olvidar "{0}" y todos sus repasos en este navegador?' },
endSession:     { en: 'End session', es: 'Terminar la sesión' },
tapToReveal:    { en: 'Tap to reveal', es: 'Toca para ver la respuesta' },
skipToCard:     { en: 'Skip to the card', es: 'Ir a la tarjeta' },
cardRegion:     { en: 'Card {0} of {1}', es: 'Tarjeta {0} de {1}' },
announceFront:  { en: 'Card {0} of {1}: {2}', es: 'Tarjeta {0} de {1}: {2}' },
progressText:   { en: '{0} of {1} answered', es: '{0} de {1} respondidas' },
gradedNext:     { en: 'Marked {0}, back in {1}.', es: 'Marcada {0}, vuelve en {1}.' },
gradesHint:     { en: 'Arrow keys move, 1 to 4 grade, Enter confirms', es: 'Las flechas mueven, 1 a 4 califican, Enter confirma' },
sessionDone:    { en: 'Session done. Every card that was due has been seen.', es: 'Sesión terminada. Se han visto todas las tarjetas pendientes.' },
ledgerSaved:    { en: 'Ledger downloaded, card state and full review log', es: 'Registro descargado, estado de las tarjetas y registro completo de repasos' },
settingsSaved:  { en: 'Saved. New intervals use these from the next answer on.', es: 'Guardado. Los nuevos intervalos usan estos valores a partir de la siguiente respuesta.' },
settingsReset:  { en: 'Back to the 21 published FSRS-6 defaults', es: 'De vuelta a los 21 valores predeterminados publicados de FSRS-6' },
paramsRejected: { en: 'Parameters rejected: {0}', es: 'Parámetros rechazados: {0}' },
imported:       { en: 'Imported {0} notes into "{1}"', es: 'Se importaron {0} notas en "{1}"' },
restored:       { en: 'Restored {0} card rows and {1} log entries', es: 'Se restauraron {0} filas de tarjetas y {1} entradas del registro' },
audioMissing:   { en: 'That audio file is not in this deck folder', es: 'Ese archivo de audio no está en la carpeta del mazo' },
srcNotHttps:    { en: 'A ?src= deck must be an https URL', es: 'Un mazo ?src= tiene que ser una URL https' },
fetchFailed:    { en: 'Could not fetch that deck. It may be a CORS or a network problem.', es: 'No se pudo descargar ese mazo. Puede ser un problema de CORS o de red.' },
inlineBad:      { en: 'The deck in that link did not decode', es: 'El mazo de ese enlace no se pudo decodificar' },
```

## 6. Order of work

1. Session end reachable from both paths, focus never on `body`, the `announce` region, the twelve
   strings. This is the accessibility half of the owner's ask and it touches no engine file.
2. Grades as a radiogroup, rail and deck-row roving `tabindex`, skip link, 44px primaries.
3. Library rows with the readout, overflow menu, custom header skin.
4. Review surface rhythm, centred card, verdict chip, once-per-session Hard note.
5. Re-run the headless walk in `/private/tmp/claude-501/.../rappel-shots.js` and confirm the
   `activeElement` log never reads `body` and every toast is preceded by an `announce` write.
