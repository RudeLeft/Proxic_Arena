# 0049 — Every card wears its own picture

**Status:** Approved 2026-11-01
**Owner decisions:** 2026-11-01, from the Deck Builder chat's review of
how deck pictures are sent and used. It is Part 1 of a larger plan: the
two faults players can see, shipped on their own and first (owner's
choice). The rest (60-100 card decks, light JPEG pictures, art crops on
the board, pictures kept between matches) is a later spec.

## What the player sees

- **A stolen creature keeps its picture.** Take a creature with Control
  Magic, Threaten or Act of Treason and it still wears the picture from
  its owner's deck. It used to come out bare, or wear the thief's own
  copy of the same card.
- **A spell cast from an opponent's library** (Praetor's Grasp, Thief of
  Sanity) wears its owner's picture on the stack.
- **Pictures wherever a card is seen:** an opponent's hand the game lets
  you see (Telepathy, Mindslaver), and a card looked at from a graveyard
  or exile, or offered from there (a Reanimate target). These had no
  pictures at all.

## Rules and boundaries

- A card's picture is in its **owner's** deck: the deck it came out of.
  The worker says who owns each card (`owner`) beside who controls it
  (`seat`); ownership of a card on the table is public.
- Nothing hidden becomes visible. Pictures are only put on cards the
  viewer may already identify (§6.124): a face-down exiled card (foretell)
  still carries none, and an opponent's hand only as far as Forge shows it.
- Being shown a picture is still what lets a player fetch it (§6.129).

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0049-A | A creature taken by the other seat names its owner to both seats, and every card in every zone names one | `scripts/check-card-owner.py` (Forge) |
| F-0049-B | A stolen card wears its owner's picture, not the thief's copy; a spell from an opponent's library too | `MatchArtTest` |
| F-0049-C | A revealed hand, graveyards and exile carry pictures; a face-down exiled card none | `MatchArtTest` |
| F-0049-D | In a real game a stolen creature shows its owner's picture to both players, and a graveyard card looked at shows its picture | `frontend/e2e/match-stolen-picture.spec.ts` + screenshots |

## Built (2026-11-01)

- **Worker:** every card `describe()` sends now carries `owner` beside
  `seat` (the controller), and every stack entry with a source card
  carries its card's `owner`. `otherHands` had set `owner` by hand; it
  now comes from `describe()` like every zone.
- **Server (`MatchArt`):** a card's picture is looked up in its
  `owner`'s deck (falling back to `seat` / `controller` only when a
  snapshot has no owner); a stack spell's likewise. `otherHands`,
  `graveyard` and `exile` are annotated like the battlefield, so the
  page's revealed hand, graveyard/exile close-ups and question windows
  about those cards get pictures; tokens are unchanged.
- **Evidence:**
  - `MatchArtTest`: four new tests (stolen card, the thief's own copy of
    the same card not borrowed, a spell from an opponent's library, a
    revealed hand + graveyard + exile with a face-down exiled card
    bare). All four FAILED against the unfixed `MatchArt`; the whole
    server suite passes with the fix.
  - `scripts/check-card-owner.py` (real Forge): seat 2 took seat 1's
    Raging Goblin with Act of Treason; both seats saw it with `seat` 2,
    `owner` 1, and every card in every zone named its owner. Against
    the unfixed worker it FAILED ("names no owner"). The same trace
    passes `check-hidden-hands.py`.
  - `frontend/e2e/match-stolen-picture.spec.ts` (local stack, real
    browser): RudeLeft's Treason deck, which carries no creature
    pictures, took Pat's Mogg Fanatic, which wore exactly Mogg
    Fanatic's picture from Pat's deck (pixel colour checked), on both
    screens; the spent steal spell, looked at from the graveyard, showed
    its picture. Screenshots read: the creature on RudeLeft's side with
    its picture, the graveyard close-up with its picture. This test was
    not run against the unfixed server (it would need two more image
    rebuilds); the Treason deck has no creature pictures, so before the
    fix the stolen creature had none to wear. `match-own-printing` and
    `match-multiface` still pass.

## Amendments

None.
