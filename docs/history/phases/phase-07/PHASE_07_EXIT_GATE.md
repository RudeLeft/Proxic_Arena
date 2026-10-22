# Phase 7 Exit Gate

**Status: PASSED — Phase 7 is COMPLETE.** The owner signed it off on
2026-10-22 (P7-O). All 27 acceptance tests are met; the build carried
forward the 2026-10-22 security review (`9150a62`, `7fe7c06`). This is
the last phase: the project now moves from phases to features
("Next", below), and this document is history from here on.

Two players play a real game of Magic, run by Forge, on a graphical
battlefield in the style of MTG Arena: the board is laid out by one
tested function at every window size, cards are clicked to play, target,
attack and block, the stack shows spells as cards with arrows to their
targets, turns flow with Arena-style priority stops, and every page of
the UI design canvas -- sign in, Lobby, Deck Depot, Account, Admin -- is
built and wired to it.

```text
486 server tests                    22 skipped (declared: they need the
                                       real Deck Builder export), 0 failed
374 frontend unit tests                          0 failed
 75 browser tests    69 passed in CI, 6 skipped by design (opt-in
                     benchmark, live-site check, fault injection)
 27 Mechanics Lab scenario scripts in CI, 0 failed; an INCONCLUSIVE
    scenario (the shuffle never reached it) gets one more game
  4 cross-game trace checks in CI (snapshot-first, hidden hands,
    every permanent has its row, start budget) + the token-speed budget
ktlint, detekt, ESLint, Prettier, tsc     clean
a full check: about 12 minutes, on 10 machines at once
```

**27 acceptance tests: 27 MET** (P7-O by the owner, 2026-10-22). Evidence, row by
row: `PHASE_07_ACCEPTANCE_AUDIT.md`.

---

## What Phase 7 built

| Area | What a player gets |
|---|---|
| The board | `layout()`: a pure, tested function from Forge's state to every card's box, 1366×768 to 3840×2160 and ultrawide, mirrored seats, an overflow ladder, piles of basics and tokens, attachments as tags on their host, tapped cards tilted; drawn in React DOM + SVG, proven equal to the maths in a real browser |
| Interaction | Click a card to play it; one action is the click, several are offered; targets, attackers and blockers chosen on the board; a close look on right-click (the full scan); no window where a click will do (Amendment 12) |
| Turn flow | Arena-style priority stops on the server, a stops panel, "skip to end of turn", "All attack"; about 26 questions a game where there were 148 (Amendment 13) |
| Combat | Lines from attackers and blockers, damage numbers at impact, first strike as its own wave; a block or attack the rules forbid is refused with Forge's reason, and any creature can be taken back out |
| The stack | Spells and abilities as cards beside the board, the top one in front, arrows and a glow on what they target |
| Costs | Mana costs as mana symbols on hand cards, the stack and the close-up, at what the cast costs right now (Goblin Electromancer, Thalia) |
| "Why not?" | Clicking a card that cannot act says why: came in this turn, tapped, defender, a land already played, sorcery timing |
| Zones | Hand, library, graveyard and exile counts per player, each opening its list; cards fly to and from the right one |
| Pictures | 384-px copies on the table (memory budget met: 46 MB at 4K), the full scan in the close-up, a turned-over card's own back-face picture |
| Messages | Short notices from Forge in Forge's words; no player-facing text names the engine |
| Connection | Pages and games reconnect on their own; presence and rooms stay right through reloads and server restarts |
| Concede | Concede is a real loss with Forge's winner; Abandon ends with none |
| Game record | Every question, answer, refusal, snapshot and Forge's game log, per match, for administrators only, kept 30 days |
| The pages | Sign in, Lobby (rooms on demand, players list, invitations, chat), Deck Depot (rename, unique names, sharing), Account, Admin (accounts, rooms with force close, sign-ins, server state, game records) |
| Loading | The mana ring while a game starts |

---

## Owner decisions during Phase 7

Locked with the phase: 19 decisions (§7.51, §7.52) and the layout
decisions at the start of the build (§7.52a). Recorded as amendments
since: 1-13 (rows, stretch, tapped cards, combat and attachments, text
size, movement, effects, table-sized pictures, pages, Deck Depot, Lobby,
no popups, phases and stops). And, on 2026-10-21:

- the game controls at the bottom left (gear: stops, concede, abandon;
  chat beside it, flashing on a new message);
- spells on the stack as Arena-style cards, with a glow on their target;
- Forge patch 0002 (thousands of tokens at once, Krenko), with Forge's
  own wording kept for the legend rule;
- mana costs as the Deck Builder's mana symbols, at the real cost;
- the mana-ring loading screen, and no "Forge" in anything a player sees;
- "why not?" reasons when a card cannot act;
- exile beside graveyard, one row;
- table-sized pictures only after a demo -- then measured as already met;
  the full scan for the close-up, approved after the side-by-side demo;
- back-face pictures from the Deck Builder's new export.

---

## What the phase found

Faults found by building and testing, all fixed:

- **One creature could block a creature with menace**, and its damage
  was lost: Forge's own interface checks a whole block, its game loop
  does not, and Proxic had skipped the check. Found starting on "why was
  my move refused".
- **Pages never reconnected**: after a server update every page went
  deaf until reloaded, and a reload could race the server's presence
  record and leave a connected player shown offline. Found by the owner.
- **Leaving a room the server had already removed you from** showed "No
  such endpoint." and kept the room on screen.
- **A renamed deck kept its old name** in the other player's room until a
  reload. Found by the new acceptance test.
- **Krenko with thousands of Goblins took 10-15 minutes**: an N³ path in
  Forge's replacement handling. Forge patch 0002 (owner-approved) makes
  2,048 tokens 110 s → 41 s.
- **A back-face picture was imported and never shown.**
- **A security review (2026-10-22)** found the game and lobby connections
  accepted a page from any barnflix.net site that carried the player's
  cookie (now only our own page), a deck picture's size was checked only
  after unpacking it (now from its header, and unpacking is capped), and
  the server's building blocks two years old (the database, Java, the web
  server's network layer, logging, the Cloudflare tunnel, the website's
  packages -- all refreshed). Also removed: the Phase 6 text board, its
  styles, the published source maps; the status page needs a sign-in; the
  tab says "Proxic Arena"; Brainstorm's "put them in order" check joined CI.

And the tests themselves -- the lesson Phase 6 already recorded, again:
several Mechanics Lab checks assumed the shuffle (one White Knight
attacks, a Dismember is in hand, six lands in eight turns) and failed
when it differed; one looped for ever once a creature could be taken back
out of combat. Each now follows what really happened, and an
inconclusive scenario gets one more game rather than turning the build
red.

---

## Unresolved, carried forward

- **42 Forge questions are still unbuilt** (Phase 6's list, e.g.
  choosePermanentsToSacrifice): a match that reaches one ends loudly.
  The biggest risk for "any deck works" -- proposed for the next phase.
- **A match does not survive a server restart** (by design, P6-AZ): the
  pages reconnect, but a game in progress ends with no winner.
- **No computer opponent** -- an owner question, not an omission.
- **Decks imported before 2026-10-21 have no back-face pictures** until
  re-imported from the Deck Builder's new export.
- **Forge patches 0001 and 0002 are carried locally**, not upstreamed.

---

## P7-O — the owner's acceptance

Play on `https://proxic.barnflix.net` after updating Unraid to `latest`
(build `7fe7c06` or later), and say whether the board is accepted. Worth trying:
a game start (the mana ring), a menace block with one creature (refused,
with the reason; click the blocker to take it back), clicking a creature
that came in this turn while attacking ("why not"), a suspended Rift Bolt
(the Exile pile), a right-click close look (the full scan), a deck with a
two-faced card re-imported and turned over (its back picture), Admin →
Game records, and an Unraid restart mid-session (both pages reconnect).
`scripts/run-production-check.ps1` re-runs Phase 6's live end-to-end
check if wanted.

## Next

When the owner accepts, ONE change closes the phase and moves the project
from phases to features (owner decision 2026-10-22: "this is moving into
production with the close of phase 7 ... we will continue to add
features"):

1. **Phase 7 COMPLETE** in `CLAUDE.md`, `AGENTS.md`, `BUILD_PLAN.md` and
   `README.md`; `VERSION` 0.1.0 -> 1.0.0, and a first GitHub release with
   plain-English notes.
2. **The phase papers become history, unedited.** Every `PHASE_*.md` at
   the top level, `docs/research/phase-*/` and
   `docs/security/PHASE_01_BASELINE_REVIEW.md` move to
   `docs/history/phases/phase-00` ... `phase-07` (0, 0A and 0B together
   in `phase-00`). Names and text unchanged, so "PHASE_06 §6.17" in the
   code still finds its section; every path that names them is updated.
3. **Living documents by purpose.** `docs/deployment/` and
   `docs/troubleshooting/` become `docs/operations/` (and
   `docs/operations/troubleshooting/`); `docs/architecture/`,
   `docs/testing/`, `docs/decisions/` and `docs/assets/` stay.
4. **`BUILD_PLAN.md` becomes `ROADMAP.md`** -- features Planned, Building,
   Done -- carrying the 42 unbuilt Forge questions, Commander and
   Two-Headed Giant; **`CHANGELOG.md`** starts at 1.0.0.
5. **`docs/features/NNNN-name.md`**: one short spec per feature -- what
   the player sees, the tests that prove it, the owner's decisions. A spec
   the owner approves is what a locked phase was; Commander's will simply
   be long.
6. **AGENTS.md, owner-approved:** "Current phase" becomes "Current work"
   (the approved feature specs); PHASE-001 reads "work only on a feature
   the owner has approved"; PHASE-002 covers approved feature specs and
   the frozen history alike; PHASE-003/004 unchanged in substance; the
   document map follows the new paths. Every other rule stands.

`scripts/` stays as it is (owner, 2026-10-22).
