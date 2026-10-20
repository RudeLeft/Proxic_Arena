# Forge patches

**One local Forge patch is approved.** Each one below is a patch file
in this directory, applied by the Docker build to a fresh clone of the
pinned commit in `../forge-pin.properties`. The vendored checkout under
`spikes/` is never edited (`scripts/check-integrity.py` holds it to the
pin). A patched Forge must be reproducible from upstream plus these
files, and nothing else.

Rules for a patch (AGENTS VEND-002, PHASE_01 §1.62):

1. It needs an owner decision, recorded here.
2. It lives here as a patch file, never as an edit to a checkout.
3. It names the exact upstream commit it applies to.
4. The reason it cannot be solved outside Forge is recorded.
5. A regression test fails without it.

A Forge update (VEND-005) re-applies every patch; one that no longer
applies, or that upstream has made unnecessary, is a finding for that
update's before/after report.

---

## 0001 — Leyline of the Void: last-known state after opening-hand actions

| | |
|---|---|
| File | `0001-leyline-last-known-state.patch` |
| Applies to | Forge `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676` (forge-2.0.15), `forge-game/src/main/java/forge/game/GameAction.java` |
| Change | One call, `game.copyLastState()`, at the end of `GameAction.runOpeningHandActions` |
| Approved | By the owner, 2026-10-20 ("Fix it in the engine") |
| Regression test | `scripts/check-leyline.py` (in CI) |

**The defect.** Forge applies a "would be put into a graveyard"
replacement only for permanents in its LAST-KNOWN-STATE copy of the
battlefield. It refreshes that copy whenever a player does something --
plays a land, casts, resolves -- but not after putting opening-hand
permanents onto the battlefield. So with Leyline of the Void begun on
the battlefield from an opening hand, if nobody acts before the first
card is discarded, the Leyline is skipped and the card reaches the
graveyard. Forge's own desktop client takes the same path. Found by
`check-leyline.py`, 2026-10-20.

**Why not outside Forge.** The refresh has to happen inside the game's
start-of-game sequence, between the opening-hand actions and the first
turn. Proxic's controller can only act when Forge asks it something;
doing it there (the experiment that confirmed the cause) would be a
Proxic-side rules work-around, which AGENTS ARCH-002 forbids, and would
run once per chosen card rather than once after all of them.

**The test.** `check-leyline.py` forces the exact case every run: seat 1
begins with two Leylines, nobody plays anything, and seat 2's first
discard must be exiled. Run against a worker built WITHOUT this patch
it fails ("seat 2's discard reached its graveyard ... is
forge_patches/0001 applied?") -- measured 2026-10-20, three runs of
each.
