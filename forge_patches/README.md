# Forge patches

No local Forge patches are currently approved.

PHASE_01 §1.62 requires this directory to exist and to say so
explicitly, because "there are no patches" and "nobody checked" look
identical in an empty folder.

Upstream Forge is used unmodified, pinned at the commit in
`../forge-pin.properties`. Proxic's integration lives entirely
outside the Forge source tree: the worker in `../forge-worker/`
implements a Proxic-owned `PlayerController` against `forge-core`
and `forge-game` (Strategy A, PHASE_00_ACCEPTED_DECISIONS).

If a patch ever becomes necessary:

1. It needs an owner decision and an ADR — AGENTS VEND-005.
2. It lives here as a patch file, never as an edit to a checkout.
3. It names the exact upstream commit it applies to.
4. The reason it cannot be solved outside Forge is recorded.

A patched Forge that nobody can reproduce from upstream plus a
patch file is a fork, and a fork is a maintenance burden this
project has not agreed to take on.
