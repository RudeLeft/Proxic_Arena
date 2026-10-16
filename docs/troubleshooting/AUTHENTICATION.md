# Troubleshooting — authentication

PHASE_03 §3.154. Each entry names what you see, what it means, and
what to do about it.

The mechanism is `docs/architecture/AUTHENTICATION.md`; who may do
what is `docs/architecture/AUTHORIZATION.md`.

No command in this document takes a password as an argument. Every
one of them reads it from stdin, so nothing lands in shell history or
the process table.

---

## Read this first: sign in through the tunnel, not the LAN address

**Logging in at `http://<unraid-ip>:8765` will not work, and that is
by design** (owner decision D2).

In production the session cookie carries `Secure`, and a browser
refuses to keep a `Secure` cookie delivered over plain HTTP. The
login request succeeds, the server sets the cookie, the browser
discards it, and the next request looks anonymous — so the page
bounces straight back to the login form with no error. Nothing is
broken.

```text
sign in here       https://proxic.barnflix.net
diagnostics only   http://<unraid-ip>:8765
```

The LAN port is kept on purpose, for exactly the things that do not
need a session:

```bash
curl -s http://<unraid-ip>:8765/api/health/ready
```

If you want to prove the cookie is the cause, sign in through the
tunnel and watch the same browser reach `/decks` happily.

---

## Cannot create the first administrator

There is no self-registration, so the first account is made with
`arena-admin` inside the container.

```bash
printf '%s' 'the-password' | docker compose exec -T arena-server /app/bin/arena-admin create RudeLeft --admin --password-stdin
```

When it fails, it is almost always one of these:

| What you see | What it means |
|---|---|
| `database unavailable` | The server started before Postgres was ready, or `POSTGRES_PASSWORD` is wrong. See *Database unavailable* below. |
| `A password must be at least 12 characters.` | Exactly that. There are no other composition rules. |
| `A user named "..." already exists.` | Usernames are compared case-insensitively — `RudeLeft` and `rudeleft` are one account. `list` will show it. |
| `No such command` | The argument order is `create <username> [--admin] --password-stdin`. |
| nothing happens, no output | `docker compose exec` without `-T` gives the tool no stdin to read. |

On Git Bash for Windows, prefix the command with `MSYS_NO_PATHCONV=1`
or `/app/bin/arena-admin` is rewritten into a Windows path before
Docker ever sees it.

To confirm the account exists:

```bash
docker compose exec arena-server /app/bin/arena-admin list
```

```text
username              role    status    sessions
RudeLeft              ADMIN   ACTIVE    0
```

The session count is useful on its own: a user who "cannot stay
signed in" while that number climbs is making sessions successfully
and losing the cookie, which is the first section of this document.

---

## Login fails

The page says the same thing for every failure:

> That username and password do not match.

That wording is deliberate (§3.44). An unknown user, a wrong
password and a disabled account are **indistinguishable from the
outside**, because telling them apart tells an attacker which
usernames are real.

Work through it in this order:

1. `arena-admin list` — does the account exist, and is it `ACTIVE`?
2. Are you on the tunnel hostname rather than the LAN port? (See the
   first section.)
3. Reset the password (below) and try the new one immediately.
4. Only then look at the server log. A genuine failure logs the
   username and the reason; the password is never logged.

---

## Account disabled

`arena-admin list` shows `DISABLED`.

```bash
docker compose exec arena-server /app/bin/arena-admin enable RudeLeft
```

Disabling takes effect everywhere at once: new logins fail, existing
sessions stop working on their next request, and an open `/ws/user`
connection closes within 30 seconds. Re-enabling does **not** restore
revoked sessions — the user signs in again.

If `disable` refuses with `the last administrator cannot be
disabled`, that is §3.110 doing its job. Create or promote another
administrator first.

---

## Database unavailable

Authentication is the first thing to break when Postgres is not
there, because every login and every session check is a query.

```text
login page loads, sign in answers 500 or hangs
/api/health/ready reports database: unavailable
```

```bash
docker compose ps
docker compose logs --tail 50 postgres
curl -s http://<unraid-ip>:8765/api/health/ready
```

The server does **not** fail-fast at boot when the database is slow
(`initializationFailTimeout = -1`), so a server that is up with an
unavailable database is the expected picture during a restart, not a
contradiction. It recovers on its own once Postgres is healthy.

If Postgres itself is restart-looping, see
`docs/troubleshooting/FOUNDATION.md` — on this host it was `initdb`
refusing a data directory that already held files.

---

## The session expires immediately

You sign in, and the very next page is anonymous again.

Almost always the cookie, not the session:

1. **The LAN address over HTTP.** The first section of this document.
2. **A different hostname than you signed in on.** The cookie belongs
   to the host that set it; `proxic.barnflix.net` and the LAN IP do
   not share one.
3. **The clock.** Expiry is computed by Postgres (`now()`), so a
   badly wrong container clock can expire a session as it is created.
   `docker compose exec arena-server date`.
4. **Someone changed the password** — that revokes every session,
   including the one you just made, if the two raced.

A session that works and then stops after a week is not a fault:
idle lifetime is 7 days, absolute lifetime is 30.

---

## The cookie is not being sent

Check in the browser devtools, Application → Cookies:

```text
proxicarena_session   present, HttpOnly ticked
proxicarena_csrf      present, HttpOnly NOT ticked
```

- **Neither is there** after a successful login: the browser rejected
  them. `Secure` over HTTP (above) is the usual reason.
- **`proxicarena_session` is missing but the CSRF cookie is there**:
  something is stripping the cookie in transit — check the Cloudflare
  tunnel configuration before suspecting the server.
- **Both are there and requests are still anonymous**: the request is
  going somewhere else. Confirm the requests in the Network tab point
  at the same origin as the page.

`proxicarena_session` being unreadable from JavaScript is correct —
`document.cookie` must not show it. The CSRF cookie **must** be
readable; that asymmetry is the mechanism, not a bug.

---

## `CSRF_FAILED` — 403 on something that should have worked

The request did not echo the CSRF cookie in the `X-CSRF-Token`
header.

In the browser this means the call bypassed `apiFetch` in
`frontend/src/auth.ts` — every mutating call must go through it. This
exact fault shipped once: the deck client posted directly, and every
import answered 403.

Outside the browser (curl, a script, a test), send both:

```bash
curl -X POST https://proxic.barnflix.net/api/decks/... \
  -H "Cookie: proxicarena_session=...; proxicarena_csrf=TOKEN" \
  -H "X-CSRF-Token: TOKEN"
```

The token goes in the header only. A CSRF token accepted from a query
string would end up in logs, referrers and browser history.

---

## `BAD_ORIGIN` — 403 from the right page

The `Origin` of a mutating request matched neither the configured
origin nor the request's own `Host`.

- From the app itself: the proxy is rewriting `Host` or `Origin`.
  Compare the two headers in the Network tab; they should name the
  hostname you typed.
- From a tool: send an `Origin` header matching the site, or make the
  request without one.

Found in the first browser run of Phase 3, when the check refused the
application's **own** requests because only one of its several names
was configured. It now accepts the request's own Host for that
reason.

---

## Rate limit triggered

After 10 failed attempts for one username from one source within 15
minutes, further attempts are refused for the rest of the window.

Wait it out, or restart the server — the counter is in memory, not in
the database, so a restart clears it.

A **successful** login clears the counter immediately. The throttle
is keyed on source *and* username, so nobody can lock you out by
failing logins against your name from somewhere else. There is no
account lockout; nothing needs to be unlocked.

---

## The authenticated WebSocket is rejected

`/ws/user` closes immediately with `VIOLATED_POLICY`.

Every refusal looks the same — no cookie, an unknown token, a revoked
session and a disabled account are deliberately indistinguishable.
Work through it as a cookie problem first (above), because the socket
authenticates with the same cookie as everything else: if `/api/decks`
works in that browser, the socket will too.

A connection that opens and then **closes within 30 seconds** is a
different thing, and usually correct: the revalidation loop found the
session revoked, disabled or expired. Something ended that session —
a sign-out elsewhere, a password change, or `arena-admin disable`.

`/ws/system` needs no session at all. If that one is also failing,
the problem is not authentication.

---

## Password reset

There is no self-service reset, by design — no email is configured
and none should be. An administrator sets a new password:

```bash
printf '%s' 'the-new-password' | docker compose exec -T arena-server /app/bin/arena-admin set-password RudeLeft --password-stdin
```

Without `--password-stdin` it prompts for the password instead, which
is the better choice at a terminal. A password passed as an argument
is **refused outright**, not warned about.

Setting a new password **revokes every session for that user**. They
sign in again everywhere. To end their sessions without changing the
password:

```bash
docker compose exec arena-server /app/bin/arena-admin revoke-sessions RudeLeft
```

If every administrator password is lost, the only way back is a
`psql` session against the database — host access, which is the
boundary the design intends.

---

## "Sign out everywhere"

Changing a password at `/account` revokes **every** session for that
user, including the browser doing it. The page says so and signs you
out a moment later; that is the rule working, not a crash.

There is also a **Sign out everywhere** button on `/account`, which
ends every session without changing the password. It reports how many
it ended; if it says it could not, sessions elsewhere are still live
and it is worth retrying rather than assuming.

An administrator can do the same from the host:

```bash
docker compose exec arena-server /app/bin/arena-admin revoke-sessions RudeLeft
```
