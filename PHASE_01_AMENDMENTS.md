# Phase 1 Amendments

Per PHASE_01 §1.116, a locked requirement is never silently edited.
Each change is recorded here, and the phase specification keeps its
original text.

---

## PHASE 1 AMENDMENT 1

**Reason:**
The owner already operates a working Cloudflare tunnel for
`proxic.barnflix.net`. The specification was written before it
existed and named a hostname that does not.

**Affected requirement:**
§1.48, §1.50, §1.51, acceptance tests P1-R, P1-S, P1-T, P1-U, and
every later phase that repeats the hostname.

**Old decision:**
The production public path is `https://arena.barnflix.net`.

**New decision:**
The production public path is `https://proxic.barnflix.net`.

**Evidence:**
Owner statement, 2026-10-15: "proxic.barnflix.net is the url we will
use."

**Affected later phases:**
Phases 2–6 each repeat `arena.barnflix.net` in passing. The hostname
is incidental to every architectural decision in them — nothing
depends on the name — so they are not rewritten. This amendment is
the record.

**Approved by project owner:** yes, 2026-10-15
**Date:** 2026-10-15

---

## PHASE 1 AMENDMENT 2

**Reason:**
Port 8080 is already in use on the Unraid host, and the owner's
existing tunnel is configured to reach the origin on **8765**.

**Affected requirement:**
§1.51 ("Do not publish `8080:8080` to the host in production unless
required by the actual Unraid/tunnel configuration").

**Old decision:**
No host port is published in production; `cloudflared` reaches
`arena-server:8080` over the private Docker network.

**New decision:**
The Unraid deployment publishes the container's 8080 on host port
**8765**, because the existing `cloudflared` runs outside this
compose stack and is already configured for that port.

§1.51 anticipated this exactly — it permits a host port when the
actual tunnel configuration requires one — so this is an allowance
the specification already contains, recorded because it is a
departure from the preferred shape.

**The preferred shape remains available and is better.** If
`cloudflared` is attached to this stack's `edge` network:

```bash
docker network connect proxic-arena_edge <cloudflared-container>
```

then its origin becomes `http://arena-server:8080`, no host port is
published at all, and the server is unreachable from the LAN. Worth
doing when convenient; not a blocker now.

**Security note.** A published host port means anything on the LAN
can reach the server directly, bypassing Cloudflare. There is **no
authentication until Phase 3**, so until then the only thing between
a LAN device and the application is that nobody tries. Acceptable
while nothing is stored; revisit before Phase 2 holds a deck.

**Evidence:**
Owner statement, 2026-10-15: "I need a new port 8080 is already
taken. I have cloudflare set to 8765."

**Affected later phases:**
None architecturally. Phase 3 should revisit the LAN exposure above.

**Approved by project owner:** yes, 2026-10-15
**Date:** 2026-10-15

---

## PHASE 1 AMENDMENT 3

**Reason:**
The battlefield renderer was chosen in Phase 1 before the Phase 7
verification rules existed. Phase 7 §7.44, §7.45 and §7.47 require
geometry, clicks and hidden-information assertions to be made on what
is actually rendered, through the real event path; a canvas cannot
satisfy those from outside without a test API that trusts the renderer
about itself. Open Format also caps distinct card faces at roughly 50–60,
a third of what the PixiJS texture case was sized for.

**Affected requirement:**
§1.0 stack table row "Battlefield renderer | PixiJS"; the ADR list entry
`ADR-003-pixijs-renderer.md` (named, never written). §1.17–§1.19 are
**not** affected: PixiJS is installed, its lifecycle test is green, and
both remain true.

**Old decision:**
The battlefield renderer is PixiJS.

**New decision:**
The battlefield is rendered in React DOM with SVG overlays, per
`docs/architecture/BATTLEFIELD_RENDERING.md`. PixiJS remains installed
as a measured contingency for the card layer only, opened solely by a
missed benchmark (Phase 7 P7-Q).

**Evidence:**
Owner decision in design review, 2026-10-19, after comparing DOM, PixiJS
and a DOM/PixiJS hybrid against Phase 7's verification rules. Sources
are cited in `BATTLEFIELD_RENDERING.md` §2 and labelled per EVID-001.

**Affected later phases:**
Phase 6 §6.134 already required replaceable presentation and sanctions
DOM; its scope exclusions naming "final PixiJS battlefield" exclude
building the final board in Phase 6, which is unchanged whatever
renders it — not rewritten. Phase 7 §7.15, §7.16 and §7.48 are amended
in place (Phase 7 is DRAFT).

**Approved by project owner:** yes, 2026-10-19
**Date:** 2026-10-19
