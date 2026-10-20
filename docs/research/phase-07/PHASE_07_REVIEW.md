# Phase 7 review against what Phase 6 built — 2026-10-20

Read: `PHASE_07_BATTLEFIELD_PRESENTATION_INTERACTION_DRAFT.md`,
`docs/architecture/BATTLEFIELD_LAYOUT_CONTRACT.md`,
`docs/architecture/BATTLEFIELD_RENDERING.md`, the private UI design
canvas (Battlefield, Lobby, Depot, Account, Admin, Login artboards and
their notes), and Phase 6 as built (`PHASE_06_EXIT_GATE.md`, the six
match documents, the live-game findings).

Three kinds of finding: **A** corrections that need no decision, **B**
information the board needs that the protocol does not carry yet, and
**C** decisions for the owner. The draft's own design decisions
(§7.51, the renderer) hold up and are not reopened.

---

## A. Corrections (no decision needed)

| # | Where | Finding | Fix |
| --- | --- | --- | --- |
| A1 | §7.1 | "Phase 0 has not been executed" and "lock when Phase 6 is accepted" | both now true; the reasons for DRAFT are gone except §C below |
| A2 | header scope note, canvas note b2 | "a command zone ... is void" / "No command zone: Open Format has none" | **wrong**: Open Format has a command zone -- the initiative's dungeon, the Ring, planeswalker emblems -- and Phase 6 sends it. The board needs a place for it. Only Commander's command zone is void |
| A3 | header | "65-card deck maximum" | Open Format is 60-65 |
| A4 | layout contract | status DRAFT, §7 open questions, scale floor "proposed 70%" | all answered in §7.51 (floor 75%); steps 1-2 are one step (rendering doc §4). Mark ACCEPTED with the resolved values |
| A5 | §7.27 | modes derived from `choice_type` | Phase 6's field is `kind` |
| A6 | §7.4 | inherited obligations | add Phase 6's: `MATCH_ACTION_MODEL.md`'s Phase 7 contract and the three live-game findings (§7.32a) |
| A7 | §7.16, rendering doc §5.4 | five-scale `srcset` | the asset store has two sizes (display, original); use those, or add scales as Phase 7 work |
| A8 | §7.22 | stack dock verified against "a real multi-item stack" | Phase 6's regressions produce them (Panglacial Wurm, counterspells, Krark copies); use their traces as fixtures |

## B. What the board needs that Phase 6 does not send

The design shows things today's protocol cannot supply. Each is a small,
additive change to the worker's snapshot or question frames (no
breaking change, `protocolVersion` stays 1), recorded as a Phase 6
protocol amendment and built in Phase 7.

| # | The board wants | Today | Needed |
| --- | --- | --- | --- |
| B1 | who may act now (canvas: brass dot, "Bob to act") | only `activeSeat`; the waiting player cannot tell who holds priority | `prioritySeat` in the snapshot -- public in Magic |
| B2 | stack items as cards: "resolves next: White Plume Adventurer · Alice · Spell" | `{id, description}` only | per entry: source object id and name, controller seat, spell or ability, and targets |
| B3 | targeting arrows from a spell to what it targets | not sent | the targets in B2 |
| B4 | combat: who blocks whom, what each attacker attacks | `attacking`/`blocking` flags only | blocker → attacker, and attacker → player / planeswalker / battle |
| B5 | click a card on the board to choose it | options are `{actionId, label}`; the object is only inside the id string | an explicit `objectId` on each option (client must not parse ids, §7.24) |
| B6 | mana available (§7.23) | the floating mana pool is not sent | the pool per player |
| B7 | why a choice was refused ("Attack declaration invalid") | Forge's message without its reason | Forge's own reason text, where Forge gives one |

## C. Decisions for the owner

Put to the owner in plain English (separately):

1. **Stopping at every step** -- which steps the game pauses at by
   default, and whether a player can change it (live finding 1).
2. **Spells you cannot pay for** -- shown normally, dimmed, or set apart
   (live finding 2; never hidden by a client guess).
3. **A game log** -- a running record of what happened ("Pat cast
   Lightning Bolt targeting your Elite Vanguard"). Not in the draft at
   all; needs Forge's game log on the wire.
4. **Concede** -- a real concede (you lose, the opponent wins) next to
   today's Abandon (nobody wins).
5. **Piling basic lands** -- always (like a physical table) or only when
   a row runs out of room (canvas open question b8).
6. **Transformed cards have no picture** -- deck packages carry front
   images only.
7. **The game screen** -- the board takes the whole window during a
   game, and where chat goes.
8. **Scope** -- the canvas also redesigns the Lobby, Deck Depot, an
   Account page and an Admin page. The Admin page reverses a Phase 3
   security decision (account administration only on the host). Is that
   Phase 7, or a later phase?

Smaller design questions the canvas already answers or that can wait
for the first rendered board (§7.46): where graveyard/exile/library
counts sit (the rail), token frames (name, type, P/T, no picture), the
exact tapped/attacking styling.

## Outcome

All eight decisions, plus five the widened scope raised, were answered by the
owner on 2026-10-20 and are recorded in Phase 7 section 7.52, with the plays
they require in PART IX, the pages in PART X and the amendments in section 7.69.
The corrections in A are applied; B is section 7.61.
