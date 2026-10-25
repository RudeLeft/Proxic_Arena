# Authorization

PHASE_03 §3.153. What an identity is permitted to do, once
`AUTHENTICATION.md` has established who it is.

This describes **only what is implemented**. Where a rule does not
exist yet, it says so rather than describing an intention.

---

## Roles

```text
PLAYER   the ordinary account. Everything the game needs.
ADMIN    PLAYER, plus account administration: arena-admin on the host,
         and since PHASE_07 §7.67 the Admin page (/api/admin/*).
```

Two roles, because two is what the product currently distinguishes.
The role lives in `app_user.role` under a CHECK constraint, so an
unknown role cannot be written at all.

> **Naming.** The specification calls the ordinary role "USER"; the
> code calls it `PLAYER`, which is what this project calls the people
> who use it everywhere else. Same role, and the account page shows
> whichever the database holds.

---

## The authenticated principal

```kotlin
Principal(user: User, sessionId: UUID)
```

Resolved from the session cookie on each request by
`call.principal(sessions)`. It is **never** built from anything the
client sends about itself. The browser is told the role so the page
can show it; the server re-derives it from the session every time and
never reads it back from a request body, header or WebSocket frame.

`call.requireAuth(sessions)` is the gate: it returns the principal,
or answers `401 UNAUTHENTICATED` and returns null.

`401`, not `403`, for an unauthenticated caller — 403 means "I know
who you are and you still may not" — and not a redirect, which an API
client cannot usefully follow. The browser turns the 401 into a trip
to `/login` itself.

---

## Route protection

| Route | Who |
|---|---|
| the app's page (any address that is not a file) | anyone -- it is the sign-in screen |
| the built files the sign-in screen needs (named by the build manifest) | anyone |
| every other built file (`/assets/…`) | the signed-in user (`private` cache) |
| `GET /api/health/live`, `/ready` | the server's own container only (127.0.0.1); 404 from anywhere else |
| `POST /api/auth/login`, `/logout` | anyone (logout is a quiet 204 either way) |
| `GET /api/auth/me` | anyone (204, nothing, when not signed in) |
| `GET /api/version`, `/api/system/status`, `/ws/system` | the signed-in user |
| any other `/api/…` address, real or not | the signed-in user -- a stranger gets the same 401 for all |
| `POST /api/auth/password`, `/display-name` | the signed-in user |
| `POST /api/auth/logout-all` | the signed-in user, for their own sessions only |
| **every** `/api/decks` route | any signed-in user |
| `GET /ws/user` | any signed-in user |

Two decisions shape this table:

**Owner decision D1 — authentication for everything.** Every deck
endpoint requires a session, reads included. This replaced the
anonymous access Phase 2 allowed, which existed only because there
was no authentication to require yet.

**Health and version stay public** (§3.83, §3.84). A monitor must not
need credentials, and owner decision D2 keeps the LAN port useful for
exactly that.

### Decks are unowned

A deck has **no owner** (§3.86). Any signed-in user sees every deck
and may import or delete any of them. That is the intended shape for
a two-player server among people who know each other, not an omission
— per-deck ownership would be a schema change and a set of rules this
phase does not have.

What authentication bought here is accountability and a closed door,
not separation: nothing reaches the deck API without a session.

---

## Admin-only operations

Account administration — create, list, disable, enable, set a
password, revoke sessions, and (PHASE_07) change a role — is in two
places:

- **`arena-admin`**, run inside the container by someone with shell
  access to the host. It stays (§7.67) and is the recovery tool.
- **The Admin page**, `/api/admin/*` (PHASE_07 §7.67, amending Phase
  3's "host only"). Every route calls `requireAdmin` — 401 for nobody,
  403 for a player — and CSRF on every change. It also shows the open
  rooms with **force close** (a running match ends with no winner, as
  Abandon), the server's state, and the last day of **sign-in
  activity** with each attempt's address (`sign_in_event`, Amendment
  9). Every admin action is written to the server log and to
  `admin_action` (who, what, to which account or room, when); never a
  password.

**Accepted trade-off (owner decision 15):** no password re-entry and no
home-network restriction, so a browser left signed in as an
administrator can change accounts. Recorded so it is a decision, not a
discovery.

The rule both enforce: the **last active administrator cannot be
disabled or demoted**, by anyone, themselves included (§3.110, §7.67).
The page checks it inside the transaction that makes the change, with
every active administrator's row locked, so two administrators
disabling each other at once cannot leave none.

---

## Disabled users

`status = 'DISABLED'` is checked inside the same SQL statement that
resolves a session, so it takes effect everywhere at once:

- New logins fail, with the same message as a wrong password.
- Existing sessions stop authenticating on their next request.
- An **open** `/ws/user` connection is closed within 30 seconds by
  the revalidation loop.

A disabled user is never told they are disabled (§3.44) — the login
answer is identical to a wrong password, because "that account exists
but is disabled" is information an attacker can use.

---

## Future extension points

Where a later phase would attach, and what already exists for it:

- **Per-deck or per-match ownership.** `Principal` carries `userId`;
  nothing stores it against a deck yet. This is the schema change
  that unowned decks defer.
- **Admin HTTP surface.** Built in PHASE_07 (§7.67) on
  `call.requireAdmin(sessions)`; see "Admin-only operations" above.
- **Per-match authorization** (Phase 6). Seat and priority rules
  belong to the match, not to the role. The rule that holds now —
  the server decides, the client never asserts — is what those rules
  will attach to.
- **Hidden information** (Phase 6, and AGENTS.md). Authorization here
  is about endpoints; a player seeing only their own hand is a
  separate guarantee enforced where state is serialized, not by a
  role check.
