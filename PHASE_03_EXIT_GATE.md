# Phase 3 Exit Gate

**Status: PASSED — 2026-10-16**

Accounts and authentication are built, tested, deployed and used. A
person signs in at `https://proxic.barnflix.net`, imports a deck, and
stays signed in across a server restart. Nothing reaches a deck
without a session.

```text
190 server tests      0 skipped  0 failed
 27 browser tests     0 failed
ESLint, Prettier, ktlint, detekt   clean
```

**24 of 26 acceptance tests pass. 1 is a recorded deviation. 1 is
partial and says why.** Evidence:
`docs/research/phase-03/ACCEPTANCE_LOCAL.md`, which carries both the
local pass against an empty database and the production run on the
host.

---

## §3.158 Exit criteria

| Criterion | Result |
| --- | --- |
| permanent Arena users exist | **YES** — `RudeLeft` on the host, created by the owner |
| user IDs are stable | **YES** — `user_id` uuid primary key, never reassigned |
| username normalization is deterministic | **YES** — `Locale.ROOT`, unique index on the normalized form |
| passwords stored securely with Argon2id | **YES** — `m=65536, t=3, p=1`, read back out of the database |
| no plaintext passwords stored | **YES** — zero rows contain the plaintext |
| login works | **YES** — locally and through the tunnel |
| sessions opaque and database-backed | **YES** — survived a container restart in production |
| raw session tokens not stored | **YES** — the stored value is provably `sha256(cookie)` |
| secure production cookies work | **YES** — `Secure; HttpOnly; SameSite=Lax; Path=/` through the tunnel |
| idle session expiration works | **YES** — enforced in the `authenticate` query |
| absolute session expiration works | **YES** — same query, `expires_at` |
| logout works | **YES** — old cookie refused afterwards |
| logout-all works | **YES** — three sessions, one call, all dead |
| password change revokes sessions | **YES** — including the one making the change |
| disabled accounts lose access | **YES** — live session, deck API and open WebSocket all end |
| roles are server-authoritative | **YES** — a client claiming ADMIN stays a PLAYER |
| login throttling works | **YES** — 10 attempts, then 429, account untouched |
| CSRF protection works | **YES** — refused, and the state did not move |
| protected browser routes work | **YES** — redirect, return path, reload, sign-out |
| authenticated WebSocket identity works | **YES** — HELLO carries the session's user, never a claim |
| session revocation affects WebSockets | **YES** — closed with 1008 about a second after revocation |
| administrator provisioning works | **YES** — first admin created from an empty database |
| no default credentials exist | **YES** — a login before any account existed returned 401 |
| production login works through the hostname | **YES** — `proxic.barnflix.net` |
| Phase 2 decks not incorrectly exposed | **AMENDED** — see P3-Y below |
| deck ownership not prematurely implemented | **YES** — no table outside `app_user`/`user_session` has a user column |
| documentation matches actual behaviour | **YES** — and two places where it did not were corrected |

---

## §3.156 Acceptance tests

| Test | Result |
| --- | --- |
| P3-A First administrator creation | **PASS** — from a genuinely empty `app_user` |
| P3-B Password storage | **PASS** — PHC Argon2id, parameters read from the row |
| P3-C Login | **PASS** |
| P3-D Invalid credentials | **PASS** — byte-identical answers, timing indistinguishable |
| P3-E Secure cookie | **PASS** — on the host, through the tunnel |
| P3-F Database-backed session | **PASS** — survives restart, locally and in production |
| P3-G Raw token not stored | **PASS** — absent, and the stored value is its hash |
| P3-H Logout | **PASS** |
| P3-I Logout all | **PASS** — proven across two browser contexts |
| P3-J Password change | **PASS** |
| P3-K Disabled user | **PASS** — needed a second account; see §3.110 below |
| P3-L Re-enable user | **PASS** — revoked sessions stay revoked |
| P3-M Username normalization | **PASS** — with the password-case negative control |
| P3-N Login rate protection | **PASS** — throttle, not lockout |
| P3-O CSRF rejection | **PASS** — and the display name did not change |
| P3-P CSRF success | **PASS** |
| P3-Q Cross-origin protection | **PASS** |
| P3-R Protected browser route | **PASS** |
| P3-S Browser login persistence | **PASS** |
| P3-T Browser logout | **PASS** |
| P3-U Authenticated WebSocket | **PASS** — browser-driven, identity matches the login |
| P3-V WebSocket impersonation | **PASS** — a PLAYER claiming ADMIN stays a PLAYER |
| P3-W WebSocket session revocation | **PASS** — closed with 1008 |
| P3-X Public anonymous protection | **PASS** — through the production hostname |
| P3-Y Phase 2 deck isolation | **DEVIATION** — superseded by PHASE 3 AMENDMENT 1 |
| P3-Z Existing project integrity | **PARTIAL** — Forge clean; one pre-existing deletion in `Proxic_Arena_OLD` |

### P3-Y — a deviation on record, not a reinterpretation

Read literally, §3.85 forbids exposing the deck APIs as a shared
library to authenticated users. **PHASE 3 AMENDMENT 1 supersedes it**,
by owner decision D1, because §3.85 defers to a "Phase 2 production
safety boundary" that PHASE 2 AMENDMENT 1 had already removed.

What the amendment does require was verified: every deck endpoint
needs a session (401 anonymous, including artwork), and **no table
outside `app_user` and `user_session` has a user column at all** — so
§3.86 holds in its strongest form. No deck was assigned to the first
admin, the first user to log in, or anybody else, because there is
nowhere to record such a thing. Phase 4 defines ownership.

### P3-Z — partial, and not hidden

Upstream Forge is clean: `HEAD` equals the pinned commit
`4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`, no tracked file is
modified, and `forge_patches/` holds only its README.

`Proxic_Arena_OLD` is **not** unchanged: `git status` shows
`Proxic_Arena_Complete_Build_Plan.docx` deleted. Nothing there was
touched during Phase 3 (`find -newermt 2026-10-15` returns nothing),
and the file is recoverable from commit `6247e977` (75,236 bytes).
Restoring it means writing to a folder AGENTS.md ISO-001 makes
read-only, so it is reported here and left to the owner.

---

## Owner decisions

| | Decision |
| --- | --- |
| **D1** | Every deck endpoint requires a session. Decks stay unowned until Phase 4. |
| **D2** | Port 8765 stays for diagnostics; anything needing a session works only through the tunnel. |
| **D3** | The first administrator is `RudeLeft`, created by the owner. The password was never seen by me, never stored in this repository, and never appeared in conversation. |

---

## What this phase learned the hard way

Seven defects that only the real thing exposed. Each is now covered
by a test that would have caught it.

1. **The CSP broke the renderer.** Every server test passed while the
   page reported *Pixi Renderer: Unavailable* — PixiJS compiles shader
   functions with `new Function()`. The fix was Pixi's own polyfill,
   not `'unsafe-eval'`; weakening the policy for one dependency would
   have re-enabled string-to-code evaluation for every script.
2. **The origin check refused the application's own requests.** It
   compared against one configured origin, and the app answers to
   several names. The test engine sends no `Origin` header, so nothing
   below a browser could have found it.
3. **The deck client never sent the CSRF token**, so every import
   answered 403 once the gate went in.
4. **A browser will not keep a `Secure` cookie over plain HTTP** — the
   finding behind owner decision D2 and the first section of the
   authentication troubleshooting guide.
5. **Cleanup that never ran.** `purgeExpiredSessions()` and
   `evictExpired()` were implemented, tested, and called by nothing.
   Found by working the checklist line by line rather than from
   memory.
6. **Card art would have failed on the first production import** —
   Docker creates bind-mount sources as root, the server runs as
   uid 100, and Phase 1 never wrote to `/data`.
7. **The home page offered no way to sign in** (§3.69). Found by the
   owner on the deployed site. Every browser test passed because every
   one of them navigates straight to `/login` or `/decks` — the suite
   knew where the door was.

Two corrections to things I had asserted rather than checked: the
`Set-Cookie` header does carry `$x-enc=URI_ENCODING` (a comment said
the default encoding avoided it), and `arena-admin` does have
`set-password` and `revoke-sessions` (the troubleshooting guide had
told operators to use `psql`).

And one measurement failure worth remembering: a "fix" for the jansi
startup trace was verified by grepping a log before the trace was
printed, then "reproduced" with containers that never started, where
`grep -ci jansi` matched Docker's *No such container: jansitest*
error. Three agreeing results from three non-existent containers. The
real cause was Ktor colourising its log line; the fix is
`disableDefaultColors()`.

---

## What Phase 3 did not build

Self-registration, email verification, password reset by email,
OAuth, multi-factor authentication, account deletion, deck ownership,
an admin HTTP surface, and any gameplay. `requireAdmin` exists and is
tested but guards no route: account administration stays in
`arena-admin`, behind host access.

---

## Next

`PHASE_03_DELIVERABLES.md` for the §3.157 record. Phase 4 (Deck
Depot) is **not** started automatically — §3.157 says so explicitly,
and the ownership model it defines is the thing P3-Y is waiting for.
