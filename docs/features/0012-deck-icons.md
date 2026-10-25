# 0012 — Deck icons

**Status:** Approved 2026-10-25 — built; look approved from screenshots ("ship both", 2026-10-25)
**Owner decisions:** D1 the plan as shown in the demo
(https://claude.ai/artifact/Pe1LxxyV6jnyYwas1CgCW7): 100 icons from the
owner's ten sheets; a suggestion from the deck's colours; chosen when a
deck is imported and changeable later (owner, 2026-10-25)

## What the player sees

Every deck has a round icon:

- **In the Deck Depot list**, beside each deck's name; **large in the
  deck view's header**; and **in a room**, beside the deck you chose for
  the match.
- **After an import**, the new deck opens with "Choose an icon": the
  suggested icon already selected, and the ten sheets as tabs (Colours,
  Pairs, Strategy, Plans, Engines, Permanents, Creatures, Families,
  Families 2, Utility). "Use this icon" keeps the choice; "Later" keeps
  the suggestion.
- **"Change icon"** on the deck view opens the same grid at any time.
- **A deck shared with you** shows its owner's icon; only the owner can
  change it.

Example: you import "Goblin Rush", all red. It opens with the Fire icon
selected. You pick the Goblin from Families instead; the Deck Depot list
shows the Goblin beside "Goblin Rush" from then on.

**The suggestion**, from the colours of the deck's cards (each card's
colour identity, as the rules engine reports it):

| Deck | Suggested |
|---|---|
| one colour | Sun (white), Water (blue), Skull (black), Fire (red), Tree (green) |
| two colours | that pair's icon from the Pairs sheet: white-blue Wings and shield, blue-black Eye, black-red Demon, red-green Vine axe, green-white Antlers, white-black Scales, blue-red Storm, black-green Mushroom skull, red-white Sun sword, green-blue Leaf wave |
| three or more | Five gems |
| colourless | Diamond |

A deck imported before this shows its suggestion as soon as its colours
are known (asked once in the background, as spec 0008's card faces
were); until then, the Diamond.

## Scope

In: the Deck Depot (list, deck view, import) and the deck picker in a
room.

Out (and why):
- **Uploading your own icon** — the owner's set of 100.
- **Showing your deck's icon to the other player** — they never see your
  deck (Amendment 10's rule); its icon would hint at it.
- **The game screen** — not asked for.

## Rules and boundaries

- **Hidden information**: an icon is shown only where the deck's name is
  shown to the same person: its owner and people it is shared with.
- **Forge as upstream**: colours come from the rules engine with each
  card at import, like a card's category and back face (ARCH-001); the
  Deck Depot derives nothing from card names.
- **The art** is the owner's, cut from the ten sheets into 100 icons
  (256 px WebP, about 24 KB each), shipped like the avatars and served
  only to signed-in players. Not card artwork (GIT-001).
- **Layout**: the icon sits where the demo shows it; nothing else moves.

## How it works (for the build)

- Worker: each resolved card also carries its colour identity ("WR").
- Database: `deck_entry.color_identity`; `imported_deck.icon` (one of
  the 100 names, or null for the suggestion) and `colors_checked`, with
  the background fill asking the worker once for older decks.
- Server: a deck's summary gains `colors` and `icon`;
  `PUT /api/decks/{id}/icon` (owner only, a name from the set or null);
  the set of names is checked against the shipped files by a test.
- Frontend: the icon set and the suggestion rule in one module; the
  picker; the icon in the list, view header and room picker.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0012-A | The worker reports colour identity; a deck's colours are the union of its cards' | worker + server test |
| F-0012-B | Suggestion table, every row | unit test |
| F-0012-C | Only the owner may set an icon; only names from the set; null clears it; a shared deck shows the owner's icon | server test |
| F-0012-D | Older decks get their colours in the background | server test |
| F-0012-E | Import, choose, change; the list, header and room show the icon | browser |
| F-0012-F | Desktop and phone screenshots approved | owner |

## Amendments

None.
