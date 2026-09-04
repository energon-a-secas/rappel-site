# data/

Rappel's built-in deck library. Everything here is **generated**, not authored.

```
data/
  decks/index.json        the catalog. A static site cannot list a directory.
  decks/<id>.json         one deck, format neo-deck/1 (CONTRACTS C4)
```

## Where these come from

They are emitted by `projects/runcible-site/tools/build-decks.mjs`, from the
Runcible corpus, and written twice from one source: once here and once into
`runcible-site/books/japanese/decks/`. Same generator, so the two copies cannot
drift. To change a deck, change the corpus and re-run that script. Editing a
file here by hand is a change that disappears on the next run.

That script lives in the other project because the corpus does: the vocabulary,
the kanji table and the sentences it reads are all under
`runcible-site/data/`. Rappel itself has no data step and needs none.

```bash
cd ../runcible-site
node tools/build-vocab.mjs
node tools/build-kanji.mjs
node tools/build-sentences.mjs
node tools/build-decks.mjs
node tools/validate-corpus.mjs
```

## The catalog

`decks/index.json` exists because a static origin cannot list a directory. One
entry per deck, with the id, the relative `file`, the `{en,es}` name, the note
and card counts, the SPDX licence and the `screen` flag. It is the only file
here Rappel needs to fetch before showing a library.

## Card identity

`noteId + ":" + templateId`, a string, never an index (C4.2 rule 1). The
generator derives note ids from the corpus selection order, so re-running it
over the same corpus emits the same ids. **That string is the review ledger's
foreign key.** An id that moves between runs discards a person's study history
on every card it touches, and nothing anywhere would report it.

## Licences, and the acknowledgement

**Derived data inherits the source licence. It is not this repository's MIT.**

| Deck | Derived from | Licence | On-screen acknowledgement |
|---|---|---|---|
| `jp-first-words`, `jp-grammar-words` | JMdict | CC BY-SA 4.0 | required |
| `jp-kanji-grade1` | KANJIDIC2 | CC BY-SA 4.0 | required |
| `jp-sentences-basic` | Tatoeba | CC BY 2.0 FR | required |

Every deck carries its own `licence`, `attribution`, `source` and `screen`
fields at the top level, which is what C4 froze, plus a fuller `_licence` block
with the provenance and the generation stamp.

`screen: "required"` is not decoration. EDRDG's licence asks for the
acknowledgement "on each screen display, e.g. in the form of a message at the
foot of the screen or page", so Rappel renders `attribution` below the review
area whenever the loaded deck declares it, and inside the embed attribution bar
in embed mode (CONTRACTS C11.3). A link to a modal is not the acknowledgement.

## Before you commit anything in here

```bash
cd ../runcible-site && node tools/validate-corpus.mjs
```

It exits 0, or it exits 1 and names the file, the record and the field. Nothing
runs it for you: it is not in root `make smoke`. Running it is part of the
definition of done for any change to a deck.
