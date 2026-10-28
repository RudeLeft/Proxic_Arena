# 0022 — Send decks and token pictures from the Deck Builder

**Status:** Approved 2026-10-27 — built in 1.11.0
**Owner decisions:** S1 a linked computer sends a deck straight to the
Deck Depot, with no file saved on the way; S2 a deck name already in your
Deck Depot is not replaced: the deck goes in as a new deck and you are
asked for a new name; S3 the Deck Depot's upload box is removed and
replaced by a link to the Account page, so only a linked Deck Builder
adds decks; S4 a token picture matches a token by name only, the
controller's deck first, then the other player's; S5 the Deck Builder
warns about a token your cards make that the deck has no picture for,
under the deck and in the export window, and never stops the send; S6
no zip option anywhere in the Deck Builder; S7 the Deck Builder holds no
Forge knowledge: every rule it applies comes from Arena (all owner,
2026-10-27). Approved 2026-10-27 with the plan and the export-window
canvas.

## What the player sees

- **In the Deck Builder** (its own project): a **Proxic Arena Export**
  button beside Print Deck opens one window. It shows the link, the
  deck's name on Arena, the deck check, the tokens your cards make, and
  **Send to Arena**. The deck lands in your Deck Depot.
- **Deck Depot:** the "Drop a deck package here" box is gone. In its
  place: "Decks come from the Proxic Deck Builder", with a button to the
  Account page where a computer is linked.
- **A deck's page:** a Tokens band under the cards shows the token
  pictures the deck brought.
- **In a game:** a token wears a picture a deck brought for it.

Example: Pat's Ape Tribal brings an Ape token picture. Pat casts Pongify
on Sam's Llanowar Elves. Sam gets a 3/3 Ape. Sam's deck has no Ape
picture, so the Ape wears the one Pat's deck brought. A Goblin token
from Krenko, which nobody brought a picture for, plays as Arena draws
tokens today.

## Scope

In: the three Deck Builder routes below, token pictures in a package,
stored with the deck and shown in play; sending only pictures Arena
lacks; the printings order in the deck rules; the Deck Depot box, the
Tokens band and the Account panel's words.

Out (and why): replacing a deck in place on re-send (S2: a new name each
time); matching a token by power, toughness or colour (S4, can be added
later); a token that is a copy of a card (Populate, Cackling Counterpart)
wearing that card's picture (a separate question: it is not a token
picture); any change to what import accepts as cards.

## The Deck Builder routes

A linked computer's device token (spec 0021) opens these and nothing
new besides. Each answers a stranger the gate's own "Sign in to
continue", like the deck rules.

| Route | What it does |
| --- | --- |
| `GET /api/deck-builder/deck-names` | Your own decks' names, so the window can say a name is taken before you send |
| `POST /api/deck-builder/pictures/known` | Up to 300 picture hashes in; back, the ones already in a deck you own, so those need not be sent again |
| `POST /api/deck-builder/decks` | One deck package and an optional typed name; imported exactly as the browser's import, owned by the token's account; answers the same (created, already have this deck, name taken, the problems) |

The browser import route stays for Arena's own tests; nothing on screen
uses it.

## The package

Two additions, both optional, so every package that imports today still
does.

- **Token section.** A decklist line `// Tokens` starts it; each line
  after it is a token card, `1 Ape [TMH1:2]`, with its picture filed as
  any card's. Token lines are pictures only: never resolved, never
  counted toward 60 to 65, never in the copy limit. They are stored with
  the deck as its token pictures.
- **Pictures already sent.** A root `pictures.json` maps a picture's
  file name to its SHA-256 for pictures left out. Each must already be
  in a deck the sender owns; one that is not refuses the import
  (`PICTURE_NOT_HELD`), and the Deck Builder sends it in full.

## Token pictures in play

Forge names a token "Ape Token" (most tokens) or by its own name
("Avacyn"). A token matches a token picture by its name, or its name
without " Token", ignoring case: from the controller's deck first, then
the other player's. No match: no picture, as today. A token is on the
table for everyone, so a picture of it reveals nothing hidden; a viewer
may fetch it once shown, as for any card (§6.129).

## The deck rules: printings in Forge's order

Each card's printings are listed in the order Forge itself prefers them
(its `CardArtPreference`, newest core, expansion and reprint release
first), asked of Forge, never a copy of its rule. The Deck Builder keeps
the deck's set when Arena has it and otherwise takes the first it can
picture. The format revision changes, so every linked computer fetches
the new document.

## Rules and boundaries

- **§6.128** is amended: a token wears a picture a deck in the match
  brought for it, matched by name; no lookup outside the match.
- **ARCH-001, VEND-005**: Forge is asked only through the worker; the
  Forge pin does not change.
- **AUTHENTICATION.md** is amended: the device token opens the three
  routes above besides the deck rules. It still cannot play, join, share,
  delete or change the account.
- **FMT-002**: token lines never reach legality; import's checks of the
  cards are unchanged.
- **ISO-002**: the Deck Builder's side is built in its own project.

## Acceptance tests

| ID | Test | Evidence |
| --- | --- | --- |
| F-0022-A | A deck with an Ape token line imports; the token is not counted and not resolved | unit |
| F-0022-B | Pongify's Ape wears Pat's Ape picture on both players' screens; a Goblin token has none | real game |
| F-0022-C | Controller first: when both decks bring an Ape picture, each player's Ape wears its controller's | unit |
| F-0022-D | Device routes: token 200, no token 401, a token on any other route 401 | route test |
| F-0022-E | A package naming a picture the sender does not hold is refused; one they hold imports without it | unit |
| F-0022-F | Taken name: `DECK_NAME_TAKEN`; same package again: `DUPLICATE_PACKAGE` | route test |
| F-0022-G | Printings come in Forge's order: Lightning Bolt's first printing is Forge's own choice | real worker |
| F-0022-H | The Deck Depot shows the Account link, not the upload box; a deck's page shows its Tokens band | Playwright |
| F-0022-I | A real Deck Builder export lands in the local and the live Deck Depot | owner |

## Decisions for the owner

All made 2026-10-27 (S1-S7, above).

## Amendments

- **2026-10-27, while building (no change to what was decided).**
  - The order is Forge's "latest art, core, expansion and reprint only"
    preference, asked of Forge by name. Measured on the running worker,
    every edition reads as a custom set today: the worker hands Forge its
    editions folder twice, the second time as custom editions, and Forge
    lays the custom copy over the real one. So the order is, in effect,
    newest release first (Lightning Bolt: Secret Lair first), which is
    also what the Deck Builder's own ranking came to before. Loading the
    editions once would make the core-first order real; it changes how
    Forge sees every edition, so it is a separate change, not made here.
  - Spec 0012 opened a just-imported deck with "Choose an icon". A deck
    now arrives from the Deck Builder, not from the Depot page, so that
    question went with the upload box: the suggested icon shows until
    one is chosen from Change icon.
  - The deck's page lists the token pictures it brought. Which tokens a
    deck's cards make, and so which are missing, is the Deck Builder's
    warning (S5); Arena does not guess it.
  - The browser tests send packages through the import route with the
    page's own session, so the import they test is still the real one.
- **2026-10-27, after release (evidence).** CI's skip gate refused the
  first 1.11.0 build because `DeckBuilderApiTest` needed the real Deck
  Builder export, which is gitignored; it now builds its own legal
  package and runs on CI (commit 279e015). F-0022-I and F-0022-B: the
  owner sent a deck from Deck Builder 1.3.1 to the live Deck Depot and,
  in a real game, the Ape token wore the picture the deck brought
  (owner, 2026-10-27).
