# 0029 — Player plates in the game's right-hand column

**Status:** Built in 1.16.0
**Owner decisions:** 2026-10-28 — the "Plates" look from the canvas, with
the P1 grid of bigger zone boxes (round 2 of the canvas).

## What the player sees

Each player in the right-hand column sits on a raised plate. Across the
top: the picture with its Hall ring (spec 0011), the name in tall capitals
with the Champion's Belt under it, and the life total in a red banner on
the right. Under that, a two-by-two grid of tiles: an icon and a big count
side by side, the word underneath. The opponent has Hand, Library,
Graveyard and Exile; you have Library, Graveyard and Exile, the last
spanning the row. Whose turn it is: the plate's top edge and the banner's
outline turn gold. Who may act: the dot before the name, as today.

Pat casts a burn spell at RudeLeft: RudeLeft's banner glows as a target,
and when Pat's spell asks for a player, the banner is what you click.
Clicking Graveyard, Exile, or the opponent's Hand opens it, as today.

## Scope

In: the two plates (the head, the banner, the tiles, the counters and
mana line under the tiles); the points cards fly to and from (life,
library, graveyard, exile) moved to where the plates draw them.

Out: the act button and the waiting box between the plates (unchanged);
the board.

## Rules and boundaries

- Nothing hidden is shown: the opponent's hand is a count, as today.
- Every word a tile drops stays for screen readers (`aria-label`) and in
  the tile's title.
- The life banner keeps its job as a target: choosable, targeted and
  active classes and `data-object-id="player:N"` stay on it.
- The rail is still drawn on a 900-pixel column and scaled; the motion
  anchors are read from the same numbers the plates are drawn with.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0029-A | The plates show name, Belt, Hall ring, life and the zone counts; the role words are for screen readers only | browser |
| F-0029-B | Cards fly to and from the tiles and the banner where they are drawn (anchors match the page) | browser (measured) |
| F-0029-C | Graveyard, exile and the opponent's hand still open; the banner can still be chosen as a target | browser (existing match tests) |
| F-0029-D | Two-digit counts and long names fit at computer and laptop sizes | browser + owner screenshots |

## Decisions for the owner

All taken 2026-10-28 (see the top).

## Amendments

None.
