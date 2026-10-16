# Phase 3 acceptance — local pass

PHASE_03 §3.156. Run 2026-10-16 against a stack built from an
**empty database**, so that P3-A is the real thing rather than a
re-run against accounts that already existed.

```text
docker compose -p proxic-arena-accept \
  -f docker-compose.yml -f docker-compose.local.yml up -d
```

A separate compose project gets its own volumes, so this pass could
not borrow state from the development stack and could not damage it.

**21 of 26 pass. 1 is a recorded deviation. 4 are blocked on the
production deployment and are not claimed here.**

Two accounts were used: `RudeLeft` (ADMIN, created by the documented
command) and `Pat` (PLAYER, created so that the last-admin guard did
not block the disable tests). Neither password appears in this
document.

---

## Results

| Test | Result |
| --- | --- |
| P3-A First administrator creation | **PASS** |
| P3-B Password storage | **PASS** |
| P3-C Login | **PASS** |
| P3-D Invalid credentials | **PASS** |
| P3-E Secure cookie through the tunnel | **BLOCKED** — production only |
| P3-F Database-backed session | **PASS** |
| P3-G Raw token not stored | **PASS** |
| P3-H Logout | **PASS** |
| P3-I Logout all | **PASS** |
| P3-J Password change | **PASS** |
| P3-K Disabled user | **PASS** |
| P3-L Re-enable user | **PASS** |
| P3-M Username normalization | **PASS** |
| P3-N Login rate protection | **PASS** |
| P3-O CSRF rejection | **PASS** |
| P3-P CSRF success | **PASS** |
| P3-Q Cross-origin protection | **PASS** |
| P3-R Protected browser route | **PASS** |
| P3-S Browser login persistence | **PASS** |
| P3-T Browser logout | **PASS** |
| P3-U Authenticated WebSocket | **PASS** |
| P3-V WebSocket impersonation protection | **PASS** |
| P3-W WebSocket session revocation | **PASS** |
| P3-X Public anonymous protection | **BLOCKED** — production only |
| P3-Y Phase 2 deck isolation | **DEVIATION** — see below |
| P3-Z Existing project integrity | **PARTIAL** — Forge clean; one pre-existing deletion in `Proxic_Arena_OLD` |

---

## The evidence

### P3-A — first administrator, from nothing

```text
select count(*) from app_user;  ->  0

POST /api/auth/login            ->  401   (no accounts exist at all)

arena-admin create RudeLeft --admin --password-stdin
  -> Created RudeLeft (ADMIN) 087c693a-c5c8-4a00-87ad-daf2a0e8a3eb

arena-admin list
  username   role    status   sessions
  RudeLeft   ADMIN   ACTIVE   0

POST /api/auth/login            ->  200, role ADMIN
```

The 401 before creation is the control: the login endpoint was
working, and refused because no account existed rather than because
nothing was listening.

### P3-B — password storage

```text
left(password_hash, 34)  ->  $argon2id$v=19$m=65536,t=3,p=1$Rfs
length(password_hash)    ->  97
rows containing the plaintext anywhere in app_user  ->  0
```

The parameters in the stored hash are the documented ones
(`m=65536, t=3, p=1`), read back out of the database rather than
asserted from the source.

### P3-C / P3-D — login, and failures that say nothing

A correct password returns the user and sets both cookies. A wrong
password and an unknown username return **byte-identical** bodies:

```text
{"errorCode":"INVALID_CREDENTIALS",
 "detail":"That username and password do not match.","requestId":null}   401
```

### P3-F — the session is in the database, not in memory

```text
/api/auth/me               -> authenticated: true
docker compose restart arena-server
/api/auth/me (same cookie) -> authenticated: true
```

### P3-G — the raw token is not stored

```text
cookie length                                    43  (32 bytes, base64url)
stored token_sha256 length                       64  (hex SHA-256)
rows where token_sha256 = the cookie value        0
rows where token_sha256 = sha256(cookie value)    1
```

The second line is what makes the first one mean something: the
token is absent *and* the stored value is provably its hash.

### P3-H / P3-I — logout and logout-all

```text
POST /api/auth/logout        -> 204
  old cookie -> authenticated: false, /api/decks -> 401

three sessions open, one call:
POST /api/auth/logout-all    -> {"revokedSessions":5}
  all three cookies -> authenticated: false
```

Five rather than three: earlier sessions from the CSRF tests were
still live, and "every session" includes the ones you have forgotten
about. That is the point of the endpoint.

### P3-J — a password change revokes everything

```text
POST /api/auth/password   -> 204
  the other session  -> authenticated: false
  the session that made the change -> authenticated: false
  old password -> 401
  new password -> 200
```

### P3-K / P3-L — disable and re-enable

The first attempt disabled nobody, which is itself the proof of
§3.110:

```text
arena-admin disable RudeLeft
  -> Refusing: "RudeLeft" is the only active administrator.
     Create another admin first, or this installation would have none.
```

With a second account:

```text
arena-admin disable Pat   -> Pat is now DISABLED and their sessions were revoked.
  live session -> authenticated: false ; /api/decks -> 401
  new login    -> 401, the same message as a wrong password

arena-admin enable Pat    -> Pat is now ACTIVE.
  fresh login        -> 200
  the old cookie     -> authenticated: false   (revoked stays revoked)
```

### P3-M — username normalization

```text
create rudeleft  -> A user named "rudeleft" already exists.
create RUDELEFT  -> A user named "RUDELEFT" already exists.

login as RudeLeft / rudeleft / RUDELEFT / RuDeLeFt  -> all 200, all "RudeLeft"
login with the password in the wrong case           -> 401
```

The last line is the negative control: the *username* is
case-insensitive, the password is not.

### P3-N — rate protection, not a lockout

```text
12 wrong passwords for Pat:
  401 401 401 401 401 401 401 401 401 401 429 429

correct password while throttled -> 429
  "Too many sign-in attempts. Try again in 886 seconds."
RudeLeft at the same moment      -> 200   (no account-wide lockout)
Pat's status in the database     -> ACTIVE (nothing to unlock)

after restarting the server      -> 200   (the counter is in memory)
```

Throttling begins at exactly the eleventh attempt, and nothing about
the account changed.

### P3-O / P3-P / P3-Q — CSRF and origin

```text
POST display-name, cookies but NO X-CSRF-Token   -> 403 CSRF_FAILED
  display name afterwards: unchanged ("RudeLeft")

the same request WITH the header                 -> 200, name changed

valid CSRF, Origin: https://evil.example.com     -> 403 BAD_ORIGIN
  display name afterwards: unchanged
```

Each refusal is paired with a check that the state did not move. A
403 that still performed the write would otherwise read as a pass.

### P3-R / P3-S / P3-T — the browser

26 Playwright tests against this stack, 0 failed, including the
redirect to `/login` with the intended destination preserved, the
session surviving a reload, sign-out re-protecting the page, and
"sign out everywhere" ending a session held in a **second browser
context**.

### P3-U / P3-V — WebSocket identity, and impersonation

From the page's own JavaScript:

```text
login as RudeLeft -> userId 087c693a-…
HELLO             -> userId 087c693a-…, username RudeLeft
                     (no token in the frame)
sent {"type":"PING","userId":"000…0","username":"Pat","role":"ADMIN"}
                  -> PONG. The claim was ignored.
```

And with a genuinely different user:

```text
login as Pat (PLAYER)
socket opened, first frame sent claims to be RudeLeft/ADMIN
HELLO -> userId c24be305-…, username "Pat"
```

User A cannot become user B by saying so.

### P3-W — revocation reaches an open socket

```text
t=17ms    HELLO
t=32ms    POST /api/auth/logout-all -> revokedSessions: 3
t=1040ms  SESSION_ENDED, socket closed with code 1008
```

Code 1008 is `VIOLATED_POLICY`. The 30-second revalidation tick would
have caught it unprompted; a PING a second later made it immediate.

### P3-Y — Phase 2 deck isolation: a recorded deviation

Taken literally, §3.85 says Phase 3 must not expose the deck APIs as
a shared global library to authenticated users. **PHASE 3 AMENDMENT 1
supersedes it**, by owner decision D1, because §3.85 defers to a
"Phase 2 production safety boundary" that PHASE 2 AMENDMENT 1 had
already removed. Decks are visible to every authenticated user, and
that is the decision on record rather than an oversight.

What was verified here is what the amendment actually requires:

```text
tables: app_user, art_asset, deck_entry, imported_deck, user_session
columns referencing a user outside app_user/user_session:  none
```

So §3.86 holds in the strongest form — ownership was not
implemented early, and no deck was assigned to the first admin or to
anyone else, because there is nowhere to record such a thing.

And the APIs are not open:

```text
GET  /api/decks                      -> 401
GET  /api/decks/{id}                 -> 401
POST /api/decks/import               -> 401
GET  /api/decks/{id}/assets/{sha}    -> 401 anonymous
                                     -> 200 image/png 377379 bytes signed in
```

The artwork line was worth running: a 404 on a mistyped art path
looked at first like an unguarded route, and only a real imported
deck proved otherwise.

### P3-Z — project integrity: partial

**Forge: clean.**

```text
spikes/forge-phase0a/forge-upstream  HEAD = 4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
forge-pin.properties forge.commit    = 4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
git status (tracked files)           = no modifications
forge_patches/                       = README.md only, as §1.62 requires
```

**`Proxic_Arena_OLD`: one file is missing, and it is not from this
phase.**

```text
git -C Proxic_Arena_OLD status --porcelain
 D Proxic_Arena_Complete_Build_Plan.docx

find Proxic_Arena_OLD -type f -newermt 2026-10-15   -> nothing
```

Nothing has been modified there during Phase 3. The deletion is
recoverable (75,236 bytes, in commit `6247e977`), but restoring it
means **writing** to `Proxic_Arena_OLD`, which AGENTS.md ISO-001
forbids without the owner saying so. Left as it is, reported here.

---

## Blocked on deployment

These four name the production hostname and cannot be faked locally:

- **P3-E** — the cookie's `Secure`, `HttpOnly`, `SameSite` and `Path`
  attributes through `https://proxic.barnflix.net`. Locally the stack
  deliberately runs with `PROXIC_SECURE_COOKIES=false`, because a
  browser will not keep a `Secure` cookie over plain HTTP. The flag's
  behaviour is covered by a server test; the real header through the
  tunnel is not yet observed.
- **P3-X** — anonymous users blocked through the production hostname.
- Production login through `proxic.barnflix.net` (§3.155 deployment).
- Authentication surviving a container restart **on the host**
  (proven locally in P3-F; not yet on Unraid).
