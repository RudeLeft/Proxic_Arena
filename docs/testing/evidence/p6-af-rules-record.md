# Rules-version record: Leyline of the Void before anyone acts

PHASE_06 P6-AF: "Record the pinned Forge revision and observed behavior
for the selected nested/unusual rules scenario. If current Forge
conflicts with authoritative expected project behavior, do not patch
rules in Proxic; produce conflict evidence." Scenario selected by the
owner, 2026-10-20.

## Forge identity

| | |
|---|---|
| Upstream | `https://github.com/Card-Forge/forge` |
| Release tag | `forge-2.0.15` |
| Commit | `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676` (`forge-pin.properties`) |
| Modules | `forge-core`, `forge-game` (Strategy A) |

## The scenario

Leyline of the Void: "If Leyline of the Void is in your opening hand,
you may begin the game with it on the battlefield. If a card would be
put into an opponent's graveyard from anywhere, exile it instead."

Seat 1 begins the game with two Leylines on the battlefield (Forge's
opening-hand action, uncast). Nobody plays anything. Seat 2 draws to
eight cards and discards one at its first cleanup -- the first card to
move to a graveyard, and it moves before any player has acted.

**Expected (the comprehensive rules, and this project's behaviour):**
the replacement applies from the moment the Leyline is on the
battlefield. The discarded card is exiled; seat 2's graveyard stays
empty.

## Observed on the pinned Forge, unmodified -- the conflict

The discarded card goes to seat 2's graveyard (`graveyardCount` 0 → 1).

Cause: Forge applies a "would be put into a graveyard" replacement only
for permanents in its last-known-state copy of the battlefield, and
refreshes that copy after player actions -- not after putting
opening-hand permanents onto the battlefield. Until somebody acts, the
copy has no Leyline in it. Forge's own desktop client takes the same
path.

Evidence: `p6-af-leyline-unpatched.trace.json` -- the protocol trace
from seat 2's discard question to the board after it, run with
`scripts/check-leyline.py` against a worker built from the pinned
commit with no patches. The check reports: "seat 2's discard reached
its graveyard under seat 1's Leyline, before anyone acted".

## Resolution

Not patched in Proxic: no rule is worked around in the adapter (AGENTS
ARCH-002). The owner approved a FORGE patch instead (AGENTS VEND-002,
2026-10-20): `forge_patches/0001-leyline-last-known-state.patch`, one
`game.copyLastState()` at the end of `GameAction.runOpeningHandActions`,
applied by the Docker build to a fresh clone of the pin. The vendored
checkout is unmodified.

## Observed with patch 0001 -- as expected

The discarded card is exiled; seat 2's graveyard stays at 0.

Evidence: `p6-af-leyline-patched.trace.json`, the same run against the
patched worker. `scripts/check-leyline.py` forces this case on every CI
run, so a Forge update that drops or breaks the patch fails the build
(`git apply` refuses a patch that no longer applies, and the check
fails a worker without it).

## For a Forge update (AGENTS VEND-005)

Re-run `scripts/check-leyline.py` against the new commit WITHOUT the
patch. If it passes, upstream has fixed the defect: retire patch 0001
and record that here. If it fails, re-apply the patch and record the
new commit.
