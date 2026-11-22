# 0111 — Soulbond pair marks: a link mark on both paired cards, the partner lights when you point, "Paired with X" in the close-up

**Status:** Approved 2026-11-20 (owner, by prompt, feedback batch 2026-11-19b). Not part of a phase. **Starts a Phase 12 item early, by owner decision** (below): soulbond pairs are on the Phase 12 card-statuses list; this spec builds that one status now and leaves the rest of Phase 12 where it is.
**Built:** 2026-11-20 (commit 4c5b0786). **Released:** in 1.75.0, 2026-11-21.
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

## As built (2026-11-20)

Built on main at ab75a81f, not committed. Labels: SOURCE (read in the code), RUN (run here, this build).

### Worker

- **The field.** `ViewerSnapshot.java` `pairedWith(Card)`: Forge's `Card#getPairedWith`, sent as `pairedWith: "card:N"` (the partner's snapshot id, PROTO-001) in `describe`'s public on-the-battlefield facts, only when both cards are on the battlefield and phased in (`onTable`: the card as the game holds it now, `Game#getCardState`). Placed before the "may this viewer identify it" test, so a face-down creature carries it too, for both seats and the public view alike: an id is not an identity (HID-005 is the page's, below). Read from Forge every snapshot (UI-005); nothing reads the card's text or its keyword (ARCH-006).
- **Why the guard (SOURCE, Forge):** `GameAction#changeZone` unpairs the survivor when a paired card leaves, but leaves a real token's own link set (`if (!c.isRealToken()) c.setPairedWith(null)`); phasing (`Card#phase`) and a control change unpair both. So a card off the table can hold a link; the guard never sends it.
- **The guard's bite (RUN, HID-004):** no Lab game reached a snapshot while Forge held a stale link (`token-dies`, below: the sacrifice is paid last and the token is gone before the next question). The bite is a worker unit test, `PairedWithTest` (Forge's own `Card` objects moved between Forge's own `Zone`s): with the guard removed, "the card that left names nobody" fails.

### Protocol

- `protocol/README.md` `card.pairedWith`; `frontend/src/match.ts` `SnapshotCard.pairedWith` (parsed in `asCards`); `fromSnapshot.ts` `toBoardCard` carries it.

### Page

- **The partner's name.** `fromSnapshot.ts` `withPartners` adds `pairedName` to each paired battlefield card: `partnerName(card)`, the partner's name, or "a face-down creature" for one this viewer may not identify (HID-005; the worker sends such a card as "Face-down", `known: false`). A `pairedWith` naming a card not on the board is dropped (the worker never sends one).
- **The mark.** `marks.tsx` `cardMarks`: a mark `paired` (icon `paired`, the canvas's chain link in gold on spec 0076/0085's gold-rimmed square), after protection and lost abilities, never folding; its words "Paired with Elder Cathar" are the badges' tooltip, and the card's own label (`Board.tsx`, the screen reader's words) says "paired with Elder Cathar". Being a spec 0085 mark, it rises off the card when the pair is made and drops into its square (the riser), and shrinks away when the pair ends (`GoneMark`): the card stays where it is. `CardBadges.tsx` gives it the class `bf-mark-pair`.
- **Pointing.** `Board.tsx` `pointedPair` (set by `pointing`, the table card's pointer and keyboard-focus handlers, alongside spec 0059's attack-line handlers): the partner joins `lifted`, spec 0100 item 9's related-card light (lifts a little, gold glow; nothing dims); the pointed card gets `data-pair-pointed`, and `battlefield.css` makes both link marks glow (the canvas's `.lk.hot`). A card paired under a resting pointer lights its partner at the pointer's next move; a pointed pair that ends is let go.
- **Piles.** `layout.ts` `pileKey`: a paired card never piles (two Soldier tokens, one paired: each its own card, so pointing lights the right one).
- **The close-up.** `GameScreen.tsx` `InspectFacts`: a row "Paired with" / the partner's `partnerName`.

### Lab

- New `scripts/check-soulbond.py` (in ci.yml's Lab list), the public view watched from the start (seat 0) beside both seats. Scenarios: `pair`, `two-pairs`, `partner-dies` (Bob's Lightning Bolt kills Elder Cathar; then Chapel Geist enters and Lookout pairs again, with it), `face-down` (Lookout pairs with Alice's face-down Willbender: Bob's and the public view's frames never say "Willbender"; Alice's do), `token-dies` (Lookout pairs with a Soldier token from Raise the Alarm; Alice's Fling sacrifices it). Every frame of every view: `pairedWith` only on a battlefield card, naming a card on that board, which names it back; none anywhere else in a frame. A pair Forge made that never shows on every view is WRONG.
- **Forge's question (RUN):** soulbond asks one optional question, `chooseSingleEntityForEffect` "Select a card to pair with", with the candidates; there is no Yes first (declining is passing). See "Spec mismatches".

### Tests and runs

- **F-0111-A, B (RUN):** `check-soulbond.py`, all five scenarios OK, three runs in a row on the final worker; `check-hidden-tops.py` over its traces: no problems (exit 2: none of its own kinds in these games, as CI allows); `check-hidden-mulligans.py`: OK.
- **F-0111-C, D (RUN):** new `fixes0111screen.test.tsx`, the real game screen fed the frames each seat was sent in the Lab games (cut into `fixes0111.round.json`; TEST-003): on Alice's page and Bob's, no mark before the pair; both cards of the pair (only they) with the mark and its words; two pairs, pointing at each card lighting only its own partner, either card of a pair; the close-up line for both pairs; a face-down partner is "a face-down creature" in Bob's mark and close-up and "Willbender" nowhere on his page, "Willbender" on Alice's; when Elder Cathar dies, Lookout is the same card, its mark shrinks away (`data-leaving`, an animation played), its words, label and close-up no longer say it, and pointing at it lights nothing.
- **F-0111-E, the real-click game (TEST-012; RUN):** new `e2e/match-soulbond.spec.ts`, deck `protocol/fixtures/soulbond-deck` (built in CI, ci.yml), dealt (spec 0098). The host really clicks Elder Cathar and Tandem Lookout in hand and pays with real clicks; Forge's "Select a card to pair with" opens and the host really clicks Elder Cathar on the table; both cards show the mark on both pages (same ids), with the words; the host's real mouse on Lookout lights Elder Cathar (and only it), moving away puts it out; the guest pointing at the host's Lookout lights Elder Cathar on the guest's page; the host's right-click on Lookout opens the close-up with "Paired with Elder Cathar". Waits on states (the question, the marks landed, the light, the close-up). Passed five times: three in a row (54-72 s each), then once more, filmed from both seats, on the stack rebuilt with the final page code (1.3 min).
- **Existing browser specs whose code was touched (RUN, headless bundled Chromium, on the rebuilt stack):** `match-outcomes` (gained and combat marks), `match-spell-choices` (spec 0100's lift, `data-lifted`), `match-small-fixes` (the close-up's facts), `match-ring` (the gold-square family): 5 of 5 tests pass.
- **Jump check (RUN, headless bundled Chromium, nothing else running):** `frontend/tools/jumps` over the five fresh `check-soulbond.py` traces of the final worker (both seats: 10 replays, 364 boards, among them the pair made, two pairs, the partner bolted and the token sacrificed); `scripts/check-jumps.py`: no jump, pop-in, blink or unseen move (exit 0). The page code under it was the final one.
- **Mutations (TEST-004; RUN): 10 of 10 caught.** Page (6, `fixes0111screen.test.tsx`): `pairedWith` dropped by `fromSnapshot.ts`; the partner not lit; the mark on one card only; no close-up line; a face-down partner named as sent (HID-005); the mark never leaving. Worker (4): the battlefield guard removed (`PairedWithTest`); the field on one card only, the card's own id sent, and not sent to the public view (`check-soulbond.py pair`: WRONG). The three Lab ones first came out INCONCLUSIVE (the check waited for a correct pair); the check was fixed to call a made-but-unshown pair WRONG, then all three were caught.
- **Gates (RUN):** frontend `tsc -b`, `eslint . --max-warnings=0`, `prettier --check src e2e tools`, vitest (118 files, 1647 tests); worker `mvn -q -o test`; `python -I scripts/check-doc-refs.py`. Server not touched.
- **Clips and stills** (scratchpad, not committed): a normal-speed clip from each seat; stills of each step from both seats, read.

### Spec mismatches (built to Forge)

- **No "Yes" question.** The spec's game has the host click Yes, then Elder Cathar. Forge asks one optional question, "Select a card to pair with" (the window's Pass declines). The game clicks Elder Cathar on the table.
- **Close-up wording.** The close-up's facts are label/value rows ("Whose / Yours"); the line reads "Paired with" / "Elder Cathar", one row, as the spec's one line.

### Decided while owner away, to review (2026-11-20)

- **A face-down partner's words:** "Paired with a face-down creature" (mark and close-up) for a reader who may not know it; its name for its controller. The spec asks for "as the viewer may know it". To reverse: `fromSnapshot.ts` `partnerName`.
- **A paired card never piles:** two identical tokens, one paired, stand as two cards, so the mark and the light belong to the right one. To reverse: `layout.ts` `pileKey`'s `pairedWith` line.
- **Both marks glow while pointing** (the canvas's A shows it): the pointed card's own mark and the partner's. To reverse: the `.bf-mark-pair` rules in `battlefield.css`.
- **Touch:** pointing on a touch screen (best effort, UI-006) does not light the partner; a tap is a click. To reverse: `Board.tsx` `pointing`.

## Amendments

None yet.
