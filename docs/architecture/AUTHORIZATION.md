# Authorization

PHASE_03 §3.153. What an identity is permitted to do, once
`AUTHENTICATION.md` has established who it is.

This describes **only what is implemented**. Where a rule does not
exist yet, it says so rather than describing an intention.

---

## Roles

```text
PLAYER   the ordinary account. Everything the game needs.
ADMIN    PLAYER, plus account administration via arena-admin.
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
| `GET /api/health/live`, `/ready` | anyone |
| `GET /api/version` | anyone |
| `GET /ws/system` | anyone |
| `POST /api/auth/login`, `/logout` | anyone |
| `GET /api/auth/me` | anyone (answers "nobody") |
| `POST /api/auth/password`, `/display-name` | the signed-in user |
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

Account administration — create, list, disable, enable,
set-password, revoke-sessions — exists **only in `arena-admin`**, run inside the container by someone with
shell access to the host. There is no admin HTTP API and no admin
page.

That is a deliberate boundary: an operation that can lock everyone
out should require host access, not a browser session that might be
left open. It also means the ADMIN role currently grants nothing
extra **over HTTP** — an admin and a player are equally permitted at
every endpoint above.

The one rule the tool enforces itself: the **last active
administrator cannot be disabled** (§3.110).

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
- **Admin HTTP surface.** `Role` is resolved on every request and
  available at every route; a `requireAdmin` gate would be a few
  lines. None is written because nothing needs it.
- **Per-match authorization** (Phase 6). Seat and priority rules
  belong to the match, not to the role. The rule that holds now —
  the server decides, the client never asserts — is what those rules
  will attach to.
- **Hidden information** (Phase 6, and AGENTS.md). Authorization here
  is about endpoints; a player seeing only their own hand is a
  separate guarantee enforced where state is serialized, not by a
  role check.
