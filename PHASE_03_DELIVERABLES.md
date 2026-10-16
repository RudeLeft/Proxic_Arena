# Phase 3 Deliverables

PHASE_03 §3.157, in its order. The gate is
`PHASE_03_EXIT_GATE.md`; the evidence is
`docs/research/phase-03/ACCEPTANCE_LOCAL.md`.

No password, token or secret value appears here.

---

## 1. Summary of implementation

Arena has accounts. An administrator creates them with `arena-admin`
on the host; there is no self-registration. A password becomes an
Argon2id hash, a login becomes a database-backed session, and the
session rides in an `HttpOnly` cookie that authenticates every request
and the WebSocket upgrade. Everything except health, version and the
status page requires one.

Roles are decided server-side on every request. Decks stay unowned
until Phase 4. No gameplay was added.

## 2. Final database migration

`server/src/main/resources/db/migration/V003__accounts.sql`, applied
on the host as part of `Successfully applied 3 migrations` on a fresh
database. Earlier migrations were not edited (§3.87).

## 3. User-table design

```text
app_user
  user_id              uuid        primary key
  username             text        as typed, for display
  username_normalized  text        UNIQUE, not null
  display_name         text        not null
  password_hash        text        not null, PHC Argon2id
  role                 text        not null  CHECK (PLAYER | ADMIN)
  status               text        not null  CHECK (ACTIVE | DISABLED)
  created_at           timestamptz not null
```

Uniqueness is on the normalized form, so the database — not
application code — decides that `RudeLeft` and `rudeleft` are one
account. Role and status are CHECK-constrained: an unknown value
cannot be written at all.

## 4. Session-table design

```text
user_session
  session_id    uuid        primary key
  user_id       uuid        not null references app_user
  token_sha256  char(64)    UNIQUE, not null
  created_at    timestamptz not null
  last_active_at timestamptz not null
  expires_at    timestamptz not null  CHECK (expires_at > created_at)
  revoked_at    timestamptz           null until revoked
```

Revocation sets a timestamp; rows are never deleted at revocation. The
CHECK constraint refused a test that tried to backdate expiry alone,
which was the constraint being right.

## 5. Username normalization

`Usernames.normalize`: trim, then lowercase with `Locale.ROOT`.
Permitted characters are letters, digits, dot, underscore, hyphen.

`Locale.ROOT` is deliberate — under a Turkish locale `"I".lowercase()`
is `"ı"`, so the server's locale would otherwise decide whether two
usernames collide.

## 6. Password policy

Minimum **12** characters, maximum 1024. No composition rules, no
expiry. Length is the property that helps; required symbols produce
`Password1!`. The maximum exists because Argon2's cost grows with
input.

Not implemented: screening against known-breached passwords.

## 7. Password hashing library

BouncyCastle 1.80 (`Argon2BytesGenerator`) — pure JVM, so there is no
native library to ship or to break on another base image.

## 8. Argon2id parameters

```text
memory 65536 KiB   iterations 3   parallelism 1
salt 16 bytes (SecureRandom, per hash)   output 32 bytes   version 1.3
```

Measured on the deployment host: **median 99 ms** (89/91/99/100/103).
Stored in PHC format, so an old hash still verifies under its own
recorded parameters and `needsRehash()` can flag it (§3.105).

## 9. Session-token design

32 bytes (256 bits) from `SecureRandom`, base64url, generated per
login. No structure, no claims, nothing to parse: the token is a
lookup key, and the database is the authority.

## 10. Session-token storage

Only `SHA-256(token)` is stored. Verified on the host: the raw cookie
appears in zero rows, its hash in exactly one.

SHA-256 rather than Argon2 here is deliberate — the token is a
256-bit random value with nothing to guess, looked up on every
request. A 100 ms KDF per request would be a self-inflicted denial of
service.

## 11. Cookie configuration

```text
proxicarena_session   HttpOnly  Secure  SameSite=Lax  Path=/  Max-Age=30d
proxicarena_csrf      readable  Secure  SameSite=Lax  Path=/  Max-Age=30d
```

`Secure` comes from `PROXIC_SECURE_COOKIES`, default true, switched
off only in the local override — a browser will not keep a `Secure`
cookie delivered over plain HTTP. The CSRF cookie is deliberately
readable; that asymmetry is the mechanism.

## 12. Idle session lifetime

7 days, as `last_active_at`, refreshed on each successful
authentication.

## 13. Absolute session lifetime

30 days, as `expires_at`, regardless of activity. Both windows are
enforced inside the same SQL statement as revocation and account
status, so no code path can check three of the four.

## 14. CSRF design

Double-submit plus an origin check, on every POST/PUT/PATCH/DELETE.
The token is echoed in `X-CSRF-Token` — header only, never a query
parameter, because a token in a URL reaches logs, referrers and
history. The origin must match the configured origin **or the
request's own Host**, the second clause added after the check refused
the application's own requests.

## 15. Login rate protection

10 failures per 15 minutes, keyed on `source + normalized username`,
cleared by a success. In-process. Keyed on the pair so that nobody can
lock a user out by failing logins at their name from elsewhere; the
account is never locked, and there is nothing to unlock.

## 16. Authentication API routes

```text
POST /api/auth/login          username + password -> session
POST /api/auth/logout         ends this session; quiet 204 either way
POST /api/auth/logout-all     ends every session this user holds
GET  /api/auth/me             200 with a null user when nobody
POST /api/auth/password       change password; revokes every session
POST /api/auth/display-name   change display name
```

## 17. Authorization / role model

`PLAYER` and `ADMIN`, resolved from the session on every request and
never read back from a client. `requireAuth` answers 401;
`requireAdmin` answers 403 for a signed-in non-admin. ADMIN currently
grants nothing extra over HTTP — account administration lives in
`arena-admin` behind host access. Full account:
`docs/architecture/AUTHORIZATION.md`.

## 18. Admin account-management commands

```text
arena-admin create <username> [--admin] [--name <display name>]
            list
            disable <username>
            enable <username>
            set-password <username>
            revoke-sessions <username>
```

Passwords are prompted for; `--password-stdin` exists for automation;
a password passed as an argument is **refused outright** (§3.58). The
last active administrator cannot be disabled (§3.110) — which is how
P3-K first failed, correctly.

## 19. Authenticated WebSocket behaviour

`/ws/user`: the session cookie authenticates the upgrade; anonymous,
unknown and revoked tokens close identically with `VIOLATED_POLICY`.
`HELLO` carries userId, username and displayName — never the token,
never a statement of permissions. The receive loop's 30-second timeout
doubles as a revalidation clock, so a revoked session ends a
connection already open; measured at about one second when a frame
arrives sooner. `/ws/system` stays anonymous (§3.83).

## 20. Frontend authentication routes

```text
/           public status page, plus identity and the way in (§3.69)
/login      sign in; safe return path only
/account    identity, role, display name, change password, sign out,
            sign out everywhere
/decks      protected
```

State comes from `/api/auth/me` at startup; "loading" is a real state
so the page never flashes a wrong answer. No token is stored in
`localStorage` or `sessionStorage` — there are zero uses of either in
the application.

## 21. Browser E2E test results

**27 passed, 0 failed**, against the running stack, including:
sign-in and return path, HttpOnly proven from the page's own point of
view, persistence across reload, sign-out, sign-out-everywhere across
two browser contexts, deck import, CSP with nothing refused, and the
home page's sign-in route.

## 22. Public production login test

Performed on `https://proxic.barnflix.net` by the owner: signed in,
imported a deck, remained signed in across a container restart.

## 23. Cookie security test result

See §11 — observed on the live `Set-Cookie` through the tunnel, values
masked.

## 24. Session restart-persistence result

Locally and in production. After `docker restart`, the same cookie
still authenticated and the deck was still listed.

## 25. CSRF test results

Missing header → 403 `CSRF_FAILED`, **and the display name was
unchanged**. With the header → 200 and the change applied. Foreign
origin → 403 `BAD_ORIGIN`, unchanged again. Each refusal is paired
with a check that the state did not move.

## 26. Rate-limit test result

```text
401 ×10, then 429 ×2; correct password while throttled -> 429
another user at the same moment -> 200
account status in the database -> ACTIVE
```

## 27. Admin-tool test results

Create from an empty database, list, disable, enable, set-password,
revoke-sessions and the refusal of `--password=` — all exercised
against a running stack, plus in-process tests.

## 28. WebSocket authentication test result

Six server tests and two browser-driven checks: identity matches the
login, a claimed `userId`/`role` is ignored, a PLAYER claiming ADMIN
stays a PLAYER, and revocation closes an open socket with code 1008.

## 29. Phase 2 deck-boundary result

Every deck endpoint answers 401 anonymously, artwork included
(verified with a real imported deck, not a guessed URL). No table
outside `app_user`/`user_session` carries a user column, so no deck
was assigned to anyone. See P3-Y in the gate.

## 30. Deviations

- **PHASE 3 AMENDMENT 1** supersedes §3.85 (owner decision D1): every
  deck endpoint requires a session, decks remain unowned.
- **P3-Z is partial.** Forge is clean. `Proxic_Arena_OLD` has one
  pre-existing deleted file, reported rather than restored, because
  writing there is forbidden by ISO-001.
- **`requireAdmin` guards no route.** Written and tested because
  §3.155 asks for the helper; unused because Phase 3 keeps
  administration off HTTP.

## 31. Unresolved concerns

- **Authentication events are not logged as events.** A failed login
  produces a generic request line with no username and no source IP.
  You could count 401s after an attack and learn nothing else. The
  smallest worthwhile improvement in the system.

  **Owner decision, 2026-10-16: deferred.** Not done now, and not
  forgotten -- it is carried into the Phase 4 proposals below, where
  the same request paths are touched anyway.
- **No alerting, no breached-password screening, no dependency
  scanning.** Each is a deliberate scale decision, not an oversight.
- **No `Cache-Control` on authentication responses.** Low risk behind
  a tunnel; still absent.
- **Port 8765 accepts cleartext logins from the LAN.** Browsers will
  not keep the cookie, but `curl` will. The trust boundary is the home
  network; closing it is a one-line change when that stops being
  acceptable.
- **No container memory or CPU limits.** Matters more in Phase 6,
  where each match is a ~611 MB child JVM.

## 32. Proposed requirements for Phase 4

1. **Ownership, finally.** `owner_user_id` on `imported_deck`, a
   migration policy for the decks that already exist, and a decision
   about whether existing decks become shared or owned.
2. **Authorization that uses the gate.** Per-deck rules, which is the
   first real caller `requireAdmin` and a per-resource check will
   have.
3. **Sharing model** — explicit, and decided before it is built.
4. **Authentication event logging**, carried from §31: username,
   source, outcome. Phase 4 touches these paths anyway.
5. **Keep the Phase 3 boundary**: no self-registration, no email, no
   OAuth, unless the owner asks.

Phase 4 does not begin automatically (§3.157).
