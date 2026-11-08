# Match state visibility

PHASE_06 §6.179. What each player is sent, and why. Written from
`forge-worker/.../game/ViewerSnapshot.java`, `MatchController.java`
and the checks that ran against real games. **Forge decides what a
player may see; nothing here substitutes a simplified rule** ("hand
hidden, battlefield visible" is the version §6.43 forbids).

---

## Where visibility is decided

In the **worker**, per viewer, from Forge's own view layer
(`CardView`/`PlayerView`, the layer Forge's own clients use). The server
never re-filters a player's snapshot (§6.42) -- it only adds picture
addresses for the cards sent; a card a viewer may not see is **never
sent**, not even blanked.

Two Forge checks are asked for every card, for every viewer, and a name
or picture is read only when both pass -- except a face-up card the
worker passes as shown to that viewer (a reveal tray, an action report;
below), which is named without them:

```text
canBeShownTo          zone-level -- true for everything on the battlefield
canFaceDownBeShownTo  identity-level -- the only thing that governs a
                      face-down permanent
```

Phase 0A measured each half alone: the zone check alone leaked five
face-down creatures' identities; trusting the name alone blanked a
face-down card for its own controller (§6.44). A card that fails is
sent as `known: false`, name "Face-down", kind "unknown" or the
rules-public face-down characteristics, and no `art`, `face`, `faces`
or `printing`.

## Hands

- **Your hand:** every card, with identity and picture.
- **Another player's hand:** a count only (`handCount`), **unless Forge
  lets you see it** -- you control that player (Mindslaver), or an effect
  plays with hands revealed. Those cards arrive in `otherHands` with the
  owner's seat, and only those.

Proven over the traces of every Mechanics Lab regression game, round by
round: 21,236 hand-card sightings, none sent to a seat Forge had not
shown it to, including Mindslaver's master and Karn's hand exile
(P6-G, `scripts/check-hidden-hands.py`), and on the live site over 835
snapshots (P6-BK).

## Libraries

**A snapshot's library is a count only**, for every player including the
owner. A library card is named only where Forge shows it to one player:
the options of a search or a scry (sent only to the player asked), a
reveal notice (below), and an `action` report, which names a card going
to a library only to a reader who owns it or saw it revealed (Goblin
Ringleader's revealed cards going to the bottom, below). A searched card
is followed by id from the library to its destination (P6-H, P6-K).

## Reveals and known hidden cards

When Forge reveals cards to a player ("look at the top card",
"reveal your hand", a tutor's reveal) the worker turns Forge's own
`reveal` call into a **notice for that player only**, in Forge's
wording ("Looking at your library: ...", "Looking at RudeLeft's hand:
Plains"). Delver of Secrets' look reaches its controller before the
"Reveal?" question (P6-J). How a reveal is drawn is Phase 7's.

**Who did it (PHASE_09 Amendment 12).** When a spell or ability
searches a library, looks at or reveals its top cards, reorders it,
scries, surveils, puts cards from a hand on top, looks at a hand, makes
a player discard or mills, the snapshot of every seat but the one that
made the choices (below) carries an `action`: `by` (the seat that acted),
`source` (the card), `said` (the whole action in THAT reader's words:
"Pat searched their library and put a card into their hand."; for Mind
Rot, the caster reads "Pat discarded Savannah Lions and Shock.") and
`cards`. A card is described face up only when the reader may
know it -- their own card, a card now in a public zone, or one Forge
revealed to them -- and otherwise `faceDown: true, known: false` with no
name; ids are `action:<n>:<i>`, never a card's own (`ActionReports`,
`scripts/check-who-did-it.py`). `stamp` orders it against `reveal`: the
newer is shown. Amendment 13 (item 7): the seat that made the choices
(the actor; for a discard the target chooses, the target) is sent no
`action` for it, and Forge's reveal to it during that effect is neither a
`reveal` nor a "Looking at ..." notice (`ActionReports.choosingNow`): it
saw the cards in its own question.

## Face-down objects

A morph cast face down (Willbender), across 60 frames (P6-I,
`scripts/check-face-down.py`, `frontend/e2e/match-face-down.spec.ts`):

- its **controller** sees the real name, marked face down;
- the **opponent** sees "Face-down", `known: false`, and only what the
  rules make public: a 2/2 creature with its damage, counters, combat
  state and tapped state -- the face-down characteristics, never the
  real card's;
- when it is turned up, both see the real card **under the same id**.

A face-down card in exile stays "Face-down" the same way.

## Private decisions

A `DECISION_REQUEST` goes only to the player Forge is waiting on; the
opponent is told nothing about what is being asked, not even on
reconnect (§6.111). Option labels may name cards from a hidden zone
(a library search, a scry) because they go to that player alone; P6-L's
check confirms every such card is either in that player's snapshot or
named by the option's own label.

## Current characteristics

Everything describing a card is Forge's **current** state, after every
continuous effect: name and face, types, power/toughness, keywords,
counters, attachments, controller. Under Humility a Serra Angel is a
1/1 with no keywords; under March of the Machines a Mind Stone is a 2/2
artifact creature; Mind Bend turns forestwalk into islandwalk (P6-AL,
`scripts/check-characteristics.py`, `check-text-effects.py`). Nothing is
derived from printed text.

A card with several faces carries `face` (Forge's state name) and
`faces`; a Room is named for its unlocked door(s); a mutated creature
is one object (P6-AJ, P6-BF).

## Player and global state

Public, to everyone (P6-AO): life, hand/library/graveyard counts; every
counter Forge keeps on a player (poison, energy, experience, rad...);
designations (monarch, initiative, the city's blessing); the command
zone (emblems, the Ring, a dungeon **with the room its marker is in**);
how many times the Ring has tempted a player; completed dungeons;
day/night (Forge's own `isDay`). The Ring-bearer is marked on its card
for both players. Forge's internal effect pieces are not shown as
command-zone cards.

## Match assets

A picture's address follows visibility exactly: a snapshot names a
picture (`art`, `crop`, its content hash) only for a card that viewer
may identify, so a hidden card has no reference and there is nothing
to ask for (`MATCH_ASSET_AUTHORIZATION.md`). Since spec 0052 (owner D1)
the pages load it from `/api/pictures/{sha}`, which any signed-in
player may load and which keeps working after the match. The server
does not check who was shown an address; what protects a hidden card
is that its address (a content hash, which cannot be guessed) is never
sent to a player who may not see it.

## Notices

Forge's messages to a player -- reveals, coin flips ("You win the flip" /
"Alice wins the flip"), a game restart, chosen values -- are per seat,
in Forge's wording (`MessageUtil`), and checked never to name a card
only in an opponent's hand (P6-G).

**Naming a card (PHASE_09 Amendment 16).** The name-a-card question lists
the cards its player may click to name (`arrange.name.objects`): only
cards that player can already see -- on the battlefield, in a graveyard,
face up in exile -- whose names the effect allows. A face-down card, a
hand or a library is never listed, so the list says nothing the board
does not. The names and type lines a search returns are Forge's card
data for every card in Magic, not game state.

## The play log (spec 0064)

The game chat's Play log tab is written **per seat by the worker**
(`PlayLog`), from Forge's events as they happen -- never from Forge's own
game log (`GAME_LOG`, which can name hidden cards and goes to the admin
game record only). Each card in a line is named for a seat only when
Forge says that seat may identify it at that moment (both questions,
as for the board), or when it was public in the zone it just left (a
creature bounced to a hand). Otherwise the line says "a card", "a
face-down creature" ("Bob drew a card"; "Alice cast a face-down spell").
A card Forge revealed to one seat is named in that seat's line alone.

Lines wait in the worker until the next snapshot round and travel in that
round's snapshots (`playLog`), each with its revision; the page shows a
line only once the board on the table is that revision or later, so the
log is never ahead of the table, even while a board is held on screen
(HID-005). The server keeps each seat's lines for the match (the last
2,000) and sends them only to that seat's user, whole, on (re)connect.
Spectators get no log.

Proven over Mechanics Lab traces by `scripts/check-hidden-log.py` (every
card a line names is one that seat's own snapshots named; no line points
at a card in another seat's hand; every line arrives in its own
revision's snapshot), and from both seats by `scripts/check-play-log.py`
(draws, a face-down cast, a Bolt, combat), both in CI.
