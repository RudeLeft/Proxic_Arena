# 0008 — Deck Depot: zoom, card size, phone fixes and a clean-up

**Status:** Approved 2026-10-24 (from the mockup on the lobby canvas) — built
**Owner decisions:** Z1 click to zoom; C1 the clean-up pass; P1 phone
fixes; S1 a card size switch (owner, 2026-10-24, from the Deck Depot
review)

## What the player sees

You open your Burn deck in the Deck Depot.

- **Z1 Click to zoom.** Clicking Lightning Bolt opens it large over the
  page: the full-size scan, not the small copy the grid uses, with its
  name and "4 copies" under it. **←** / **→** (keys or buttons) step to
  the previous and next card in the deck, in the order the bands show
  them; **Esc**, the close button or a click outside closes it, and
  focus goes back to the card you opened. A card that turns over (Delver
  of Secrets) has **Turn over**, which shows its back face; a card with
  no picture shows its name on a plain card, as the grid does. On a
  phone the picture fills the width, with the buttons under it.
- **S1 Card size.** Above the cards: **Small · Medium · Large**. Medium
  is about one and a half times today's size; Small is today's. The
  choice is remembered on this computer.
- **P1 Phone fixes.** On a phone, View takes you straight to the deck
  (the cards are below the library today, and nothing moves), and the
  library folds to one line, "Deck library · 3 ▸", while a deck is open.
- **C1 Clean-up.** Things a player notices:
  - Re-importing a deck you have says it once ("You already have this
    deck: Burn"), not twice.
  - Seven refusals get plain headings like the rest: a file inside is
    too large; the package unpacks too large; a compression it cannot
    read; the decklist is too long; it is not a file; the import failed
    on the server; and the race case, which now uses the same code as
    an ordinary duplicate.
  - A Delete that fails says so on the row; a library that cannot load
    says "Your decks could not be loaded" with Try again, not "Nothing
    imported yet"; a View that fails says the deck could not be opened.
  - Clicking View on two decks quickly always shows the last one
    clicked, and "Shared with" never shows the previous deck's list.
  - The share list's box is no wider than it needs to be.

  And things only the code notices: the unused import-state type goes;
  the server keeps one "my decks / shared with me" query, not two; deck
  ids are checked by the one helper everywhere; the five lobby style
  rules left over from 0006 go.

## Scope

In: the Deck Depot page and the deck picture route.

Out (and why):
- **Find in deck and a text list view** -- not chosen this time.
- **Mana curve, colours, card text** -- the server keeps no card data of
  its own (ARCH-001); that needs Forge asked per card, a spec of its own.
- **Zoom on the battlefield** -- the game already has its close look.
- **Building or editing decks** -- still Proxic Deck Builder's job.

## Rules and boundaries

- **Pictures stay private (Phase 4 Amendments 2-3):** the full-size scan
  is served by the same deck picture address with `?size=full`, under
  the same check (you may see the deck, and the picture is that deck's),
  exactly as the game's close look already does for a match. The check
  also learns a deck's back faces (`deck_face_art`), which are stored at
  import today but cannot be fetched; nobody else's picture becomes
  reachable.
- **Forge as the card authority (ARCH-001):** which face is a card's
  back is Forge's answer, asked at import the way its category already
  is -- never guessed from file names. Decks imported before this are
  filled in the background by the same one-deck-at-a-time fill that
  sorted categories; until a deck is filled, its cards simply have no
  Turn over.
- **GIT-001:** no card art is added to the repository; tests use the
  generated CI package.
- **No layout geometry change** outside the Depot. The zoom is an
  overlay; the card size switch changes only the grid's card width.

## How it works (for the build)

- Server: `GET /api/decks/{id}/assets/{asset}?size=full` serves the
  original; `mayViewAsset` also accepts the deck's `deck_face_art`. The
  worker's card resolution reports each card's back face name; a new
  `deck_entry.back_face_name` (migration V020) holds it, filled at import
  and by `DeckCategoryFill` for older decks; the deck detail gains
  `backArtUrl` where that name has a picture. The library comes
  from `DeckAuthorization` (one query); `deckIdOrNull()` everywhere.
- Frontend: a `CardZoom` dialog (focus kept inside, Esc, arrows); the
  size switch in local storage (wrapped, a default when it is
  unreadable); View ignores a stale answer; the share panel keyed by
  deck; headings for the seven codes; failures shown.

## Tests

- Server: `?size=full` returns the original and the default the small
  copy; a back face is served to the owner and a recipient and refused
  to a stranger (404); a picture from another deck is still refused.
- Unit: the zoom's order across bands; the stale-View rule; headings
  for every import code the server can send (checked against the list).
- Browser: open a card, step with the arrow keys, Turn over on a
  two-faced card, Esc returns focus; the size switch survives a reload;
  on a phone View brings the deck into view; a failed delete is shown.
- Screenshots at 1280, 1600 and on a phone for the owner before it ships.
