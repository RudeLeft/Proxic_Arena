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
