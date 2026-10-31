# 0042 — Casting in the middle, take-backs, clearer casting questions

**Status:** Built in 1.24.0 (approved 2026-10-30)
**Owner decisions:** 2026-10-30, from the canvases
https://claude.ai/artifact/PhRjou7UKAwxryW4pu13Yn (casting, look **C ·
Embers**), https://claude.ai/artifact/Nx62t82teuaZmMN4CW85sv (take-backs,
"keep the lines that connect the cards") and
https://claude.ai/artifact/ADmvvqRyQRtvkSfLvFijd3 (Archon's Glory, Sinew
Sliver: "build them").

## What the player sees

- **Casting.** RudeLeft clicks Steelform Sliver in hand. It floats out of
  the hand to the middle of the table, large (about 2.5× a card in hand),
  swaying gently, sparks in its own colour drifting up around it. Its cost
  is under it as mana symbols; each one lights up as it is paid. Questions
  about it (a target, Bargain, which mode, what to tap) sit beside it.
  Paid, it flies to its place — a creature or other permanent to its line
  on the battlefield, an instant or sorcery to the stack. Pat sees the same
  card float and fly (casting is public from its first step, CR 601.2a).
- **Cancel** (the button under the stack, or Esc) floats it back into the
  hand, and **it can be cast again straight away** while it is still
  RudeLeft's move and the mana is there. Today the cancelled card was not
  offered again until priority passed.
- **Take-backs.** Clicking a creature to attack or block, then clicking it
  again, takes it back — with one creature or many. Nothing is final until
  the round button under the stack ("Attack with 2 power", "Block") is
  pressed. Today, with only one creature that could attack (or block), the
  first click was final. The lines from an attacker to whom it attacks, and
  blockers riding on what they block (spec 0037), stay as they are; a
  creature that can still be taken back says "click to take back".
- **Archon's Glory's Bargain** (and every optional cost: kicker, buyback,
  bargain, entwine…) is asked in plain words beside the card being cast —
  "Bargain?", with the cost's own words — never titled "Your move".
- **The card a casting question shows is the card being cast**, never
  another copy with the same name on the battlefield (a second Sinew Sliver
  showed the first one, 2/3, so it looked like the one in play was asking).

## Found (2026-10-30, Sliver decks played on the local stack)

- Recast: the worker's loop guard (§6.189) hides an action chosen with no
  change to the game; a player's own Cancel left the game unchanged, so the
  card was hidden (record: Steelform Sliver absent from the next priority
  question, back after a pass).
- Take-backs: CombatChoices returns as soon as nothing more can be
  declared, so with one possible attacker or blocker the first click ended
  the declaration.
- Sinew Sliver's +1/+1 is a static ability: Forge never asks about it; no
  such question came up in three games.

## Scope

In: the worker keeps a cancelled cast on offer (only an action that failed
without the player backing out is held back, as §6.189 meant); attack and
block declarations stay open while anything can be taken back; the
snapshot carries the spell being cast (both seats); the page's floating
card, embers, cost pips, flight, return on Cancel; optional-cost words;
the casting question's picture from the card being cast.

Out (and why): abilities activated from the battlefield (the card is
already on the table: its questions stay beside the stack); lands (not
cast).

## Rules and boundaries

Forge stays the rules engine: the page shows what the snapshot says is
being cast, and the payment from Forge's own "still owing" words. Hidden
information: a card is shown to the opponent only from the moment Forge
puts it on the stack zone to be cast (public by CR 601.2a). The loop guard
still holds back an action that failed without a question being answered.

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0042-A | A cast cancelled at its payment is offered again at the next question | Lab game + browser |
| F-0042-B | One possible attacker: click, click again → not attacking; click, button → attacks. Same for one blocker | Lab game + browser |
| F-0042-C | While paying, both seats' snapshots carry the card being cast; neither shows a hidden card | worker test + browser |
| F-0042-D | The floating card shows the card being cast, its cost lights as it is paid, and it lands where it belongs | browser + screenshots |
| F-0042-E | An optional cost (Bargain) is asked in its own words, not "Your move" | unit + screenshot |

## Decisions for the owner

All taken 2026-10-30 (above).

## Amendments

None.
