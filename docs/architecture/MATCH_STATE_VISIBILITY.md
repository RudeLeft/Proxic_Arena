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
forwards each player's snapshot unchanged and never re-filters it
(§6.42); a card a viewer may not see is **never sent**, not even blanked.

Two Forge checks are asked for **every card, for every viewer**, and a
name or picture is read only when both pass:

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

**No library contents are ever in a snapshot** -- a count only, for every
player including the owner. A library card is named only where Forge
shows it to one player: the options of a search or a scry (sent only to
the player asked) and a reveal notice (below). A searched card is
followed by id from the library to its destination (P6-H, P6-K).

## Reveals and known hidden cards

When Forge reveals cards to a player ("look at the top card",
"reveal your hand", a tutor's reveal) the worker turns Forge's own
`reveal` call into a **notice for that player only**, in Forge's
wording ("Looking at your library: ...", "Looking at RudeLeft's hand:
Plains"). Delver of Secrets' look reaches its controller before the
"Reveal?" question (P6-J). How a reveal is drawn is Phase 7's.

## Face-down objects

A morph cast face down (Willbender), across 60 frames (P6-I,
`scripts/check-face-down.py`, `e2e/match-face-down.spec.ts`):

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

A picture follows visibility exactly: a viewer may fetch only the
artwork its own snapshots referenced, during that match
(`MATCH_ASSET_AUTHORIZATION.md`). A hidden card has no reference, so
there is nothing to ask for.

## Notices

Forge's messages to a player -- reveals, coin flips ("You win the flip" /
"Alice wins the flip"), a game restart, chosen values -- are per seat,
in Forge's wording (`MessageUtil`), and checked never to name a card
only in an opponent's hand (P6-G).
