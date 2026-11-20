# 0111 — Soulbond pair marks: a link mark on both paired cards, the partner lights when you point, "Paired with X" in the close-up

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase. **Starts a Phase 12 item early, by owner decision** (below): soulbond pairs are on the Phase 12 card-statuses list; this spec builds that one status now and leaves the rest of Phase 12 where it is.
**Owner decisions** (owner feedback batch 2026-11-19b, `Owner feedback 2026-11-19b decisions.md`; canvas `frontend/zz-canvas/feedback-1119b.html`):

- Item 1, canvas section "1", option **A** ("A matching link mark on both cards; pointing lights the partner"): **"a chain-link mark on both cards; pointing at one lights its partner; the close-up says "Paired with X". This starts it now, ahead of Phase 12."** B (a gold tether while pointing) and C (numbered link badges) were not taken.

- **Approved 2026-11-20** (owner, by prompt: "Approve all."). Build 0108 → 0115 in that order, one at a time, then release them together as 1.75.0.

Research: `Owner feedback 2026-11-19b research A.md` item 1 (in the working folder). Phase 12 backlog: `Phase 10 deep dive 2.md` §4 ("Paired (soulbond: Wolfir Silverheart). No pair link is sent."), in the working folder.

## Why (researched)

Read at main 1f813795 (1.74.0).

- **Forge has the pair** (SOURCE, Forge). `forge.game.card.Card.getPairedWith()` / `isPaired()`; `BondEffect` sets both sides, and `Card` clears both when one leaves (`getPairedWith().setPairedWith(null)`). Soulbond is an enters trigger built in `CardFactoryUtil` (keyword "Soulbond"): "you may pair CARDNAME with another unpaired creature you control".
- **The worker doesn't send it** (SOURCE). `ViewerSnapshot.describe` sends `attachedTo`, `merged`, `copyOf`, `ringBearer`, gained and lost abilities (`Marks`), counters; nothing about pairing. No pair field exists in `forge-worker/src/main`, `protocol/` or `frontend/src`.
- **Nothing is drawn** (SOURCE). A pair's bonus shows only indirectly: Wolfir Silverheart's +4/+4 as a bigger power and toughness, a gained keyword through `Marks.gained`. Tandem Lookout's bonus is a triggered ability ("draw a card"), so nothing at all shows.
- **No soulbond card in the Mechanics Lab** (SOURCE: the corpus TXT/CSV). The owner's DDQ deck has Tandem Lookout.
- **The mark family** (SOURCE). Spec 0076 made counters and the Ring-bearer picture badges, "a badge language Phase 12 can grow" (ROADMAP 0076); the Phase 12 backlog adds a gold-square mark key, each mark with a picture and one line of words.

## What the player sees

Alice is you (bottom). Canvas "1": Tandem Lookout is paired with Elder Cathar, and Wolfir Silverheart with Chapel Geist (that is why Chapel Geist is 6/7).

1. **The marks.** Tandem Lookout and Elder Cathar each carry the same small gold chain-link square, in the gold-square family of the other marks (spec 0076's badges); Wolfir Silverheart and Chapel Geist each carry one too. Two pairs on one side are told apart by pointing (item 2), not by numbers (option C was not taken).
2. **Pointing.** Alice points at Tandem Lookout: Elder Cathar lights (the existing "pointing lights a related card" look, as spec 0100's pointing at a stack card lifts its source and targets). She points at Wolfir Silverheart: Chapel Geist lights. Bob sees the same marks and the same lighting on his screen for Alice's pairs, and for his own.
3. **The close-up.** Right-click Tandem Lookout: one line, "Paired with Elder Cathar".
4. **The pair ends.** Elder Cathar dies: both marks go when the board updates (Forge unpairs both); Tandem Lookout's close-up no longer says it. If Tandem Lookout pairs again (a new creature enters and Alice says yes), the marks come back on the new pair.

## Changes

### Worker

- `ViewerSnapshot.describe`: `pairedWith: "card:N"` from `card.getPairedWith()` when the partner is on the battlefield (the partner's snapshot id, PROTO-001). Public: both cards are on the table; the same for both seats and a spectator. Read from Forge's current state every snapshot (UI-005); never from the card's text or the "Soulbond" keyword (ARCH-006).

### Protocol

- `protocol/README.md` and `frontend/src/match.ts` `SnapshotCard`: `pairedWith` (optional card id). `fromSnapshot.ts` carries it.

### Page

- The mark: a chain-link gold square drawn with the card's other marks (`marks.tsx` / `CardBadges.tsx`, the spec 0076 family), on both cards of a pair; its words for a screen reader and the mark's tooltip, "Paired with Elder Cathar".
- Pointing at either card lights its partner (the existing related-card light; no new dim).
- The close-up (`GameScreen.tsx` `InspectFacts`): "Paired with {partner's name}".
- Face-down partner (a paired creature turned face down is unpaired by Forge; if Forge keeps a pair with a face-down card): the line names it as the viewer may know it (`nameFor`), never more (HID-005).

### Lab

- A soulbond scenario: Tandem Lookout enters with Elder Cathar on the table and pairs (the harness answers yes); then Wolfir Silverheart pairs with a second creature; then the partner dies.

## Rules and boundaries

- **UI-005, ARCH-006:** the pair is Forge's current pair, never guessed from card text.
- **HID-001/003:** public information; still asserted from both seats and a spectator's frames, and with a face-down card in play.
- **PHASE-001:** soulbond is Phase 12 scope; this spec is the owner's say-so to start this one status early (decisions item 1). The Phase 12 backlog keeps every other status; `docs/history` is not touched. The builder marks soulbond "built in 0111" where the backlog lists it (ROADMAP's Phase 12 line, if it names it).

## Tests that prove it

| ID | Test | Evidence |
|---|---|---|
| F-0111-A | Worker: after Tandem Lookout pairs with Elder Cathar, both cards carry `pairedWith` naming the other, in both seats' frames; after Elder Cathar dies neither does; Wolfir Silverheart's pair the same | new Lab `check-soulbond.py`, scenarios `pair`, `two-pairs`, `partner-dies` |
| F-0111-B | Hidden information: the field only ever names a card the reader's own snapshot shows on the battlefield; with a face-down creature in play, no `pairedWith` names a face-down card's identity to a reader who may not know it | `check-soulbond.py` reading both seats; `check-hidden-tops.py` clean; bite: send `pairedWith` from `getPairedWith()` without the battlefield test and the check fails |
| F-0111-C | Page: from the Lab board, both cards of a pair show the link mark; pointing at one lights the other; the close-up line reads "Paired with Elder Cathar"; two pairs light their own partners only | `fixes0111screen.test.tsx` (the real game screen, TEST-003) |
| F-0111-D | Page: the mark leaves both cards when `pairedWith` goes, with no jump (the mark fades, the card stays put) | `fixes0111screen.test.tsx`; `frontend/tools/jumps` over the Lab trace |
| F-0111-E | Real-click game (TEST-012), below | `match-soulbond.spec.ts` |

**TEST-004 (bites):** `pairedWith` dropped by `fromSnapshot.ts` (C fails); the partner not lit (C fails); the mark on one card only (C fails); the field kept after the partner left (A fails); the battlefield guard removed (B fails, the HID-004 bite). About five page and three worker mutations.

**Real-click game (TEST-012).** Spec 0098's exact deal with Tandem Lookout and Elder Cathar in the host's hand and lands. The host casts Elder Cathar, then Tandem Lookout; the soulbond question opens and the host **really clicks** Yes, then really clicks Elder Cathar as the partner (Forge's own questions). Both cards on both pages show the link mark; the host points at Tandem Lookout and Elder Cathar lights; the guest's page shows the same marks; the host right-clicks Tandem Lookout and the close-up says "Paired with Elder Cathar". Waits on states (the question, the mark present). Clip: one normal-speed clip from the host.

## Out of scope

- Every other Phase 12 status (statuses not sent yet, the gold-square mark key as a whole).
- Drawing a chain between the cards (option B).
- Anything about what the pair grants: Forge applies it, and the page already shows a changed power and toughness or a gained keyword.

## Open questions

None.

## Build order notes

After 0110 (independent of it; order only). Worker field and Lab scenario first, then protocol, then the page mark, pointing and close-up, then the real-click game.

## Amendments

None yet.
