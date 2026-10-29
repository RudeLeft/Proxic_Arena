# 0033 — The battlefield as lit velvet

**Status:** Approved 2026-10-29
**Owner decisions:** 2026-10-29 — from the canvas
(https://claude.ai/artifact/6FUBeeymzZZnjhvxbw7ZDT): the T4 velvet texture,
without its spotlight, with lighting L4 "Lit edge".

## What the player sees

The table keeps its green, now with a texture: a brushed velvet with a
faint sheen and a fine grain. The light is even across the middle of the
table; round the edge of the play area there is a deep inner shadow and a
faint gold rim, so the table reads as an inset tabletop. The right-hand
column is unchanged.

## Scope

In: the board's background and one edge layer around the play area.

Out: the right-hand column, the cards, the lines and effects, every other
page.

## Rules and boundaries

- Drawn in CSS (gradients and two small generated grain patterns): no
  picture files to load.
- The edge follows the play area's width from layout(), as the middle
  line does, so it never runs under the column at any window size.
- Nothing about the cards' places or sizes changes.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0033-A | The table shows the velvet and the lit edge, which stops at the column | browser screenshots at laptop and computer sizes |
| F-0033-B | The board's existing measured checks still pass | browser (battlefield.spec) |
| F-0033-C | It looks right in real games | owner |

## Decisions for the owner

All taken 2026-10-29 (see the top).

## Amendments

None.
