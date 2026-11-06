# Phase 10 — Animation polish and graphical improvements

**Status: LOCKED and ACTIVE 2026-11-06** (owner: "Lock it"). Changes from
here are dated amendments (PHASE-002). Each item is built only after its
own animated canvas is approved.

**Owner's brief (2026-11-06):** animation polish and graphical
improvements. The rule: **nothing on the battlefield jumps.** A card
moved from your hand to the battlefield animates itself there; nothing
goes from one place to another in a single frame. "You should be able to
tell what and where something is going." Named in the brief: a card
destroyed and headed to the graveyard shows it was defeated, and the same
for exile; a card taken by the other player travels across to their side;
cards that merge or transform show it; board wipes; better attack and
block animations. "Not a complete list." **One animation at a time, each
with an animated canvas that plays the whole movement, approved before it
is built.**

## The rule (P10-R1): nothing jumps

Whatever a player can see on the table that changes **place**, **side**
or **form** gets there by a movement you can follow, from where it was to
where it goes. Appearing and disappearing are movements too: a card comes
from somewhere (a hand, the library, the stack, a token being made) and
goes somewhere (a graveyard, exile, a hand, the library, nowhere for a
token -- and then it visibly fades out where it was).

What stays as it is:

- **Animation never blocks a click** (Phase 7 §7.36): the board is always
  the newest one; an animation only decorates the way there. **Owner
  2026-11-06:** you never wait -- when you act while things are moving,
  they **speed up and finish in about a tenth of a second** instead of
  snapping to the end (so even then nothing jumps).
- **Hidden cards stay hidden.** A card going into the other player's
  hand, or into a library, travels face down; a card the other player
  draws is a card back. An animation never shows what the rules hide.
- **Turn off motion** (the computer's "reduce motion" setting) still
  turns it off: cards then go straight there, with a short fade.
- The board's look and layout (BATTLEFIELD_LAYOUT_CONTRACT.md) are not
  changed by animation: a card always ends exactly where the layout puts
  it.

## Today (research, 2026-11-06)

What the board already does (Phase 7 Amendment 6, spec 0028, Phase 9):

- A card still on the board **glides** to its new spot in 0.25 s (a tap,
  a row re-centring, a land played).
- A card that wasn't on the board **flies in** from its pile at the side
  (hand, graveyard, exile) or from the stack, starting faint.
- A card that left **slides toward its pile and fades**, in 0.25 s --
  the same for destroyed, sacrificed, died from damage, exiled or
  bounced. Nothing shows it was *defeated*.
- A spell resolving glows, its spark runs to its target, then it goes to
  the graveyard or flies onto the table. Attackers swoop onto what they
  hit, with a burst and the number.

Where it falls short of the rule (to be measured, item by item, in the
first audit):

- **The page guesses where a card went.** The game sends the whole table
  after each change, and the page compares it with the one before. A
  card that went to a library, or into the other player's hand, or was
  exiled face down, is drawn going to exile ("the likeliest place").
  The game knows exactly: it records every move with where from, where
  to and why (destroyed, sacrificed, died, exiled, bounced, milled,
  discarded, countered). Phase 10 will need the game to send that
  record (hidden parts left out), so the page stops guessing.
- **Everything in one update moves at once.** A board wipe of eight
  creatures, or "draw, then discard", plays as one blink.
- **Changing form** (transform, day/night, turning face up, meld,
  mutate) swaps the picture with no movement (to confirm).
- **Changing sides** (a stolen creature) -- to confirm whether it glides
  across or jumps.
- **Attack and block** are a step forward and an arrow; blockers don't
  move to what they block.

## Items

Taken one at a time, in the order the owner sets. Each is a movement the
player sees; the list grows as the owner and the audit add to it.

| # | Animation | Example cards |
|---|---|---|
| A-00 | **One motion language** -- speed, easing, what goes first when several things happen at once, how long the longest may take; and the game's move record (where from, where to, why) | every item below |
| A-01 | **The jump audit** -- every Mechanics Lab game recorded frame by frame; every jump, blink and wrong destination listed, with its cards | all 275 Lab cards |
| A-02 | Hand to battlefield: a land played, a permanent spell resolving from the stack | any land, Grizzly Bears |
| A-03 | Drawing: library to hand, yours and theirs (a card back) | any draw, Divination |
| A-04 | **Destroyed / died** -- defeated, then to the graveyard | Murder, combat deaths |
| A-05 | **Exiled** -- its own look, different from dying | Swords to Plowshares, Path to Exile |
| A-06 | Sacrificed, discarded, milled, a spell countered | Village Rites, Mind Rot, Counterspell |
| A-07 | **Board wipes** ("battlefield whips" in the brief; owner 2026-11-06: board wipes) -- many at once, readable | Wrath of God, Damnation, Farewell |
| A-08 | **Changing sides** -- a stolen card travels to the other battlefield (and back) | Mind Control, Threaten, Switcheroo |
| A-09 | **Transform**, day/night, turning face up | Delver of Secrets, daybound cards, a morph |
| A-10 | **Merge** -- meld, mutate | Bruna + Gisela, a mutate creature |
| A-11 | **Attacking** -- declaring, moving out | any creature |
| A-12 | **Blocking** -- the blocker moves to what it blocks | any creature |
| A-13 | Combat damage: first strike, trample, deathtouch, lifelink | Ghalta, Vampire Nighthawk |
| A-14 | Back to a hand, onto or into a library, shuffled in | Unsummon, Chaos Warp |
| A-15 | Tokens and copies made | Raise the Alarm, Clone |
| A-16 | Exiled and returned (flicker), phasing | Ephemerate, Teferi's Protection |
| A-17 | Attaching and falling off (Auras, Equipment) | Pacifism, a sword, its creature dying |
| A-18 | Counters and power/toughness changing | Giant Growth, +1/+1 counters |
| A-19 | Life, poison and damage to players | Lightning Bolt to the face |
| A-20 | Survived: regenerated, indestructible, prevented | Regenerate, Darksteel Myr |
| A-21 | The stack: cast, copied, countered, fizzled | Fork, a spell losing its target |
| A-22 | **Graphical improvements** -- the look of the table, cards and effects (owner adds) | -- |

## How the phase runs

For each item, in the owner's order:

1. **Today**: a recording of what the real game does now, slowed down,
   with the cards that cause it.
2. **Animated canvas**: two or three ways it could move, drawn on the
   real board's look, each playing the **whole** movement, with replay,
   slow motion and a frame-by-frame step.
3. **Owner decision**, asked as a question, recorded here as an
   amendment.
4. **Build**, then a recording of the real game doing it, before it
   ships. Then the next item.

**How "nothing jumps" is proven** (built in A-01, kept as a check): a
browser test records where every card is on every frame while real
games play, and fails when a card covers too much distance between two
frames, changes form or side with no movement, or appears or disappears
in one frame. Run in a real (headed) window, since the test browser's
headless mode drops frames by itself (BATTLEFIELD_RENDERING.md §6).

## Owner decisions at locking (2026-11-06)

1. **Never wait; speed up.** You can always act; a click while things
   move makes them finish in about a tenth of a second, not snap.
2. **"Battlefield whips" means board wipes** (Wrath of God, Damnation).
3. **The jump audit (A-01) first**, then the motion language (A-00),
   then one animation at a time in an order the owner sets from the
   audit's findings.

## Exit gate

Every item decided and built with its recording; the jump check passing
on every Lab game; the owner plays and accepts (P10-O).

---

## Amendment 1 — A-01, the jump audit (2026-11-06, as built)

Every Mechanics Lab game (219 traces, both seats; 17,577 changes on the
table) was replayed into the real game page in a headed browser at
1920x1080. A recorder noted every drawn card's position and opacity on
every frame (whatever element drew it: on the table, in a hand, being
cast, its flight, its stack entry, a leaving ghost), 0 dropped frames.
Each card was followed as one thing, checked against what the game's
own boards say happened, and each kind of finding was confirmed by eye
at one-tenth speed (Chrome DevTools animation rate). Owner report with
the slow-motion frames: https://claude.ai/artifact/3Td3kZMJtcAgK8cKbYSXmQ

Smooth today: paying for a spell and its flight to the stack; a
permanent resolving onto the table; drawing; a land played where none of
its kind is; tapping.

Findings (times seen, each player's screen counted):

| # | Finding | Seen | Item |
|---|---|---|---|
| 1 | A stolen creature jumps to the other side in one frame; on the loser's screen the Aura flies to the empty stack instead of the creature | the Lab's steal, both screens | A-08 |
| 2 | Auras appear attached; Equipment's label jumps between creatures | 3 of 3 | A-17 |
| 3 | Back to a hand: gone from the table, later appears in the hand | 2 of 6 | A-14 |
| 4 | Transform, day/night, turning face up: the picture swaps, no flip | 23 of 31 | A-09 |
| 5 | Died, destroyed, sacrificed, exiled: the same faint 0.25 s slide; a board wipe in one blink; a card leaving a pile not shown | every one; 22 from piles | A-04..A-07 |
| 6 | A card joining a pile (lands, a second token) only changes the number | about 1,090 | A-02, A-15 |
| 7 | The other player's spell fades in at the middle, not from their hand; cancelled, it vanishes and reappears by the stack | 1,278; 703 | A-21 |
| 8 | Triggers and abilities pop onto the stack full size | about 280 | A-21 |
| 9 | A blocker jumps onto the attacker | blocks | A-12 |
| 10 | Mill, exile from a graveyard, lands back into a library: not shown | about 130 | A-06, A-14 |
| 11 | The page guesses destinations (a library or a hidden hand is drawn as exile); the game knows and doesn't send it | -- | A-00 |
| 12 | Not in the Lab: meld, mutate; only 2 board wipes | -- | A-07, A-10 need Lab games |

Not a finding: starting your own cast appears in the middle in the
replay because nothing is clicked; in a real game it rises from the
clicked card (checked live in A-02).

The recorder and analyser are scratch tools today; turning them into the
kept "nothing jumps" check is part of A-00.

## Amendment 2 — the order (owner, 2026-11-06)

After the audit: **A-00 first** (one motion style, the game's move
record), **then dying, exile and board wipes** (A-04, A-05, A-06,
A-07), then stolen creatures (A-08), Auras and Equipment (A-17),
transform and merge (A-09, A-10), attacking and blocking (A-11, A-12),
then the rest. Several things at once (a board wipe of five): the A-00
canvas plays it both ways -- one after another, and all together -- and
the owner chooses there.

## Amendment 3 — A-00 decided: Glide, together, speed up (owner, 2026-11-06)

On the A-00 canvas (https://claude.ai/artifact/4KkTYRBafnKTguWCywgFSF;
Today, A · Glide and B · Snappy side by side, a five-creature wipe both
ways, a "click now" button):

1. **Every card moves with A · Glide**: 450 ms, a gentle arc (bulging up
   by about a seventh of the distance), the card lifting about 8% with a
   deeper shadow mid-flight, easing in and out (cubic-bezier 0.4, 0, 0.2,
   1). This replaces the 250 ms straight move of Phase 7 Amendment 6.
2. **Several at once go all together** (a board wipe: every creature at
   the same moment).
3. **Clicking while things move**: what is moving finishes in a tenth of
   a second (as shown), never snaps.

Also part of A-00 (no look to decide): the game sends each move -- where
from, where to, why -- so the page stops guessing (Amendment 1, finding
11); hidden cards stay hidden.

## Amendment 4 — A-00 built (2026-11-06, as built)

- **The game's move record.** The worker records every zone change
  Forge makes (`GameEventCardChangeZone`), with why a card left the
  battlefield -- "sacrificed" (Forge announces it just before the move)
  or "destroyed" (Forge marks the card first; this includes dying to
  damage or 0 toughness) -- and sends each seat its own view with the
  round's snapshots as `moves` (protocol/README.md). A seat is told
  which card moved only when it can see the card at one end; the other
  player's draw is "a card, library to hand". `Moves.java`,
  `MovesTest`; Lab `check-moves.py` (Murder: destroyed, to both seats;
  Innocent Blood: sacrificed, never destroyed; ~400 moves: no hidden
  card named, every visible one named), in CI's Lab list.
- **The page stops guessing.** `fromSnapshot.ts` takes arrivals and
  departures from `moves` (a library, a hand, a graveyard, exile, on
  either side); the old comparison stays for an older worker.
- **A · Glide everywhere on the table** (`motion.ts` `glideFrames`):
  450 ms, an upward bow of 14% of the distance, a lift of up to 8%
  (less for a short hop) with a deeper shadow, eased in and out. Used
  for a card arriving, a card leaving (ghosts), and -- new -- a card that
  stays on the table but moves (a stolen creature crossing, a row
  re-centring, a tap turning in place). A card interrupted mid-Glide by
  a newer board sets off again from where it is. CSS keeps only quick
  settles (a pointed-at hand card rising: 250 ms).
- **Clicking while things move** (`hurry`): a click or key makes what is
  moving on the board finish in 100 ms; looping glows are untouched.
- **Kept check.** `frontend/tools/jumps/jumps.spec.ts` (its own config,
  `playwright.jumps.config.ts`, never in the browser suite) and
  `scripts/check-jumps.py`.

Verified on the rebuilt local stack with fresh Lab games: the stolen
Grizzly Bears now arcs across the table (it jumped in one frame); a
creature returned to the other player's hand heads to that hand (it was
drawn going to exile); a Murdered creature arcs to the graveyard. Still
flagged, and theirs to fix: Auras and Equipment (A-17), piles (A-02,
A-15), the other player's casts and triggers (A-21). 785 page tests,
4 board browser specs, the Lab's attachments and to-library checks pass.

## Amendment 5 — A-04, A-05, A-07 decided (owner, 2026-11-06)

On the canvas https://claude.ai/artifact/8xg5doNQpWQ6Nov6TVjR3h (three
defeated looks, three exile looks, a five-creature wipe with and without a
flash):

1. **Defeated: A · Shatter** -- a red flash and a shake, the card cracks
   and darkens, then Glides to the graveyard (about a second).
2. **Exiled: A · Banished** -- pale blue-white light rises around it, it
   brightens and lifts, then Glides to exile still glowing.
3. **Sacrificed looks the same as defeated** (A-06's sacrifice part).
4. **A board wipe: a pale flash sweeps the table first** (a fifth of a
   second), then every creature at once.

## Amendment 6 — A-04, A-05, A-06 (sacrifice), A-07 built (2026-11-06, as built)

- A permanent leaving the table for a **graveyard** -- destroyed, died,
  sacrificed, or any other way -- is **defeated** (Shatter): a red flash
  and a 220 ms shake, cracks drawn across it as it darkens and tilts
  (300 ms), then the Glide to the graveyard. For **exile**: **Banished**
  -- light motes rise, it brightens and lifts with a pale glow (520 ms),
  then Glides to exile still glowing. Each is ONE animation with its
  Glide (`motion.ts` `fateFrames`), so a click hurries all of it; the
  flash, cracks and motes are CSS on the leaving card. A hand card
  discarded, a land joining a pile, a resolved spell: unchanged.
- **A board wipe** -- three or more permanents leaving the table in one
  update (`WIPE_AT`) -- sweeps a pale flash across the table (220 ms);
  then they all go together.
- "Reduce motion" hides the flash, cracks and motes.
- Seen on the rebuilt local stack at a tenth of the speed: Murder's
  Bears flashes red, cracks, darkens and tilts, then glides off; an
  exiled Bears glows and lifts with motes; Divine Reckoning's two dead
  creatures shatter together. 791 page tests (Board: defeated, exiled,
  the wipe's flash and 220 ms wait, no flash for one).
