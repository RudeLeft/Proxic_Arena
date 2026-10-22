# Authentication

PHASE_03 §3.152. How Proxic Arena decides who someone is, and what
each decision is defended against.

Authorization — what an identity may then do — is
`AUTHORIZATION.md`. When something does not work, go to
`docs/operations/troubleshooting/AUTHENTICATION.md`.

No password, token or secret value appears in this document, in the
logs, or in any API response.

---

## Identity

An account is a row in `app_user` (migration `V003__accounts.sql`):

```text
user_id              uuid, primary key
username             as typed, for display
username_normalized  unique; what uniqueness is actually decided on
display_name         free text, changeable by its owner
password_hash        PHC-encoded Argon2id (never the password)
role                 PLAYER | ADMIN      (CHECK constraint)
status               ACTIVE | DISABLED   (CHECK constraint)
```

There is **no self-registration**. Accounts exist because an
administrator created them (§3.106, and the login page says so).

### Username normalization

`Usernames.normalize` lowercases with `Locale.ROOT` and trims. The
normalized form carries the UNIQUE constraint, so `RudeLeft`,
`rudeleft` and `RUDELEFT` are one account, and the database — not
application code — is what guarantees it.

`Locale.ROOT` is deliberate: under a Turkish locale `"I".lowercase()`
is `"ı"`, so the server's locale would otherwise decide whether two
usernames collide.

Allowed characters are letters, digits, dot, underscore and hyphen.

---

## Passwords

### Hashing

Argon2id via BouncyCastle (`PasswordHasher.kt`) — a pure-JVM
implementation, so there is no native library to ship or to break on
a different base image.

```text
memory       65536 KiB (64 MB)
iterations   3
parallelism  1
salt         16 bytes, fresh per hash, from SecureRandom
output       32 bytes
version      1.3 (0x13)
```

These are the OWASP-recommended Argon2id settings. Measured on the
deployment host: **median 99 ms** per hash (89/91/99/100/103 ms),
which is the intended cost — fast enough for a human signing in, slow
enough that an offline attacker pays for every guess.

A hash is stored in the standard **PHC string format**, which carries
its own parameters:

```text
$argon2id$v=19$m=65536,t=3,p=1$<salt>$<hash>
```

That matters for raising the cost later: an old hash still verifies
under its own recorded parameters. `needsRehash()` reports a hash
weaker than today's settings (§3.105), so one can be upgraded on the
next successful login rather than invalidating everyone's password.

### Password rules

Minimum **12 characters**; maximum 1024. Nothing else — no required
symbol, no forced digit, no expiry. Composition rules push people
toward `Password1!` and away from length, which is the only property
that reliably helps.

The maximum exists because Argon2 cost grows with input: without a
bound, a multi-megabyte "password" is a free denial of service.

### Verification

Constant-time comparison (`MessageDigest.isEqual`).

A login for an unknown user still performs a **dummy hash**, so a
missing account and a wrong password take the same time. Without
that, response timing alone enumerates valid usernames.

---

## Sessions

### Tokens

```text
generated   32 bytes (256 bits) from SecureRandom, base64url
stored      SHA-256 of the token, in user_session.token_sha256
sent        only in the session cookie, only to the browser
```

The database holds **only the hash** (§3.21): a database dump, a
backup on a NAS or a stray `pg_dump` does not hand anyone live
sessions.

SHA-256 rather than Argon2 here is deliberate and is not a weaker
choice: the token is a 256-bit random value with nothing to guess,
and a session is looked up on **every request**. A 100 ms KDF per
request would be a self-inflicted denial of service.

### Lifetime

```text
idle       7 days  — last_active_at must be within the window
absolute  30 days  — expires_at, regardless of activity
```

Both are enforced in the `authenticate` query itself, together with
`revoked_at IS NULL` and `u.status = 'ACTIVE'`. One SQL statement
decides it, so there is no path that checks three of the four
conditions and forgets the fourth.

A successful authentication updates `last_active_at`, which is what
makes the idle window a sliding one.

### Revocation

Sessions are **revoked, never deleted** — `revoked_at` is set to a
timestamp. A deleted row answers no questions afterwards; a revoked
one still shows that a session existed, when it started and when it
ended.

A session ends when: the user signs out, the user changes their
password (every session, see below), an administrator disables the
account, or either lifetime runs out.

---

## Cookies

```text
proxicarena_session   HttpOnly, SameSite=Lax, Path=/, Max-Age=30d
proxicarena_csrf      readable by JS, SameSite=Lax, Path=/, Max-Age=30d
```

`Secure` is set from `PROXIC_SECURE_COOKIES`, default **true**. It is
switched off only in `docker-compose.local.yml`, because a browser
will not keep a `Secure` cookie delivered over plain HTTP — a local
stack would otherwise appear to sign you in and then immediately not
know you. In production, Cloudflare terminates TLS and the flag stays
on.

The session cookie is `HttpOnly` so that script cannot read it; the
CSRF cookie is deliberately **not**, because the page must read it to
echo it back. That asymmetry is the whole mechanism, not an
oversight.

Cookies are written with Ktor's default encoding rather than RAW: a
RAW cookie gets a `$x-enc=RAW` marker appended as an attribute no
browser asked for.

---

## CSRF protection

Two independent gates on every mutating request (POST/PUT/PATCH/
DELETE):

1. **Double submit.** The CSRF token is in a readable cookie and must
   be echoed in the `X-CSRF-Token` **header**. A cross-site attacker
   can cause the cookie to be sent but cannot read it to set the
   header.
2. **Origin check.** The `Origin`/`Referer` must be the configured
   origin **or the request's own Host**.

The header, never a query parameter: a token in a URL ends up in
logs, referrers and browser history.

The "or its own Host" clause was added after the first browser test:
the check was refusing the application's **own** requests with
`BAD_ORIGIN`, because the app is reached by several names (LAN
address, tunnel hostname) and only one of them was configured.

Failures answer `403` with `BAD_ORIGIN` or `CSRF_FAILED`.

---

## Login rate protection

In-process, keyed on `source + normalized username`:

```text
10 failed attempts per 15 minutes
```

A success clears the counter. Expired entries are evicted rather than
accumulating.

Keyed on the pair, not on the username alone, so that one attacker
cannot lock a legitimate user out by failing logins against their
name from elsewhere.

In-process is honest about what it is: this is one server, and the
limit is a brake on guessing, not a distributed defence.

---

## The endpoints

```text
POST /api/auth/login          username + password -> session
POST /api/auth/logout         ends this session; quiet success if none
POST /api/auth/logout-all     ends EVERY session this user holds
GET  /api/auth/me             who am I (200 with a null user if nobody)
POST /api/auth/password       change password; revokes EVERY session
POST /api/auth/display-name   change display name
```

`/api/auth/me` answers 200 for an anonymous caller rather than 401:
"nobody is signed in" is a normal answer to that question, and the
page needs it on every load.

A **password change revokes every session, including the one making
the request** (§3.36). That is the point: a password is changed
because it may be compromised, and leaving other sessions alive would
defeat the change. The account page says so before it happens, so
being signed out does not look like a bug.

`/api/auth/logout-all` is what someone reaches for after using a
shared computer. It needs a session, because "revoke everything" must
name *whose* everything and the only trustworthy answer is the
caller's own session — never a username in the body. It reports how
many sessions it ended, so the page can say something true rather
than a reassuring guess.

The login response never contains the token — it is set as a cookie
and nowhere else, which a test asserts directly.

---

## Administration

`arena-admin`, run inside the container:

```text
create <username> [--admin] [--name <display name>]
list
disable <username>
enable  <username>
set-password <username>
revoke-sessions <username>
```

Each command that needs a password prompts for it. `--password-stdin`
reads it from stdin instead, which is the automation path.

- A password **given as an argument is refused**, not used with a
  warning (§3.58): a warned-about password is still in shell history
  and in process listings, and the account would exist with a
  compromised password. The guard matches `--password` exactly, after
  the first version of it refused `--password-stdin` — the very
  automation path it was meant to leave open.
- `set-password` and `revoke-sessions` both end every session for
  that user. `set-password` is the administrator's reset: there is no
  self-service reset and no email to send one with.
- The **last active administrator cannot be disabled** (§3.110).
  Locking everyone out of account management would otherwise require
  a database session to undo.
- The tool returns a result value rather than calling `exitProcess`,
  so its behaviour is testable in-process.

The first administrator is created this way; see
`docs/operations/UNRAID_CHECKLIST.md`.

---

## Expired-session cleanup

A background sweep every 6 hours deletes `user_session` rows **30
days past expiry** and evicts stale throttle entries. The first run
is 5 minutes after boot, because startup is the busiest moment the
server has.

It is housekeeping, not security: `authenticate` already refuses
expired, revoked and disabled sessions, so if the sweep stopped
running the only consequence would be a larger table. Rows are kept
long past expiry on purpose — the row is the record that the session
existed.

The sweep catches its own exceptions, because
`scheduleWithFixedDelay` silently stops rescheduling a task that
throws: one transient database error would otherwise end cleanup for
the lifetime of the process.

> Found during the Phase 3 gate audit: the purge and the throttle
> eviction were both implemented, both tested, and neither was ever
> called. A cleanup function nothing runs is not cleanup.

---

## The authenticated WebSocket

`/ws/user` (§3.77–§3.82):

- The **session cookie authenticates the upgrade**. No cookie, an
  unknown token and a revoked token are all closed identically with
  `VIOLATED_POLICY`.
- The `HELLO` frame carries `userId`, `username` and `displayName` —
  identity only. Never the token, and never a statement of what the
  user may do: authorization is decided server-side per action, never
  read back from a client.
- **Authorised at connect is not authorised now.** The receive loop's
  30-second timeout doubles as a revalidation clock: the token is
  re-resolved from the database and the session id compared, so a
  revoked session ends a connection that is already open. Revocation
  that only refused *new* connections would leave the live one — the
  dangerous one — untouched.
- Logs carry connection id, session id and user id. Never the token:
  logs are copied, shipped and kept.

`/ws/system` stays **anonymous** (§3.83) — it is infrastructure
status, and a signed-out visitor is meant to see it.

---

## What is deliberately not here

- No self-registration, no password reset by email, no "remember me",
  no OAuth, no second factor.
- No account lockout — a throttle, not a lock, so a user cannot be
  locked out by someone else failing logins at their name.
- No HSTS from this server: Cloudflare owns it (see
  `SecurityHeaders.kt`).

---

## What gets logged

§3.94–§3.97. Thirteen event types, all through one function so
there is a single place to get this wrong:

```text
LOGIN_SUCCESS     LOGIN_FAILURE     LOGIN_THROTTLED
LOGOUT            LOGOUT_EVERYWHERE
PASSWORD_CHANGED  DISPLAY_NAME_CHANGED
SESSION_REVOKED   SESSION_EXPIRED_IN_FLIGHT
USER_CREATED      USER_DISABLED     USER_ENABLED
ADMIN_PASSWORD_RESET
```

One line, fixed shape, so it greps:

```text
auth event=LOGIN_FAILURE result=FAILURE username=rudeleft
```

The request id, connection id, session id and user id ride in the
MDC rather than the message, so they appear on every line in a
request's scope without each call site passing them.

**Never written, by §3.95:** the password (not even its length), the
raw session token, the CSRF token, the password hash. The session
**id** is fine and is logged; the **token** is not.

§3.96 permits recording the attempted username on a failure, and it
is recorded — a brute-force attempt is illegible without it, and a
username is not a secret.

The account-changing events (created, disabled, enabled, password
changed) are emitted by `Accounts`, not by the routes. Those
operations have one implementation and several callers — the admin
CLI, the account page, and whatever comes next — and an event
attached to callers is an event some caller forgets.
