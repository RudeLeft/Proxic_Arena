# Proxic Arena Build Plan

# Phase 3 — Accounts & Authentication

**Status:** LOCKED 2026-10-16 (reviewed against Phases 0A, 1 and 2)  
**Phase Type:** Production feature / security foundation  
**Depends On:** Completed and accepted Phase 2  
**Primary Goal:** Establish secure authenticated user identity for Proxic Arena  
**Deck Ownership:** NOT IMPLEMENTED IN THIS PHASE  
**Deck Sharing:** NOT IMPLEMENTED IN THIS PHASE  
**Gameplay:** NOT IMPLEMENTED IN THIS PHASE


> **LOCKED 2026-10-16.** Phase 0A is accepted, and Phases 1 and 2
> have both passed their gates, so the ground this phase stands on is
> built rather than assumed.
>
> The original 162 sections are unchanged. **Everything added by this
> review is in the two sections below** — nothing was edited
> silently.

---

## Carry-forward from Phases 1 and 2

Six things already built that change how a section here must be
done. Each names the section it binds.

### C1 — `V003` lives in the server's resources (§3.87)

`server/src/main/resources/db/migration/V003__accounts.sql`.

**Not** in `database/`, which exists, is empty, and is a trap:
Flyway loads from `classpath:db/migration`, so a migration placed
there never runs and nothing reports an error.

The schema test asserts the EXACT set of tables, so adding `users`
and `sessions` means updating that assertion in the same commit —
which is how §1.36's no-speculative-schema guard stays alive.

### C2 — Argon2id needs a pinned dependency and a refreshed lockfile (§3.12)

The JVM has no Argon2id in its standard library. Adding one means a
version in `gradle.properties` and
`./gradlew :server:dependencies --write-locks`, or the build fails
with a lock mismatch — which is the lockfile working.

§3.12 forbids implementing the primitive by hand, and that is not a
style preference: a hand-rolled KDF is the single worst thing in
this specification to get subtly wrong.

### C3 — The secret machinery already exists (§3.92, §3.93)

`ServerConfig` already reads `PROXIC_SESSION_SECRET`, redacts
secrets in `toString`, and refuses to start in production on a
missing or placeholder value (exit 78). The CSRF secret joins that
same path rather than inventing a second one.

`ServerConfig.toString()` is overridden precisely so logging the
config cannot leak a secret. Any new secret field must be `private`
with an accessor, like the existing two.

### C4 — Login throttling belongs beside the existing limits (§3.45, §3.46)

`Limits.kt` already holds the body, frame, connection and timeout
ceilings with the reasoning beside each number. The login limiter
goes there, in-process, no Redis (§3.45 says so explicitly).

Every limit in that file is tested with a **negative control** — a
limit that refuses everything passes a "too many" test perfectly
while breaking the application. The login limiter needs the same: a
test that a legitimate user can still log in after someone else
failed.

### C5 — The CSP must not break what already works (§3.100)

The deployed page already runs React, PixiJS and a same-origin
WebSocket, and serves card art from `/api/decks/{id}/assets/{hash}`.

A CSP is only verified by loading the real page and reading the
console — and the browser suite already fails on console errors
(§1.79), so a CSP that breaks Pixi fails the existing tests rather
than reaching the host.

### C6 — `Secure` cookies and the published LAN port interact (§3.22, §3.23)

PHASE 2 AMENDMENT 2 publishes the server on host port 8765 so the
LAN can reach it directly, over **plain HTTP**.

A `Secure` cookie is not sent over HTTP. So once authentication
exists, **logging in over `http://<unraid-ip>:8765` cannot work** —
the cookie is set and never returned. Through
`https://proxic.barnflix.net` it works normally.

§3.23 is explicit that `Secure` must not be dropped because the
tunnel origin is HTTP, so the cookie is not the thing to change.
See decision D2.

---

## Owner decisions — RESOLVED 2026-10-16

### D1 — **Every deck endpoint requires authentication**

Import, list, detail, delete and artwork all require a session.
This closes the exposure PHASE 2 AMENDMENT 1 opened, and is
recorded as **PHASE 3 AMENDMENT 1** below, because §3.85 described
a Phase 2 boundary that no longer exists.

Decks remain **unowned** (§3.86). Any authenticated user sees every
deck, and none are assigned to anybody — not the first admin, not
the first user to log in. Phase 4 defines ownership.

`DECK_IMPORT_ENABLED` loses its security role. It stays as an
operational switch, but the thing protecting import is now a
session.

### D2 — **Port 8765 stays, for diagnostics only**

Health, version and status remain reachable on the LAN for
troubleshooting. Anything requiring a session works only through
`https://proxic.barnflix.net`, because a `Secure` cookie is not
sent over plain HTTP.

This is a documented limitation rather than a bug, and the
authentication troubleshooting document (§3.154) must say so
plainly — "login does nothing on the LAN address" is otherwise an
afternoon lost.

### D3 — **The first administrator is `RudeLeft`**

Created by the owner running the admin tool. §3.57 forbids shipping
or auto-creating credentials; §3.58 requires the password to be
typed rather than passed as an argument, and §3.139 tests that a
password given on the command line is refused.

The password is never seen by me, never stored in this repository,
and never appears in conversation.

---

## PHASE 3 AMENDMENT 1

**Reason:**
§3.85 defers deck-API protection to "the Phase 2 production safety
boundary". PHASE 2 AMENDMENT 1 removed that boundary by enabling
anonymous import in production, so §3.85 now refers to something
that does not exist.

**Affected requirement:** §3.85, and PHASE 2 AMENDMENT 1.

**Old decision:**
Deck upload, listing, detail, artwork access and deletion remain
restricted by the Phase 2 boundary until Phase 4.

**New decision:**
Every deck endpoint requires an authenticated session from Phase 3
onward. PHASE 2 AMENDMENT 1's anonymous access ends when
authentication ships. Decks remain unowned until Phase 4.

**Evidence:**
Owner decision 2026-10-16, taken with the alternatives stated: auth
for everything, auth for mutation only, or leaving it anonymous.

**Affected later phases:**
Phase 4 adds ownership on top of this, rather than introducing
protection for the first time.

**Approved by project owner:** yes, 2026-10-16
**Date:** 2026-10-16

---



**Phase-0A dependency: effectively none.**

Accounts, password hashing, sessions and cookies do not touch Forge. This
phase is PROVISIONAL only because it sits downstream of Phase 1 in the
gate order, not because 0A can change its content.

Treat its security decisions as settled.

---

## 3.0 Purpose

Phase 3 adds permanent user accounts and authentication to Proxic Arena.

The desired application flow begins to become:

```text
Visit arena.barnflix.net
        ↓
Not authenticated
        ↓
Login
        ↓
Authenticated Arena user
        ↓
Application
```

At the end of Phase 3, Proxic Arena must know:

```text
who the current user is
whether the user's account is active
whether the user is an administrator
which authenticated session is making a request
which authenticated user owns a WebSocket connection
```

This creates the identity and authorization foundation required by later phases.

Phase 3 does **not** yet implement:

```text
deck ownership
Deck Depot
deck sharing
match creation
lobby
battlefield
gameplay
```

---

## 3.1 Phase 3 Execution Gate

This section defines conditions that must be true when Phase 3 implementation begins.

Do not begin Phase 3 implementation until:

```text
Phase 0 has been executed and its results accepted

Phase 1 has been fully implemented and accepted

Phase 1 mandatory acceptance tests have passed

Phase 2 has been fully implemented and accepted

Phase 2 mandatory acceptance tests have passed
```

Once those prior phases have been implemented and accepted, Phase 3 may rely on the capabilities they established, including:

```text
the PostgreSQL foundation from Phase 1

the Kotlin/Ktor Arena Server from Phase 1

the React frontend from Phase 1

the WebSocket foundation from Phase 1

the Docker and Cloudflare deployment from Phase 1

the persistent deck-import and storage foundation from Phase 2
```

If a capability required from a prior phase is missing, incomplete, or materially conflicts with its locked specification:

**STOP AND REPORT THE CONFLICT.**

Do not:

```text
silently rebuild the missing capability
bypass the earlier phase
replace an accepted earlier architecture
invent a substitute implementation
```

unless the project owner explicitly approves the required change.

---

## 3.2 Account Model

Every permanent user receives an immutable Arena user ID.

Recommended:

```text
UUID
```

User identity must not depend on:

```text
display name
username casing
session ID
browser
IP address
```

Conceptually:

```text
User
├── user_id
├── username
├── normalized_username
├── display_name
├── password_hash
├── role
├── status
├── created_at
├── updated_at
└── last_login_at
```

Exact schema may adapt to implementation needs.

---

## 3.3 User ID Is Permanent

The user ID is the permanent internal identity later systems will reference.

Future relationships such as:

```text
deck.owner_user_id
match.player_user_id
deck_share.user_id
```

must use the immutable user ID.

Do not use username as a foreign key.

---

## 3.4 Username

Username is the login identifier.

Recommended rules:

```text
3–32 characters
ASCII letters
digits
underscore
hyphen
```

Usernames should be treated case-insensitively for login and uniqueness.

For example:

```text
Eric
eric
ERIC
```

must not become three separate accounts.

---

## 3.5 Username Normalization

Store or derive a canonical normalized username.

Conceptually:

```text
Eric
    ↓
eric
```

Unique constraints must apply to the normalized form.

Do not rely solely on frontend validation.

---

## 3.6 Display Name

A user should have a human-readable display name separate from the login identifier.

Example:

```text
username:
eric

display_name:
Eric
```

Future gameplay may use the display name when identifying a player.

Display names do not need to be unique.

---

## 3.7 Roles

Phase 3 requires at least:

```text
ADMIN
USER
```

Do not create a complicated permission framework yet.

The authorization model should support adding permissions later without requiring user IDs or account storage to be redesigned.

---

## 3.8 Account Status

Support at least:

```text
ACTIVE
DISABLED
```

A disabled account:

```text
cannot log in
cannot continue using existing authenticated sessions
cannot establish authenticated WebSocket connections
```

Do not delete an account merely to disable access.

---

## 3.9 Closed Account Provisioning

Phase 3 must not provide open internet self-registration.

There is no public:

```text
Sign Up
Create Account
Register
```

workflow.

Accounts are explicitly created by an administrator.

The application is a private/personal system, not an open public service.

---

## 3.10 No Email Dependency

Phase 3 does not require:

```text
email verification
SMTP server
password-reset email
third-party identity provider
social login
```

A user's identity is based on the Arena account itself.

---

## 3.11 Password Storage

Passwords MUST NEVER be stored:

```text
in plaintext
reversibly encrypted
in logs
in browser storage
in configuration files
```

Store only a secure password hash.

---

## 3.12 Password Hashing Algorithm

Use:

```text
Argon2id
```

through a mature maintained implementation compatible with the chosen JVM version.

Do not implement password hashing primitives manually.

---

## 3.13 Password Hash Parameters

The implementation must explicitly configure and document:

```text
memory cost
iteration/time cost
parallelism
salt length
hash length
```

Parameters should be selected by benchmarking on the actual deployment hardware.

The goal is to make password verification deliberately expensive enough to resist offline guessing without causing unreasonable login latency.

Record the selected parameters in:

```text
docs/architecture/AUTHENTICATION.md
```

---

## 3.14 Password Salt

Every password hash must use a unique cryptographically secure random salt.

The password hashing library should generate and encode the salt with the hash.

Do not reuse one static salt for all users.

---

## 3.15 Password Policy

Recommended Phase 3 password rules:

```text
minimum length: 12 characters
maximum accepted length: at least 128 characters
```

Do not impose arbitrary requirements such as:

```text
must contain uppercase
must contain lowercase
must contain number
must contain symbol
```

Long passwords and passphrases must work.

Do not silently truncate passwords.

---

## 3.16 Password Whitespace

Do not automatically trim passwords.

If a user intentionally includes:

```text
leading spaces
trailing spaces
internal spaces
```

they are part of the password.

---

## 3.17 Password Input

The login page must use a password input field.

The browser must not store the password in:

```text
localStorage
sessionStorage
IndexedDB
application state after authentication completes
```

Clear password input state after login succeeds or fails.

---

## 3.18 Authentication Session Model

Use:

```text
opaque
random
server-side
database-backed
sessions
```

The browser receives only an opaque session token.

The token does not contain user information.

---

## 3.19 No Browser Authorization Claims

Do not place authoritative information such as:

```text
role = ADMIN
user_id
permissions
account status
```

inside browser-controlled state and trust it.

Authorization decisions come from the server-side authenticated user/session.

---

## 3.20 Session Token

Generate session tokens using a cryptographically secure random source.

Recommended entropy:

```text
at least 256 bits
```

Tokens must be unpredictable.

---

## 3.21 Session Token Storage

The raw session token must not be stored in the database.

Store a one-way hash of the token.

Conceptually:

```text
browser cookie
    =
raw random session token

database
    =
SHA-256(session token)
```

Because the session token itself is already high-entropy random data, a cryptographic digest is appropriate for lookup/storage.

---

## 3.22 Session Cookie

Recommended cookie name:

```text
proxicarena_session
```

Production cookie attributes must include:

```text
Secure
HttpOnly
SameSite=Lax
Path=/
```

Do not set a broad `Domain` attribute unless an actual architectural requirement appears later.

The preferred behavior is a host-only cookie for:

```text
arena.barnflix.net
```

---

## 3.23 Secure Cookie Behind Cloudflare

Production public traffic reaches the application through HTTPS at Cloudflare.

The Arena Server must still set `Secure` on authentication cookies.

Do not remove the Secure attribute because Ktor's internal tunnel origin uses HTTP.

---

## 3.24 No Authentication Token in Local Storage

Do not store the primary authentication credential in:

```text
localStorage
sessionStorage
IndexedDB
React state persisted to disk
URL
query parameter
```

Authentication uses the secure HttpOnly cookie.

---

## 3.25 Session Database Record

A session record should contain enough information to support:

```text
session identity
user identity
creation time
last activity
absolute expiration
revocation
```

Conceptually:

```text
auth_sessions
├── session_id
├── user_id
├── token_hash
├── created_at
├── last_seen_at
├── expires_at
└── revoked_at
```

Exact schema may adapt to implementation needs.

---

## 3.26 Session ID vs Session Token

Use separate concepts:

```text
session_id
=
safe internal database identifier

session_token
=
secret credential held by browser
```

Do not expose the database session ID as the authentication credential.

---

## 3.27 Session Expiration

Recommended initial policy:

```text
idle expiration:
7 days

absolute expiration:
30 days
```

Make these server-configurable.

The browser must not be allowed to request an arbitrarily long session.

---

## 3.28 Idle Session Expiration

If a session has not been used within the configured idle period, the session becomes invalid.

The user must log in again.

---

## 3.29 Absolute Session Expiration

A session must expire after the configured absolute lifetime even if it is actively used.

---

## 3.30 Session Activity Update

Do not write `last_seen_at` to PostgreSQL on every request if doing so creates unnecessary database churn.

Use a reasonable update interval and document it.

---

## 3.31 Login Creates New Session

A successful login creates a new authenticated session.

Do not reuse an unauthenticated session identifier as the authenticated credential.

---

## 3.32 Multiple Sessions

A user may have multiple legitimate sessions.

Phase 3 does not artificially restrict users to a single session.

---

## 3.33 Logout

Provide:

```text
POST /api/auth/logout
```

Logout must revoke the current server-side session and clear the authentication cookie.

---

## 3.34 Logout All Sessions

Provide:

```text
POST /api/auth/logout-all
```

Preferred behavior is to revoke all sessions including current and require login again.

---

## 3.35 Password Change

Provide an authenticated password-change operation:

```text
POST /api/auth/change-password
```

Require current password and new password.

The server verifies the current password before accepting the new password.

---

## 3.36 Password Change Revokes Sessions

After a successful password change, all existing sessions for that user are revoked.

---

## 3.37 Disabled Account Session Revocation

When an account becomes `DISABLED`, all existing sessions for that user must become invalid.

---

## 3.38 Authentication Principal

Ktor must establish one authoritative authenticated principal object.

Conceptually:

```text
AuthenticatedUser
{
    userId
    username
    displayName
    role
}
```

Application routes must obtain identity through this server-controlled principal.

---

## 3.39 Authorization Helpers

Create centralized authorization helpers/middleware for:

```text
requires authenticated user
requires ADMIN
```

Do not scatter username-specific authorization checks through application code.

---

## 3.40 No Username-Based Administration

Administrative authority must come from `role = ADMIN`, not from a hardcoded username.

---

## 3.41 Login Endpoint

Create:

```text
POST /api/auth/login
```

Request concept:

```json
{
  "username": "eric",
  "password": "..."
}
```

Successful response should contain non-sensitive authenticated-user information.

The session credential is delivered through the HttpOnly cookie.

---

## 3.42 Login Failure

Invalid login should return a generic response such as:

```text
Invalid username or password.
```

Do not reveal whether the username exists, the password was wrong, or the account is disabled.

---

## 3.43 Authentication Failure Status

Use an appropriate authentication status such as `401 Unauthorized` for invalid credentials.

---

## 3.44 Username Enumeration

Where practical, nonexistent-user and wrong-password cases should follow comparable password-verification work.

A dummy password hash may be used for nonexistent usernames.

---

## 3.45 Login Rate Protection

Add application-level protection against repeated login attempts.

At this project's expected scale, an in-process limiter is acceptable.

Rate limiting should consider source and normalized username.

Do not add Redis solely for login throttling.

---

## 3.46 Login Rate Limit Behavior

Repeated invalid attempts should eventually receive `429 Too Many Requests` or equivalent controlled rejection.

Do not permanently lock an account solely due to failed login attempts.

---

## 3.47 No Persistent Automatic Account Lockout

Use rate limiting rather than automatic permanent account lockout.

---

## 3.48 Current User Endpoint

Provide:

```text
GET /api/auth/me
```

Authenticated response concept:

```json
{
  "authenticated": true,
  "user": {
    "id": "...",
    "username": "eric",
    "display_name": "Eric",
    "role": "ADMIN"
  }
}
```

---

## 3.49 Unauthenticated Current User

An unauthenticated request to `GET /api/auth/me` must behave consistently.

Either `401` or a documented `{"authenticated": false}` response is acceptable.

Choose one behavior and use it consistently.

---

## 3.50 Cross-Site Request Forgery Protection

Because authentication uses cookies, state-changing authenticated requests require explicit CSRF protection.

Phase 3 must establish one reusable CSRF mechanism for later APIs.

---

## 3.51 CSRF Token

Use a cryptographically strong CSRF token bound to the authenticated session.

Recommended header:

```text
X-CSRF-Token
```

Do not accept the token from a URL query parameter.

---

## 3.52 CSRF-Protected Methods

Require CSRF validation for authenticated:

```text
POST
PUT
PATCH
DELETE
```

requests unless a route has a documented reason not to use cookie authentication.

---

## 3.53 Same-Origin Validation

Authenticated state-changing browser requests should also validate expected origin behavior.

Production expected origin:

```text
https://arena.barnflix.net
```

Use configured application origin rather than scattering the hostname through code.

---

## 3.54 CORS

Production authentication APIs are same-origin.

Do not enable `Access-Control-Allow-Origin: *` with credentials.

Development behavior must remain narrowly scoped to the documented environment.

---

## 3.55 Authentication API Error Shape

Authentication errors must follow the project's structured API error format.

---

## 3.56 Administrator Account Provisioning

Phase 3 requires a safe way to create the first administrator without open registration.

Provide an Arena administration command/tool included with the server deployment.

Conceptually:

```text
arena-admin user create
arena-admin user list
arena-admin user disable
arena-admin user enable
arena-admin user set-password
arena-admin user revoke-sessions
```

Exact syntax may adapt to packaging.

---

## 3.57 First Administrator

The first administrator must be created explicitly through the administration tool.

Do not ship or automatically create default credentials.

---

## 3.58 Administrator Password Entry

Administrative password creation/reset must not require the password to appear in command-line arguments, shell history, Docker Compose YAML, or Git.

Prefer secure interactive password input.

---

## 3.59 Admin Tool Password Hashing

The admin tool must use the same password validation, Argon2id implementation, hash parameters, normalization, and database model as the Arena Server.

---

## 3.60 Admin User Creation

Creating a user requires at minimum:

```text
username
display name
role
password
```

Reject duplicate username, invalid username, invalid role, and weak password.

---

## 3.61 Admin User Disable

Administration tooling must be capable of disabling a user and invalidating active sessions.

---

## 3.62 Admin User Enable

Administration tooling must be capable of returning a disabled account to `ACTIVE`.

Old revoked sessions remain invalid.

---

## 3.63 Admin Password Reset

Administrator tooling must be capable of assigning a new password to an account.

A password reset revokes all existing sessions for that user.

---

## 3.64 No Password Recovery Question System

Do not implement security questions or personal-trivia recovery.

---

## 3.65 React Login Page

Create:

```text
/login
```

The page includes username, password, Login button, clear authentication error state, and loading/submitting state.

No registration link is required.

---

## 3.66 Login Page Behavior

If an already-authenticated user navigates to `/login`, redirect them to the authenticated application home.

---

## 3.67 Protected Application Routes

Unauthenticated access to protected application routes redirects to `/login`.

After successful login, return to the intended safe application route where practical.

---

## 3.68 Safe Return Path

Do not accept arbitrary external redirect destinations after login.

Return paths must be application-local.

---

## 3.69 Authenticated Home

Provide a simple authenticated application home confirming authenticated identity, display name, username, role if appropriate, logout, and account settings.

Do not build Deck Depot or lobby UI here.

---

## 3.70 Account Page

Create a minimal authenticated account page such as `/account`.

It may contain username, display name, role, change password, logout, and logout-all controls.

Username changing is not required.

---

## 3.71 Display Name Editing

Phase 3 may permit users to update their own display name.

Display name is not an authorization identifier and may be Unicode.

Do not allow display name changes to alter username or user ID.

---

## 3.72 Frontend Authentication State

The React application must obtain authoritative authentication state from the server.

On startup:

```text
request authenticated session state
        ↓
loading
        ↓
authenticated or unauthenticated
```

Do not assume login from local browser state.

---

## 3.73 Authentication Loading State

The browser must distinguish authentication unknown, authenticated, and unauthenticated.

Avoid briefly rendering protected content before the authentication check completes.

---

## 3.74 Session Expiration UX

If an API call fails because the session expired or was revoked:

```text
clear authenticated frontend state
redirect to login
show an appropriate session-expired message
```

---

## 3.75 Logout UX

After logout, clear in-memory authenticated state and redirect to `/login`.

---

## 3.76 No Sensitive Browser Persistence

Do not persist password, session token, CSRF secret material, or authoritative administrator privilege claims in local browser storage.

---

## 3.77 Authenticated WebSocket Foundation

Phase 3 must establish authentication for WebSocket connections.

A protected WebSocket derives identity from the same authenticated session mechanism used by HTTP.

Do not accept browser-supplied user ID, username, or role as proof of identity.

---

## 3.78 WebSocket Cookie Authentication

The existing secure session cookie should authenticate the same-origin WebSocket upgrade request.

The server resolves:

```text
session
    ↓
user
    ↓
AuthenticatedUser principal
```

before protected WebSocket behavior.

---

## 3.79 Authenticated WebSocket Endpoint

Create a small authenticated WebSocket proof such as:

```text
/ws/user
```

After successful connection, the server may send an authenticated hello containing safe user identity.

Do not implement gameplay messages.

---

## 3.80 Unauthenticated WebSocket

An unauthenticated client attempting to connect to a protected WebSocket endpoint must be rejected.

---

## 3.81 Revoked WebSocket Session

Protected WebSocket connections must not remain indefinitely authorized after session revocation, account disable, or absolute session expiration.

At this project's scale, periodic session validation during heartbeat/activity is acceptable.

---

## 3.82 WebSocket Identity Logging

Authenticated WebSocket logs may correlate connection ID, session ID, and user ID.

Do not log the secret session token.

---

## 3.83 Public Health Endpoints

Infrastructure endpoints such as:

```text
/api/health/live
/api/health/ready
/api/version
```

may remain unauthenticated if they expose only non-sensitive operational information.

---

## 3.84 System Status

Review `/api/system/status` for information exposure after authentication is added.

Protect or reduce sensitive details if necessary.

---

## 3.85 Deck APIs During Phase 3

Phase 3 does not assign Phase 2 decks to users.

Production Phase 3 must not expose the existing deck-management APIs as a shared global deck library to authenticated users.

Deck upload, listing, detail, artwork access, and deletion remain restricted according to the Phase 2 production safety boundary until Phase 4 introduces:

```text
owner_user_id
authorization
sharing
Deck Depot
```

---

## 3.86 Existing Phase 2 Decks

Any decks created during Phase 2 development/testing remain independent of authenticated user ownership.

Phase 3 must not silently assign them to the first admin, first logged-in user, or all users.

Phase 4 will define any required ownership migration behavior.

---

## 3.87 Database Migration

Add a new Flyway migration for Phase 3.

Example:

```text
V003__accounts_and_authentication.sql
```

Use the next actual migration number in the repository.

Never edit previously applied migrations.

---

## 3.88 User Table Constraints

At minimum:

```text
user_id not null
normalized username not null
normalized username unique
password hash not null
role not null
status not null
created timestamp not null
```

---

## 3.89 Session Table Constraints

At minimum:

```text
session ID unique
token hash unique
user ID foreign key
expiration required
creation timestamp required
```

---

## 3.90 Session Cleanup

Expired and revoked session rows must not accumulate forever.

Provide a cleanup mechanism without introducing a separate queue service solely for this purpose.

---

## 3.91 Authentication Configuration

Add documented configuration for authentication.

Conceptually:

```text
AUTH_SESSION_IDLE_HOURS
AUTH_SESSION_ABSOLUTE_HOURS
AUTH_COOKIE_NAME
AUTH_CSRF_SECRET
AUTH_LOGIN_RATE_LIMIT
```

Exact names should follow project conventions.

---

## 3.92 CSRF Secret

If the selected CSRF design requires a server secret, it must be random, persistent across restarts, deployment-provided, and not committed to Git.

---

## 3.93 No Default Production Secrets

`.env.example` may include placeholders.

The repository must not contain real passwords, CSRF secrets, session secrets, or administrator credentials.

---

## 3.94 Logging

Authentication logs should record security-relevant events without recording credentials.

Useful events include login success/failure, rate limit, logout, password change, user creation/disable/enable, admin reset, and session revocation.

---

## 3.95 Authentication Log Fields

Where appropriate, log:

```text
request_id
user_id
normalized username
session_id
connection_id
event
result
```

Never log password, raw session token, CSRF token, or password hash.

---

## 3.96 Failed Login Logging

Failed login logs may record normalized attempted username.

Do not log submitted passwords.

---

## 3.97 Client IP Handling

Client IP may be used for rate limiting and security logs only from trusted proxy information.

Do not blindly trust arbitrary forwarding headers.

Do not bind sessions permanently to IP addresses.

---

## 3.98 User Agent

A session may optionally store limited user-agent information for diagnostics.

Do not make exact user-agent equality an authentication requirement.

---

## 3.99 Security Headers

Review application security headers as part of Phase 3.

At minimum preserve existing Cloudflare security behavior and use appropriate protections against content-type sniffing, clickjacking, and unnecessary referrer leakage.

---

## 3.100 Content Security Policy

Establish a CSP compatible with React, Vite production assets, PixiJS, same-origin APIs, same-origin WebSockets, and imported card images served by Arena.

Do not disable CSP globally merely because one frontend dependency conflicts.

---

## 3.101 No Unsafe HTML Rendering

Do not render server/user-provided display names using raw HTML injection.

Any future use of `dangerouslySetInnerHTML` requires explicit justification and sanitization.

---

## 3.102 Username and Display Name Output

Treat usernames and display names as untrusted display data.

Do not construct HTML, JavaScript, filesystem paths, or SQL directly from those values.

---

## 3.103 SQL Safety

Use parameterized database access.

Do not concatenate login/user input into SQL.

---

## 3.104 Password Verification Failure

Handle corrupted or unsupported stored password-hash data as a controlled authentication/server error.

Do not expose the stored hash to the client.

---

## 3.105 Password Hash Upgrade Path

Authentication should recognize hash parameters encoded with the stored password hash.

If parameters increase later, successful login may rehash using newer parameters.

---

## 3.106 Database Failure During Login

If PostgreSQL is unavailable, login fails safely.

Do not authenticate a cached user merely to keep the site available.

---

## 3.107 Session Database Failure

If session database lookup fails, the request is not treated as authenticated.

Fail closed.

---

## 3.108 Disabled User Failure

If a valid session refers to a disabled user, authentication fails and the session is treated as invalid.

---

## 3.109 Role Change

Existing sessions must use current server-side role information rather than stale browser claims.

---

## 3.110 Admin Self-Protection

Administration tooling must avoid casually leaving the installation with no usable administrator.

Disabling the final active ADMIN must warn and require explicit confirmation or be rejected.

---

## 3.111 No User Deletion Yet

Permanent user deletion is not required in Phase 3.

Use `DISABLED` for access revocation.

---

## 3.112 No Open Registration API

Do not create an unused public registration endpoint for later use.

---

## 3.113 No OAuth Yet

Do not implement Google, Discord, GitHub, Microsoft, or Cloudflare Access identity mapping during Phase 3.

---

## 3.114 No Multi-Factor Authentication Yet

MFA is not required in Phase 3.

---

## 3.115 No Password Reset Email

There is no email-based Forgot Password flow.

An administrator resets forgotten passwords through the administration tool.

---

## 3.116 No Remember-Me Variant

Phase 3 uses one documented session lifetime.

Do not introduce a separate Remember Me path.

---

## 3.117 Frontend Tests

At minimum test:

```text
login page renders
login loading state
successful login
invalid login
rate-limit response
protected route redirect
authenticated route rendering
session expiration handling
logout
logout all
password-change success
password-change failure
account page
authentication startup loading state
safe return path
no external redirect
```

---

## 3.118 Backend Authentication Tests

At minimum test:

```text
create user
normalized username uniqueness
password hashing
correct password verification
wrong password rejection
unknown username rejection
disabled user rejection
session creation
session lookup
session expiration
session idle expiration
session absolute expiration
session revocation
logout
logout all
password change
password-change session revocation
admin role enforcement
USER cannot perform ADMIN operation
rate limiting
CSRF validation
Origin validation
```

---

## 3.119 Cookie Tests

Production-mode tests must verify:

```text
Secure
HttpOnly
SameSite=Lax
Path=/
```

and absence of an unnecessarily broad Domain attribute.

---

## 3.120 Password Storage Test

Database must not contain plaintext passwords.

Stored password representation must be a valid Argon2id hash.

---

## 3.121 Login Case Test

Username casing variants must resolve according to the documented case-insensitive behavior.

---

## 3.122 Duplicate Username Test

Normalized username collisions must be rejected.

---

## 3.123 Generic Login Failure Test

Client-visible failure must not distinguish unknown username, wrong password, and disabled account through the ordinary login message.

---

## 3.124 Brute-Force Protection Test

Repeated invalid login attempts must trigger configured throttling without permanently disabling the account.

---

## 3.125 Session Restart Persistence

Create a valid authenticated session, restart Arena Server, and verify the unexpired session remains valid if persistent state/configuration is intact.

---

## 3.126 Session Token Database Test

The raw cookie token must not appear in the database.

---

## 3.127 Logout Revocation Test

After logout, the old cookie must no longer authenticate.

---

## 3.128 Password Change Revocation Test

Changing password must revoke existing sessions.

Old password fails; new password succeeds.

---

## 3.129 Disabled Account Test

Disable a logged-in user and verify HTTP authentication fails, authenticated WebSocket becomes invalid, and new login fails.

---

## 3.130 Re-Enabled Account Test

Re-enable the account.

Old revoked sessions remain invalid and fresh login succeeds.

---

## 3.131 CSRF Failure Test

A valid session without valid CSRF proof must not be able to change state.

---

## 3.132 CSRF Success Test

The same authenticated operation succeeds with valid CSRF proof.

---

## 3.133 Cross-Origin Request Test

A state-changing authenticated request from an invalid external Origin must fail.

---

## 3.134 WebSocket Authentication Test

With a valid session, protected WebSocket connection must resolve the correct user.

---

## 3.135 WebSocket Impersonation Test

Authenticated User A cannot become User B by sending a claimed user ID in a WebSocket payload.

---

## 3.136 WebSocket Anonymous Test

Without valid session, protected WebSocket connection fails.

---

## 3.137 WebSocket Revocation Test

Revoke the session behind an authenticated WebSocket and verify authorization is removed according to the documented mechanism.

---

## 3.138 Admin Tool Tests

Test:

```text
create ADMIN
create USER
list users
reject duplicate username
disable user
enable user
set password
revoke sessions
reject invalid role
reject weak password
```

---

## 3.139 No CLI Password Argument Test

Administrative tooling must not require plaintext password command-line arguments.

---

## 3.140 Browser End-to-End Login Test

Using Playwright:

```text
open arena
redirect to login
enter valid credentials
login succeeds
authenticated home appears
refresh browser
session remains authenticated
logout
login page returns
```

---

## 3.141 Browser Session Expiry Test

Use a controlled short expiry and verify the browser clears auth state, redirects to login, and shows a useful expiration message.

---

## 3.142 Browser Password Change Test

Using Playwright:

```text
login
open account page
change password
session is revoked
login again with new password
```

---

## 3.143 Production Public Login Test

Through:

```text
https://arena.barnflix.net
```

verify login page, login API, secure cookie, authenticated page, and logout.

Use approved test credentials that are not committed to source.

---

## 3.144 Production Cookie Security Test

Through the real public hostname verify the authentication cookie has the locked security attributes.

---

## 3.145 Production Anonymous Protection Test

Through the real public hostname, unauthenticated users cannot use authenticated application functionality.

---

## 3.146 Phase 2 Deck Boundary Test

Adding authentication must not expose all imported Phase 2 decks to every authenticated account.

Deck ownership remains unavailable until Deck Depot.

---

## 3.147 Static Analysis

Frontend:

```text
TypeScript compile
ESLint
Prettier check
Vitest
Playwright
```

Backend:

```text
Kotlin compile
ktlint
detekt
JUnit/Kotlin tests
```

---

## 3.148 Docker Requirements

Authentication must work in the normal Docker deployment.

The Arena Server must not depend on host JVM, host database, developer IDE, or local-only session storage.

---

## 3.149 Unraid Persistence

Authentication database state must survive container restart, image rebuild, container recreation, and Docker Compose recreation through persistent PostgreSQL storage.

No separate filesystem user-account database should be created.

---

## 3.150 Administration Tool in Docker

The account-administration tool must be usable in the deployed Docker environment.

Document exact commands for creating first admin, creating normal user, listing users, disabling/enabling users, resetting password, and revoking sessions.

---

## 3.151 Required Documentation

Create:

```text
docs/architecture/AUTHENTICATION.md
docs/architecture/AUTHORIZATION.md
docs/troubleshooting/AUTHENTICATION.md
```

Update:

```text
README.md
BUILD_PLAN.md
AGENTS.md
.env.example
```

where required.

---

## 3.152 `AUTHENTICATION.md`

Document:

```text
user identity
username normalization
password hashing
Argon2id parameters
session token generation
session token hashing
session lifetime
cookie configuration
CSRF protection
login rate protection
logout
password change
session revocation
admin provisioning
authenticated WebSocket behavior
```

Do not include passwords or secret values.

---

## 3.153 `AUTHORIZATION.md`

Document:

```text
ADMIN
USER
authenticated principal
route protection
admin-only operations
disabled-user behavior
future extension points
```

Keep it limited to authorization actually implemented.

---

## 3.154 Authentication Troubleshooting

Cover:

```text
cannot create first admin
login fails
account disabled
database unavailable
session immediately expires
cookie not being sent
Secure cookie issue
CSRF rejection
Origin rejection
rate limit triggered
authenticated WebSocket rejected
password reset procedure
logout-all behavior
```

---

## 3.155 Phase 3 Checklist

### Database
- [ ] Add user schema.
- [ ] Add session schema.
- [ ] Add required constraints.
- [ ] Add normalized-username uniqueness.
- [ ] Add role.
- [ ] Add account status.
- [ ] Add Flyway migration.
- [ ] Add expired-session cleanup.

### Password security
- [ ] Add Argon2id implementation.
- [ ] Benchmark hash parameters.
- [ ] Document parameters.
- [ ] Enforce minimum password length.
- [ ] Do not impose arbitrary complexity classes.
- [ ] Do not trim passwords.
- [ ] Never log passwords.
- [ ] Never store plaintext passwords.

### Sessions
- [ ] Generate high-entropy random tokens.
- [ ] Store only token hash.
- [ ] Issue Secure cookie.
- [ ] Issue HttpOnly cookie.
- [ ] Set SameSite.
- [ ] Use host-only cookie.
- [ ] Implement idle expiration.
- [ ] Implement absolute expiration.
- [ ] Implement session revocation.
- [ ] Implement logout.
- [ ] Implement logout-all.
- [ ] Persist sessions across server restart.

### CSRF / request security
- [ ] Establish CSRF mechanism.
- [ ] Protect state-changing authenticated requests.
- [ ] Validate expected Origin.
- [ ] Keep credentialed CORS restricted.
- [ ] Do not put CSRF token in URL.

### Authentication API
- [ ] Implement login.
- [ ] Implement current-user endpoint.
- [ ] Implement logout.
- [ ] Implement logout-all.
- [ ] Implement change-password.
- [ ] Use generic login failure.
- [ ] Add rate protection.
- [ ] Reject disabled users.

### Authorization
- [ ] Implement authenticated principal.
- [ ] Implement ADMIN role.
- [ ] Implement USER role.
- [ ] Add authenticated-route helper.
- [ ] Add admin-route helper.
- [ ] Never authorize by username.

### Administration
- [ ] Create first-admin command.
- [ ] Create normal-user command.
- [ ] List users.
- [ ] Disable user.
- [ ] Enable user.
- [ ] Reset password.
- [ ] Revoke sessions.
- [ ] Avoid password command-line arguments.
- [ ] Protect against accidental loss of final admin.

### Frontend
- [ ] Add `/login`.
- [ ] Add authentication state bootstrap.
- [ ] Add protected routes.
- [ ] Add safe post-login redirect.
- [ ] Add authenticated home.
- [ ] Add `/account`.
- [ ] Add change password.
- [ ] Add logout.
- [ ] Add logout all.
- [ ] Handle expired session.
- [ ] Do not persist auth token in browser storage.

### WebSocket
- [ ] Add authenticated WebSocket proof.
- [ ] Authenticate from server-side session.
- [ ] Ignore browser identity claims.
- [ ] Reject anonymous connection.
- [ ] Handle revoked session.
- [ ] Handle disabled user.
- [ ] Log user/session correlation without secret tokens.

### Phase boundaries
- [ ] Do not add deck ownership.
- [ ] Do not add deck sharing.
- [ ] Do not expose all decks to authenticated users.
- [ ] Do not enable public Deck Depot.
- [ ] Do not add gameplay.
- [ ] Preserve Phase 2 deck safety boundary.

### Deployment
- [ ] Update `.env.example`.
- [ ] Add production auth configuration.
- [ ] Verify no default credentials.
- [ ] Verify production secure cookie.
- [ ] Verify Cloudflare deployment.
- [ ] Verify authentication survives container restart.

### Tests
- [ ] Password-hash tests pass.
- [ ] Login tests pass.
- [ ] Session tests pass.
- [ ] Cookie tests pass.
- [ ] CSRF tests pass.
- [ ] Rate-limit tests pass.
- [ ] Role tests pass.
- [ ] Disabled-user tests pass.
- [ ] Password-change tests pass.
- [ ] Admin-tool tests pass.
- [ ] WebSocket auth tests pass.
- [ ] Browser E2E tests pass.
- [ ] Production public login test passes.
- [ ] Phase 2 deck boundary test passes.
- [ ] Static analysis passes.

### Documentation
- [ ] `AUTHENTICATION.md` complete.
- [ ] `AUTHORIZATION.md` complete.
- [ ] Authentication troubleshooting complete.
- [ ] README updated.
- [ ] BUILD_PLAN updated.
- [ ] AGENTS.md updated if needed.
- [ ] Administration commands documented.

---

## 3.156 Mandatory Acceptance Tests

### P3-A — First Administrator Creation
Create an ADMIN account from an empty user database using the documented admin command. The account can log in.

### P3-B — Password Storage
The plaintext password is absent from the database and the stored representation is approved Argon2id.

### P3-C — Login
Valid credentials create an authenticated session and return expected user identity.

### P3-D — Invalid Credentials
Wrong password and unknown username are rejected without disclosing which condition occurred.

### P3-E — Secure Cookie
Through `https://arena.barnflix.net`, the session cookie has the required Secure, HttpOnly, SameSite, and Path attributes.

### P3-F — Database-Backed Session
An unexpired session survives Arena Server restart.

### P3-G — Raw Token Not Stored
The raw authentication cookie token does not appear in the session database.

### P3-H — Logout
Logout revokes the session; reusing the old cookie fails.

### P3-I — Logout All
Multiple sessions are all invalidated by logout-all.

### P3-J — Password Change
Password change revokes existing sessions. Old password fails; new password succeeds.

### P3-K — Disabled User
Disabling a logged-in user invalidates current access and blocks new login.

### P3-L — Re-Enable User
Re-enabled account can log in fresh; old revoked sessions remain invalid.

### P3-M — Username Normalization
Case variants cannot create duplicate normalized accounts and login follows documented case-insensitive behavior.

### P3-N — Login Rate Protection
Repeated invalid attempts trigger throttling without permanently disabling the account.

### P3-O — CSRF Rejection
Authenticated state-changing request without valid CSRF proof is rejected and state remains unchanged.

### P3-P — CSRF Success
Equivalent request with valid CSRF proof succeeds.

### P3-Q — Cross-Origin Protection
State-changing authenticated request from invalid external Origin is rejected.

### P3-R — Protected Browser Route
Unauthenticated browser visiting a protected route is directed to `/login`.

### P3-S — Browser Login Persistence
Browser login persists through refresh via the server-backed session.

### P3-T — Browser Logout
Logout removes access to protected application content.

### P3-U — Authenticated WebSocket
Logged-in browser connects to protected WebSocket and server associates correct user ID.

### P3-V — WebSocket Impersonation Protection
User A cannot become User B by sending a claimed user ID.

### P3-W — WebSocket Session Revocation
Revoking the session behind an authenticated WebSocket removes authorization according to the documented mechanism.

### P3-X — Public Anonymous Protection
Through the production hostname, anonymous users cannot use authenticated application functionality.

### P3-Y — Phase 2 Deck Isolation
Authentication does not expose all Phase 2 decks to every authenticated account.

### P3-Z — Existing Project Integrity
Verify `C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD` remains unchanged and upstream Forge contains no unapproved modifications.

---

## 3.157 Required Phase 3 Deliverables

At completion provide:

```text
1. Summary of implementation.
2. Final database migration/schema.
3. User-table design.
4. Session-table design.
5. Username normalization rules.
6. Password policy.
7. Password hashing library/version.
8. Exact Argon2id parameters.
9. Session-token design.
10. Session-token database-storage design.
11. Cookie configuration.
12. Idle session lifetime.
13. Absolute session lifetime.
14. CSRF design.
15. Login rate-protection configuration.
16. Authentication API routes.
17. Authorization/role model.
18. Admin account-management commands.
19. Authenticated WebSocket behavior.
20. Frontend authentication routes.
21. Browser E2E test results.
22. Public production login test result.
23. Cookie security test result.
24. Session restart-persistence result.
25. CSRF test results.
26. Rate-limit test result.
27. Admin-tool test results.
28. WebSocket authentication test result.
29. Phase 2 deck-boundary result.
30. Any deviations.
31. Any unresolved concerns.
32. Proposed requirements for Phase 4.
```

Do not begin Phase 4 automatically.

---

## 3.158 Phase 3 Exit Gate

Phase 3 implementation is complete only when:

```text
permanent Arena users exist
user IDs are stable
username normalization is deterministic
passwords are stored securely with Argon2id
no plaintext passwords are stored
login works
sessions are opaque and database-backed
raw session tokens are not stored in the database
secure production cookies work
idle session expiration works
absolute session expiration works
logout works
logout-all works
password changes revoke existing sessions
disabled accounts lose access
roles are server-authoritative
login throttling works
CSRF protection works
protected browser routes work
authenticated WebSocket identity works
session revocation affects WebSockets
administrator provisioning works
no default credentials exist
production login works through arena.barnflix.net
Phase 2 decks have not been incorrectly exposed
deck ownership has not been prematurely implemented
documentation matches actual behavior
```

---

## 3.159 What Phase 3 Does Not Build

The following are intentionally outside Phase 3:

```text
open public registration
email verification
password-reset email
OAuth
social login
multi-factor authentication
deck ownership
deck sharing
Deck Depot
public deck upload
deck editing
lobby
session codes
match creation
battlefield
gameplay
match history
replays
spectators
friends
```

---

## 3.160 Escalation Rule

Stop and ask the project owner before:

```text
adding public self-registration
adding an email dependency
adding OAuth/social login
using JWTs or another authentication model instead of approved opaque server sessions
storing auth tokens in browser localStorage
weakening cookie security
removing CSRF protection
changing the ADMIN/USER role model materially
creating a default administrator password
inventing deck ownership in Phase 3
exposing all stored decks to authenticated users
expanding Phase 3 into Deck Depot
expanding Phase 3 into gameplay
```

For a conflict report use:

```text
CONFLICT

Phase 3 requirement:

Observed reality:

Evidence:

Impact:

Options:

Recommendation:

Question for project owner:
```

---

## 3.161 Locked-Phase Amendment Rule

This Phase 3 specification is locked.

If a legitimate change to a locked Phase 3 requirement becomes necessary, do not silently edit history.

Create an explicit amendment:

```text
PHASE 3 AMENDMENT <number>

Reason:
Affected requirement:
Old decision:
New decision:
Evidence:
Affected later phases:
Approved by project owner:
Date:
```

The amendment records the change separately.

---

# Phase 3 Final Principle

Phase 3 establishes one trustworthy answer to:

```text
Who is this user?
```

The browser does not decide.

A username does not decide.

A WebSocket payload does not decide.

The authenticated server-side session decides.

The permanent identity chain is:

```text
secure session cookie
        ↓
server-side session
        ↓
Arena user ID
        ↓
server-authoritative role/status
```

Later phases can then safely build:

```text
authenticated user
        ↓
Deck Depot ownership
        ↓
deck sharing
        ↓
lobby identity
        ↓
match identity
```

without redesigning authentication.
