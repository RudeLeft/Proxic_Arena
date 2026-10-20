# Proxic Arena Build Plan

# Phase 4 — Deck Depot

**Status:** LOCKED 2026-10-16 (reviewed against Phases 0A, 1, 2 and 3)  
**Phase Type:** Production feature  
**Depends On:** Completed, tested and accepted Phase 3  
**Primary Goal:** Authenticated deck ownership, private deck libraries, and controlled deck sharing  
**Deck Editing:** NOT IMPLEMENTED IN THIS PHASE  
**Gameplay:** NOT IMPLEMENTED IN THIS PHASE


> **LOCKED 2026-10-16.** Phase 0A is accepted and Phases 1, 2 and 3
> have all passed their gates, so the ground this phase stands on is
> built rather than assumed.
>
> The original 177 sections are unchanged. **Everything added by this
> review is in the sections below** — nothing was edited silently.

> **SCOPE AMENDMENT — 2026-10-15 (owner decision).**
> Proxic Arena supports **one play mode: Open Format** — 60–65 cards,
> no more than 4 copies of a specific card, unrestricted card pool,
> 2 players. **Commander and Two-Headed Giant are out of scope.**
> Wherever this document describes a format choice, a preset catalog,
> a command zone, teams or shared life, that content is **void**.
> See `docs/architecture/OPEN_FORMAT.md`.

**Phase-0A dependency: minimal.** Deck ownership and sharing do not
touch Forge. The one coupling is artwork authorization, which must
stay consistent with Phase 6 §6.122 (match-scoped asset access) and
Phase 7 §7.17.

---

## §4.1 execution gate — the conflicts it caught

§4.1 requires a stop-and-report if a capability from an earlier phase
is "absent, incomplete, or materially inconsistent" with what this
document assumes. The review found three. None is a defect in Phases
2 or 3; all three are this document describing a system that was
built differently.

### A — storage is content-addressed, not deck-directoried

§4.1, §4.8, §4.9 and test §4.163 assume Phase 2 stores files at
`/data/decks/<deck-id>/`. It does not. Phase 2 built:

```text
/data/art/original/<aa>/<sha256>.png
/data/art/display/<aa>/<sha256>.png
/data/temp/uploads/, /data/temp/deck-imports/
```

The asset id **is** the SHA-256 of the image, and one file is shared
by every deck that uses that printing — which is why Phase 2 can
delete a deck without touching artwork another deck still references.

The *intent* of §4.8 and §4.9 is satisfied more strongly than asked:
files are not organised per user, and not per deck either, so sharing
a deck with three people duplicates nothing. Only the literal path
and the test need restating. **See AMENDMENT 1.**

### B — the deck id in artwork URLs is currently decorative

Measured, not inferred:

```text
GET /api/decks/{real-deck-id}/assets/{sha}      -> 200, 377379 bytes
GET /api/decks/11111111-...-111111/assets/{sha} -> 200, 377379 bytes
```

The second deck does not exist. `DeckRoutes` validates the SHAPE of
the asset id (64 hex, which is what stops traversal) and then serves
from the store, never consulting the deck.

That was harmless under Phase 3: decks are unowned, so every
authenticated user may see every asset anyway. Under Phase 4 it is a
hole of exactly the kind §4.67 names. **See AMENDMENT 2.**

### C — artwork is cached without `private`

The route sends `Cache-Control: max-age=31536000` and nothing else.
§4.37 asks for `private` and forbids configuring protected artwork
for public Cloudflare caching. Arena is behind Cloudflare.
**See AMENDMENT 3.**

---

## Owner decisions — RESOLVED 2026-10-16

### D1 — **Both legacy decks are assigned to `RudeLeft`**

§4.15 escalation, answered. Two decks exist with no owner:

```text
local dev stack   Basic_Mono_Red_65_Card_Deck   65 cards   2026-10-16
production host   one deck, imported by the owner on 2026-10-16
```

Ownership is not being guessed (§4.14): the owner imported both and
says so. The `V004` migration assigns them **explicitly**, by
username, and the assignment is part of the migration record rather
than a quiet backfill. Neither deck is deleted.

### D2 — **`Cache-Control: private`, long max-age**

Shared caches, Cloudflare included, must not store deck artwork. The
viewer's own browser may, and should: an asset id is a content hash,
so the bytes for a URL can never change.

The accepted consequence is §4.36's: a user whose access is revoked
may still hold a usable copy in their own browser cache until it
expires. Revocation governs the server, not pixels already delivered.
`no-store` was considered and rejected — it would re-download every
card image on every view, and would not prevent a screenshot anyway.

### D3 — **Recipient share-removal (§4.38) is OUT of Phase 4**

Optional by its own text. On a two-player server the owner can
revoke, and leaving it out keeps the first version of sharing
smaller. It needs no schema change to add later.

---

## PHASE 4 AMENDMENT 1

**Reason:** §4.1, §4.8, §4.9 and §4.163 describe a
`/data/decks/<deck-id>/` layout that Phase 2 did not build.

**Affected requirements:** §4.1 (dependency list), §4.8, §4.9, §4.163.

**Old decision:** Physical files live under `/data/decks/<deck-id>/`
and must not be reorganised into user directories.

**New decision:** Physical files live in the content-addressed store
`/data/art/{original,display}/<aa>/<sha256>.png`, shared across every
deck that references them. Ownership and sharing remain purely
database concepts and **must not** reorganise storage — by user, by
deck, or at all. §4.163's test becomes: after uploads by several
users, verify the store is still content-addressed and that no
per-user or per-deck directory has appeared.

§4.164 ("only one physical artwork set exists") already holds by
construction, and is now a regression test rather than a new
requirement.

---

## PHASE 4 AMENDMENT 2

**Reason:** §4.68 says artwork "must enforce the same deck access
policy" and offers `/api/decks/{deckId}/assets/{assetId}` as the
shape. That URL shape implies the check; the implementation does not
perform it, and the content-addressed store makes the required check
different from the obvious one.

**Affected requirements:** §4.67, §4.68, §4.153, §4.154.

**Old decision:** Serve artwork from an authenticated deck-scoped URL.

**New decision:** Serving artwork requires BOTH:

```text
1. the caller may access {deckId}        (owner, or shared-with)
2. {assetId} is referenced by {deckId}   (a row in that deck's entries)
```

The second condition is what the URL shape only pretends to do today.
Because an asset id is a content hash shared between decks, "does
this asset belong to you" is not a meaningful question — "is this
asset part of a deck you may see" is. A request failing either
condition answers **404**, not 403: a user with no access to a deck
should not learn that the deck or the asset exists (§4.65, §4.66).

A test must assert the measured hole is closed: a valid asset id
requested under a deck the caller cannot access, and under a deck id
that does not exist, both answer 404.

---

## PHASE 4 AMENDMENT 3

**Reason:** Phase 2 set `Cache-Control: max-age=31536000` on artwork,
correct for public content-addressed images and wrong for private
ones. §4.37 requires otherwise.

**Affected requirements:** §4.36, §4.37, and Phase 2's artwork route.

**Old decision (Phase 2):** `max-age=31536000`, nothing else.

**New decision:** `Cache-Control: private, max-age=31536000,
immutable`. Shared caches must not store deck artwork; the viewer's
own browser may, because a content hash cannot change meaning.

This is a change to a Phase 2 route made under Phase 4's authority
and recorded here rather than edited quietly into Phase 2.

---

## PHASE 4 AMENDMENT 4

**Reason:** Phase 2 made `package_sha256` globally UNIQUE, which was
right when every deck belonged to everybody. Combined with Phase 4
ownership it produced two faults, both measured against the running
server rather than reasoned about:

```text
Pat imports a package RudeLeft owns ->
  409 {"errorCode":"DUPLICATE_PACKAGE",
       "detail":"This package has already been imported as
                 \"Basic_Mono_Red_65_Card_Deck\".",
       "problems":["6975e74a-ab1f-4f86-b28b-f406ec12df8c"]}
```

1. An account with no access to a private deck learned that it
   exists, what it is called and its id — §4.65 broken through a
   route Phase 4 never touched.
2. That user could never own their own copy. "Whoever imports a file
   first owns it forever" is not a rule anybody chose.

**Affected requirements:** §4.83, and Phase 2's §2.72 / owner
decision D3.

**Old decision:** One deck per package checksum, server-wide; a
duplicate import is refused and names the existing deck.

**New decision (owner, 2026-10-16):** Uniqueness is **per owner**.
`UNIQUE (owner_user_id, package_sha256)` in `V005`. Each account may
import any package once; a re-import by the SAME owner is still
refused and still names the deck, because that deck is theirs to be
told about. A different owner imports their own copy and is told
nothing about anyone else's.

Storage cost measured after two owners imported the same package:
22 files, 17 MB — unchanged. Artwork is content-addressed, so the
second copy adds rows and no image bytes.

---

## PHASE 4 AMENDMENT 5

**Reason:** The owner's Deck Depot design adds renaming; the owner chose
that one player's deck names must not repeat (Phase 7 §7.52 decisions 17
and 18).

**Affected requirements:** deck display names (the package's name,
fixed at import, repeatable).

**Old decision:** A deck is named by its package at import and cannot be
renamed; nothing stops two of one player's decks sharing a name.

**New decision:** An owner may rename their own deck -- also while it is
selected in a room, since everything refers to the deck id. **Names are
unique per owner**: an import or rename that would duplicate one of that
owner's names is refused and asks for another. Existing duplicates are
left as they are but cannot be renamed into another duplicate. A deck
shared with you cannot be renamed.

**Evidence:** Owner decisions 2026-10-20.

**Affected later phases:** Phase 7 builds it (§7.65, P7-AA).

**Approved by project owner:** yes, 2026-10-20
**Date:** 2026-10-20

---

## Carry-forward from Phases 1, 2 and 3

Things already built that change how a section here must be done.

### C1 — `V004` lives in the server's resources

`server/src/main/resources/db/migration/V004__deck_ownership.sql`.
**Not** in `database/`, which exists, is empty, and is a trap: Flyway
loads from `classpath:db/migration`, so a migration placed there
never runs and nothing reports an error.

The schema test asserts the EXACT set of tables, so adding a share
table means updating that assertion in the same commit.

### C2 — the deck gate is an intercept, not per-route code

Phase 3 protects `/api/decks` with a single `intercept` that runs
`requireAuth` then `csrfOk` and stashes the principal. Per-deck
authorization belongs **inside** the routes, after that gate, not as
a second intercept — and `PRINCIPAL_KEY` already carries the identity
the new checks need.

### C3 — decks are currently visible to every authenticated user

PHASE 3 AMENDMENT 1 made every deck endpoint require a session and
left decks unowned. Phase 4 narrows that to owner-plus-shared, which
means `GET /api/decks` changes meaning for an existing, deployed
endpoint. §4.62 (no global listing) is therefore a **behaviour change
on a live system**, not a new feature.

### C4 — `requireAdmin` exists and must stay unused here

Phase 3 built and tested it but no route uses it. §4.49 and §4.50 say
ADMIN neither owns nor bypasses privacy, so Phase 4 must not become
its first caller by accident.

### C5 — deleting a deck already preserves shared artwork

Phase 2 §2.135 refcounts art rather than deleting files on deck
delete. §4.78's cascade applies to database rows and shares; it must
not be read as licence to delete files another deck references.

### C6 — authentication event logging is still absent

Deferred by the owner at the Phase 3 gate, and carried here: §4.129
and §4.130 require audit logging for deck operations, which touches
the same request paths. Deck audit logging is in scope for Phase 4;
login-event logging remains deferred unless the owner asks.

---

## 4.0 Purpose

Phase 4 converts the deck-import capability defined by Phase 2 into the authenticated **Deck Depot**.

The intended flow is:

```text
Authenticated User
        │
        ▼
    Deck Depot
        │
        ├── My Decks
        ├── Upload Deck
        └── Shared With Me
        │
        ▼
Upload Proxic Deck Builder ZIP
        │
        ▼
Phase 2 Import Pipeline
        │
        ▼
Validated Arena Deck
        │
        ▼
Authenticated uploader becomes owner
        │
        ├── keep private
        │
        └── share with specific Arena users
```

Phase 4 establishes the permanent relationship between:

```text
Arena User
    ↓
Deck Ownership
    ↓
Deck Access
```

so later lobby and match phases can safely answer:

```text
May this authenticated user use this deck?
```

---

## 4.1 Phase 4 Execution Gate

Do not begin Phase 4 implementation until:

```text
Phase 0 has been executed and accepted

Phase 1 has been fully implemented, tested, and accepted

Phase 2 has been fully implemented, tested, and accepted

Phase 3 has been fully implemented, tested, and accepted
```

Once those phases have been executed and accepted, Phase 4 may rely on:

```text
the Arena user identity model from Phase 3

authenticated HTTP requests from Phase 3

authenticated WebSocket identity from Phase 3

CSRF protection from Phase 3

the ADMIN / USER authorization model from Phase 3

the deck ZIP import pipeline from Phase 2

the normalized Arena deck representation from Phase 2

the persistent /data/decks/<deck-id>/ storage model from Phase 2

the PostgreSQL deck records from Phase 2

the Forge-resolved card identities created during Phase 2 import
```

If a required capability from a prior phase is absent, incomplete, or materially inconsistent with its locked specification:

**STOP AND REPORT THE CONFLICT.**

Do not silently rebuild or replace the earlier subsystem.

---

## 4.2 Deck Depot Scope

Phase 4 implements:

```text
authenticated deck upload

deck ownership

private user deck libraries

shared-with-me deck access

sharing with specific Arena users

share revocation

owner-only deck management

authorization for deck metadata and artwork

reusable server-side can-use-deck authorization

Deck Depot browser UI
```

Phase 4 does not become:

```text
a deck editor

a public deck marketplace

a global deck browser

a rating system

a deck-comment system

a social network

a generic MTG deck importer
```

---

## 4.3 Private by Default

Every newly imported deck is:

```text
PRIVATE
```

by default.

Only its owner may access it unless the owner explicitly shares it.

Uploading a deck must never automatically:

```text
publish it globally

share it with every user

make it searchable by everyone

make its artwork publicly accessible
```

---

## 4.4 Deck Ownership

Every production deck imported after Phase 4 is enabled must have exactly one authenticated owner.

Conceptually:

```text
User A
  │
  └── owns Deck X
```

The owner is the authenticated user who performed the successful upload.

---

## 4.5 Owner Comes From Authentication

The owner must be determined from the Phase 3 authenticated server principal.

Conceptually:

```text
authenticated session
        ↓
AuthenticatedUser.userId
        ↓
deck.owner_user_id
```

The browser must not decide ownership.

---

## 4.6 Never Trust Client-Supplied Owner IDs

The import request must not permit a normal client to specify:

```text
owner_user_id
owner_username
created_for_user
```

and have the server trust it.

If the browser submits an ownership field, it must be ignored or rejected.

The authenticated principal is authoritative.

---

## 4.7 Stable Deck Identity

The existing Arena:

```text
deck_id
```

remains the permanent deck identity.

Adding ownership must not change the Phase 2 deck ID model.

---

## 4.8 Filesystem Layout Does Not Change

Deck ownership must not reorganize persistent files into user directories.

Continue using:

```text
/data/decks/<deck-id>/
```

Do not change to:

```text
/data/users/<user-id>/decks/
```

Ownership and sharing are database authorization concepts.

---

## 4.9 Why Storage Remains Deck-Based

A deck may later be visible to:

```text
Owner
User B
User C
```

without duplicating the actual deck files.

Conceptually:

```text
/data/decks/DECK-123/
        │
        ├── Owner = User A
        ├── Shared = User B
        └── Shared = User C
```

The physical files remain in one location.

---

## 4.10 Ownership Database Relationship

The deck schema must gain an owner relationship.

Conceptually:

```text
decks
├── deck_id
├── owner_user_id
├── ...
└── imported_at
```

`owner_user_id` references the Phase 3 user identity.

---

## 4.11 Ownership Foreign Key

The owner relationship must use:

```text
users.user_id
```

not:

```text
username
display name
session ID
```

---

## 4.12 New Production Decks Must Have Owners

After Phase 4 migration is complete:

> A newly created production deck must not exist without an owner.

Import code must establish ownership as part of successful import.

---

## 4.13 Phase 2 Legacy Unowned Decks

Phase 2 may have created development or test decks before user ownership existed.

Phase 4 must inspect the actual database before finalizing the ownership migration.

Determine:

```text
how many existing deck records exist

whether they are development/test data

whether any must be retained

whether any should be assigned to a real user

whether any should be deleted
```

---

## 4.14 Never Auto-Assign Legacy Decks

Do not automatically assign all existing unowned decks to:

```text
first ADMIN
first user
currently logged-in user
all users
```

Ownership must not be guessed.

---

## 4.15 Legacy Deck Escalation

If existing Phase 2 deck records require ownership assignment:

**STOP AND REPORT THEM TO THE PROJECT OWNER.**

Provide:

```text
LEGACY DECK OWNERSHIP

Number of unowned decks:

Deck IDs / names:

Current storage locations:

Options:
- assign specific deck to specific user
- delete known test deck
- retain temporarily as inaccessible legacy data

Recommendation:
```

Do not make the decision silently.

---

## 4.16 Final Ownership Constraint

After required legacy ownership decisions are resolved, production schema should enforce:

```text
decks.owner_user_id NOT NULL
```

for normal Deck Depot decks.

Do not leave permanent ownerless production decks merely because migration was easier.

---

## 4.17 Ownership Is Not Transferable in Phase 4

Phase 4 does not implement deck ownership transfer.

A deck belongs to the user who uploaded it.

Do not add:

```text
Transfer Ownership
Give Deck Away
Change Owner
```

unless a later phase explicitly requires it.

---

## 4.18 Sharing Model

Phase 4 introduces direct sharing between Arena users.

Conceptually:

```text
User A owns Deck X

User A
   │
   └── shares Deck X
            │
            └── User B

User B
   │
   └── may view and use Deck X
```

---

## 4.19 Sharing Does Not Copy the Deck

Sharing must create an authorization relationship.

It must not duplicate:

```text
deck database rows
manifest
PNG artwork
Forge-resolved deck data
```

A shared user references the same deck.

---

## 4.20 Shared Deck Remains Owned by Original Owner

Sharing does not change:

```text
owner_user_id
```

The original owner remains authoritative for deck management.

---

## 4.21 Initial Share Permission

Phase 4 uses one simple share permission:

```text
VIEW_AND_USE
```

or an equivalent single shared-access state.

Do not create an elaborate permission hierarchy unless required.

---

## 4.22 Shared User May

A user with shared access may:

```text
see the deck in Shared With Me

view deck details

view card artwork

access the normalized deck

use the deck in future match-selection workflows
```

The final item establishes authorization for future phases but does not create matches in Phase 4.

---

## 4.23 Shared User May Not

A shared user may not:

```text
delete the deck

change ownership

share the deck with another user

revoke another user's access

modify the normalized deck

replace deck artwork

overwrite the deck package
```

---

## 4.24 No Re-Sharing

Only the owner may create or revoke shares.

A recipient cannot re-share another user's deck.

---

## 4.25 Share Table

Create a normalized share relationship.

Conceptually:

```text
deck_shares
├── share_id
├── deck_id
├── shared_with_user_id
├── created_at
└── created_by_user_id
```

`created_by_user_id` should normally equal the deck owner and provides useful audit history.

---

## 4.26 Share Uniqueness

There may be at most one active direct share between:

```text
one deck
and
one recipient user
```

Enforce with an appropriate database unique constraint.

---

## 4.27 Cannot Share With Owner

The owner must not create a share to themselves.

Return a clear validation result such as:

```text
CANNOT_SHARE_WITH_OWNER
```

or equivalent.

---

## 4.28 Sharing With Disabled Users

Do not create a new share to a currently disabled account.

Return a controlled validation error.

If an existing recipient is later disabled:

```text
the share record may remain

the disabled user cannot access it

access automatically returns only if the account is later re-enabled
```

unless a later policy says otherwise.

---

## 4.29 Sharing by Username

The Deck Depot UI may allow the owner to share using the recipient's Arena username.

Example:

```text
Share with:
alice
```

The server resolves the normalized username to a real user ID.

---

## 4.30 No Broad User Directory Required

Phase 4 does not require a browsable directory of all Arena users.

Sharing may use exact username entry.

Do not create a global public user-search feature merely to implement deck sharing.

---

## 4.31 Share User Lookup

If an exact authenticated username lookup is required for the UI, expose only the minimum information required.

Conceptually:

```json
{
  "id": "...",
  "username": "alice",
  "display_name": "Alice"
}
```

Do not expose:

```text
password metadata
session information
roles unless required
last login
security logs
```

---

## 4.32 Preferred Share API

A simple owner workflow may use:

```text
POST /api/decks/{deckId}/shares
```

Request:

```json
{
  "username": "alice"
}
```

The server resolves the recipient internally.

---

## 4.33 Duplicate Share Request

Sharing the same deck with the same user twice must not create duplicate relationships.

The API may return the existing share or a documented conflict.

Prefer idempotent behavior where practical.

---

## 4.34 Share Revocation

The owner must be able to revoke a share.

Conceptually:

```text
DELETE /api/decks/{deckId}/shares/{recipient-or-share-id}
```

Exact route shape should follow established API conventions.

---

## 4.35 Revocation Takes Effect Server-Side

After revocation, the former recipient must no longer be authorized to:

```text
retrieve deck detail
retrieve deck list/card data
retrieve protected card artwork
use the deck through the server authorization service
```

---

## 4.36 Client Cache Limitation

Revocation prevents future server access.

It cannot erase pixels or data already displayed in a user's browser before revocation.

Protected responses should avoid unnecessary long-lived public caching.

---

## 4.37 Protected Artwork Caching

Deck artwork served through authenticated Deck Depot routes should use caching appropriate for private user data.

Prefer:

```text
Cache-Control: private
```

and, where needed for reliable access revocation:

```text
no-store
```

Do not configure shared/private deck artwork for public Cloudflare caching.

---

## 4.38 Share Removal by Recipient

Phase 4 may allow a recipient to remove a deck from their own Shared With Me library.

If implemented, this deletes only that user's share relationship.

It must not delete the owner's deck.

This is optional for Phase 4 unless implementation simplicity strongly favors including it.

---

## 4.39 No Public Sharing

Phase 4 does not introduce:

```text
Public
Anyone With Link
Published
Community
Global
```

deck visibility.

Sharing is with specific authenticated Arena users only.

---

## 4.40 No Anonymous Share Links

Do not create:

```text
secret deck URL
anonymous token link
public share code
```

in Phase 4.

Deck access requires an authenticated Arena user.

---

## 4.41 Deck Access States

For authorization purposes, a user can have one of:

```text
OWNER
SHARED
NO_ACCESS
```

to a deck.

This may be represented internally however is most appropriate.

---

## 4.42 Owner Authorization

`OWNER` may:

```text
view
use
share
revoke shares
delete
```

---

## 4.43 Shared Authorization

`SHARED` may:

```text
view
use
```

and may optionally remove their own share.

---

## 4.44 No-Access Authorization

`NO_ACCESS` may not:

```text
view metadata
view deck contents
view artwork
use deck
manage deck
```

---

## 4.45 Central Deck Authorization Service

Create one reusable server-side authorization service/function.

Conceptually:

```text
getDeckAccess(userId, deckId)
```

or:

```text
canViewDeck(userId, deckId)
canUseDeck(userId, deckId)
canManageDeck(userId, deckId)
```

Do not scatter ownership comparisons independently across routes.

---

## 4.46 Future Match Authorization

The authorization layer must expose a stable server-side answer for:

```text
canUseDeck(authenticatedUserId, deckId)
```

Later lobby/match phases will rely on this.

The browser's claim that it may use a deck is not sufficient.

---

## 4.47 Deck Use Authorization

For Phase 4:

```text
OWNER
=
may use

SHARED
=
may use

NO_ACCESS
=
may not use
```

This does not perform format legality checking.

---

## 4.48 Deck Access Is Not Format Legality

These are separate questions:

```text
May user access/use this deck?
```

and:

```text
Is this deck legal for the selected Magic format?
```

Deck Depot answers the first.

Forge answers the second at the appropriate later gameplay/match stage.

---

## 4.49 Admin Role Does Not Automatically Own Decks

An ADMIN user does not automatically become owner of every deck.

---

## 4.50 Admin Role Does Not Automatically Bypass Privacy

Phase 4 does not automatically give administrators ordinary Deck Depot access to every user's private deck.

If future administrative moderation/support access is needed, define it explicitly in the phase that needs it.

---

## 4.51 Authenticated Upload

The existing Phase 2 import route becomes usable in production only for authenticated users.

Conceptually:

```text
POST /api/decks/import
```

requires:

```text
valid authenticated session
valid CSRF protection
ACTIVE user
```

---

## 4.52 Upload Ownership Binding

During a successful import:

```text
authenticated user
        ↓
Phase 2 validation/import
        ↓
deck record
        ↓
owner_user_id = authenticated user ID
```

Ownership is part of the import transaction.

---

## 4.53 No Ownerless Successful Upload

If ownership cannot be persisted:

```text
the import fails
```

A successful Phase 4 upload must not leave a production deck with:

```text
owner_user_id = null
```

---

## 4.54 Import Atomicity Remains Required

Phase 2 atomic import requirements remain in force.

Phase 4 extends the atomic business result to include ownership.

A deck should not become visible when:

```text
files succeeded but ownership failed
database ownership succeeded but files failed
share metadata accidentally created before import completed
```

---

## 4.55 Phase 2 ZIP Contract Remains Authoritative

Deck Depot uploads accept the Proxic Deck Builder ZIP contract established by Phase 2.

Do not introduce a second import parser.

---

## 4.56 Proxic Deck Builder Remains Read Only

The project:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

remains strictly read-only.

Phase 4 must not modify it.

---

## 4.57 No External Card Service

Deck Depot must continue to import using:

```text
Deck Builder package
+
Forge
```

without requiring an external card-data service.

---

## 4.58 My Decks

Deck Depot must provide an authenticated list of decks owned by the current user.

UI concept:

```text
Deck Depot

My Decks
--------
Deck A
Deck B
Deck C
```

---

## 4.59 Shared With Me

Deck Depot must provide a separate authenticated list of decks shared with the current user.

UI concept:

```text
Shared With Me
--------------
Deck X — shared by Alice
Deck Y — shared by Bob
```

---

## 4.60 Do Not Mix Ownership Visually

The UI should make it clear whether a deck is:

```text
Mine
or
Shared With Me
```

so users do not accidentally assume they may manage a shared deck.

---

## 4.61 Deck List API

The API should support retrieving the authenticated user's accessible deck library.

Possible designs:

```text
GET /api/decks
```

returning categorized results,

or:

```text
GET /api/decks/mine
GET /api/decks/shared-with-me
```

Use the approach that best fits existing API conventions.

---

## 4.62 No Global Deck Listing

Do not add:

```text
GET /api/decks/all
```

for normal users.

A user must not be able to enumerate every deck in the database.

---

## 4.63 Owner Deck Detail

The owner may retrieve full normalized deck details required by Deck Depot.

---

## 4.64 Shared Deck Detail

A shared recipient may retrieve the same gameplay-relevant deck/card information required to view and later use the deck.

Management metadata should be restricted appropriately.

---

## 4.65 Unauthorized Deck Detail

If a user has no access to a deck ID:

prefer a response that does not unnecessarily confirm that the deck exists.

Recommended:

```text
404 Not Found
```

rather than exposing that a private deck exists.

---

## 4.66 Known Deck But Forbidden Action

If a shared recipient can view a deck but attempts an owner-only action such as deletion:

```text
403 Forbidden
```

is appropriate.

---

## 4.67 Horizontal Authorization Protection

Every deck route must protect against:

```text
User B changing URL deck ID to User A's private deck

User B deleting User A's deck

User B sharing User A's deck

User B revoking User A's shares

User B fetching artwork from User A's unshared deck
```

Opaque IDs are not authorization.

---

## 4.68 Artwork Authorization

Card artwork for a private/shared deck must enforce the same deck access policy.

The browser should use same-origin authenticated URLs such as:

```text
/api/decks/{deckId}/assets/{assetId}
```

or equivalent.

---

## 4.69 No Raw Filesystem Access

Do not expose:

```text
/data/decks/...
```

directly through a generic static-files mount.

The server must authorize access first.

---

## 4.70 Share Management UI

For a deck owned by the current user, Deck Depot should provide a simple Share panel.

Conceptually:

```text
Share Deck

Username: [ alice              ]
          [ Share ]

Currently Shared With:
Alice (@alice)       [ Revoke ]
Bob (@bob)           [ Revoke ]
```

---

## 4.71 Shared User Cannot See Share Management

A shared recipient must not receive owner share-management controls.

---

## 4.72 Share Result Messages

The UI must provide useful results for:

```text
user not found
user disabled
already shared
cannot share with yourself
share created
share revoked
server error
```

---

## 4.73 Deck Owner Display

Shared With Me should identify who owns/shared the deck using safe user information such as:

```text
display name
username
```

Do not expose private authentication data.

---

## 4.74 Upload UI Moves Into Deck Depot

The Phase 2 local/development upload UI should evolve into the authenticated Deck Depot.

The production Deck Depot must allow an authenticated user to:

```text
select Proxic Deck Builder ZIP
upload
validate/import
become owner
see the deck appear in My Decks
```

---

## 4.75 Upload Failure Does Not Create Ownership

A failed import must not create:

```text
empty deck
ownership row
share row
```

that appears in Deck Depot.

---

## 4.76 Deck Deletion

Only the owner may delete a deck.

---

## 4.77 Delete Confirmation

The UI should require deliberate confirmation before deleting an owned deck.

The confirmation should make clear that:

```text
the deck will be removed
all sharing relationships will end
shared users will lose access
```

---

## 4.78 Delete Cascade

Deleting a deck must remove:

```text
deck share records
deck metadata
deck entries
internal manifest relationship
owned image files
```

according to the Phase 2 deletion model.

---

## 4.79 Shared Deck Deletion Result

When an owner deletes a shared deck:

```text
the deck disappears from recipients' Shared With Me library
```

Recipients must not retain a broken database reference.

---

## 4.80 Shared Recipient Cannot Delete

A recipient attempting to delete a shared deck must receive:

```text
403 Forbidden
```

or the project's equivalent structured authorization error.

---

## 4.81 Immutable Import Model Continues

Phase 4 does not add deck editing.

The imported deck remains the normalized representation of the uploaded package.

---

## 4.82 Updated Deck Workflow

If the owner changes their deck in Proxic Deck Builder, the Phase 4 workflow is:

```text
edit in Proxic Deck Builder

export new ZIP

upload new ZIP to Arena
```

The newly imported package receives its own Arena deck identity unless a later replacement/versioning feature is explicitly implemented.

---

## 4.83 No Silent Replacement

Uploading a ZIP with the same:

```text
deck name
package checksum
source filename
```

must not silently overwrite an existing owned deck.

Follow the Phase 2 duplicate-import rules.

---

## 4.84 No Automatic Share Propagation to New Import

If an owner uploads a new version as a new deck:

```text
existing shares on the old deck
```

must not automatically copy to the new deck unless a future versioning system explicitly defines that behavior.

---

## 4.85 Shared Deck Is a Live Reference

A share references the owner's existing imported deck.

It is not a personal copy owned by the recipient.

---

## 4.86 No Copy-to-My-Decks Yet

Phase 4 does not require:

```text
Clone
Fork
Copy to My Decks
```

for a shared deck.

---

## 4.87 No Download Export Yet

Deck Depot does not need to provide ZIP downloading/export.

Proxic Deck Builder remains the deck-building/export application.

---

## 4.88 Database Migration

Add a Phase 4 Flyway migration.

Example:

```text
V004__deck_depot.sql
```

Use the actual next migration number.

Never modify an already-applied migration.

---

## 4.89 Expected Schema Changes

Phase 4 will likely require:

```text
decks.owner_user_id
deck_shares
```

plus supporting indexes/constraints.

Do not add unrelated social tables.

---

## 4.90 Referential Integrity

Database foreign keys should prevent invalid relationships.

At minimum:

```text
deck owner references valid user
deck share references valid deck
deck share recipient references valid user
```

---

## 4.91 Share Cascade on Deck Delete

Deleting a deck should remove its share relationships automatically or transactionally.

Do not leave orphan share rows.

---

## 4.92 User Deletion Still Not Implemented

Phase 3 did not implement permanent user deletion.

Phase 4 should not introduce it accidentally merely because deck ownership exists.

Disabled users retain database identity.

---

## 4.93 Disabled Owner

If a deck owner becomes disabled:

```text
the owner cannot log in

the owner's private decks remain stored

existing shares should not automatically transfer ownership
```

---

## 4.94 Shared Access When Owner Is Disabled

Phase 4 behavior is:

```text
shared recipients retain access to an already-shared deck
```

even if the owner account is disabled.

Disabling an owner prevents the owner from using the system; it does not silently delete or revoke unrelated recipients' existing deck access.

If implementation evidence reveals a material security or data-integrity conflict with this rule:

**STOP AND REPORT THE CONFLICT.**

---

## 4.95 No Owner Transfer on Disable

Do not transfer disabled-user decks to ADMIN or another account.

---

## 4.96 Authenticated User Deactivation

A disabled recipient cannot access shared decks because Phase 3 authentication rejects the account.

No special Deck Depot bypass is permitted.

---

## 4.97 Deck Metadata

Deck Depot list/detail responses may include:

```text
deck_id
display_name
owner summary
imported_at
card counts
section counts
access level
shared status
```

Do not expose filesystem storage paths.

---

## 4.98 Owner Summary

For a shared deck, a safe owner summary may include:

```text
user_id
username
display_name
```

Only include fields actually needed by the UI.

---

## 4.99 Share List Visibility

Only the deck owner should receive the list of users with whom the deck is shared.

A recipient does not need to know every other recipient.

---

## 4.100 Share Count

The owner UI may display a share count.

A recipient does not need access to the full sharing graph.

---

## 4.101 Authorization Error Shape

Use the existing structured error model.

Possible codes:

```text
DECK_NOT_FOUND
DECK_ACCESS_DENIED
DECK_OWNER_REQUIRED
SHARE_USER_NOT_FOUND
SHARE_USER_DISABLED
CANNOT_SHARE_WITH_OWNER
DECK_ALREADY_SHARED
```

Exact names should follow established conventions.

---

## 4.102 CSRF

All Deck Depot state-changing operations must use the Phase 3 CSRF mechanism.

This includes:

```text
deck upload
deck deletion
create share
revoke share
recipient removes own share if implemented
```

---

## 4.103 Session Authorization

Every Deck Depot request must derive user identity from the server-authenticated session.

Do not accept `user_id` in query/body as authorization proof.

---

## 4.104 Share Request Race Conditions

Concurrent attempts to share the same deck with the same user must not create duplicate rows.

Use:

```text
database uniqueness
+
transaction/error handling
```

rather than relying only on UI button state.

---

## 4.105 Delete/Share Race

If a deck is being deleted while another request attempts to share it:

the result must be consistent.

Do not leave:

```text
orphan share
share to nonexistent deck
half-deleted deck
```

---

## 4.106 Revocation/Access Race

Authorization must be checked server-side at request time.

A stale frontend showing an old Shared With Me entry must not override a revoked server share.

---

## 4.107 Server Is Authoritative

The browser may cache/display:

```text
access = SHARED
```

for UI purposes.

The server still makes the final authorization decision on every protected operation.

---

## 4.108 No Client-Side Security

Hiding a Delete button is not sufficient authorization.

The backend must reject unauthorized delete/share/access requests even if manually constructed.

---

## 4.109 Deck Depot Navigation

Add an authenticated navigation entry:

```text
Deck Depot
```

---

## 4.110 Recommended Deck Depot Route

Prefer preserving the Phase 2 route:

```text
/decks
```

while labeling the feature:

```text
Deck Depot
```

This avoids needless route churn.

A redirect/alias may be used if an accepted frontend convention requires another path.

---

## 4.111 Deck Depot Main View

Recommended structure:

```text
Deck Depot

[ Upload Deck ]

My Decks
--------------------------------

Shared With Me
--------------------------------
```

---

## 4.112 Owned Deck Card/Row

An owned deck summary should clearly provide:

```text
deck name
card count
import date
shared/not shared indicator
open/view action
share action
delete action
```

Keep the initial UI functional rather than elaborate.

---

## 4.113 Shared Deck Card/Row

A shared deck summary should provide:

```text
deck name
owner identity
card count
open/view action
```

Do not show owner-only actions.

---

## 4.114 Empty States

Provide useful empty states.

Examples:

```text
You have not uploaded any decks yet.

No decks have been shared with you.
```

---

## 4.115 Upload Success

After successful upload:

```text
deck appears in My Decks

owner is current authenticated user

deck does not appear in another user's library
```

unless explicitly shared.

---

## 4.116 Upload Error

Preserve Phase 2 package-validation errors.

Authentication/ownership should not hide useful import diagnostics.

---

## 4.117 Sharing Dialog

Share UI should require exact recipient username or another deliberately limited selection mechanism.

Do not introduce a global autocomplete directory without explicit need.

---

## 4.118 Confirmation of Recipient

When sharing succeeds, display enough identity to reduce accidental sharing:

```text
Shared with Alice (@alice)
```

---

## 4.119 Recipient View

After sharing, the recipient should see the deck under:

```text
Shared With Me
```

on their next normal refresh/load.

Real-time push notification is not required.

---

## 4.120 No Notification Infrastructure

Do not add:

```text
email notification
push notification
web notification
message queue
```

solely to announce a deck share.

---

## 4.121 Deck Depot WebSocket

Phase 4 does not require a new WebSocket protocol for Deck Depot.

HTTP APIs are sufficient for upload/library/share operations.

---

## 4.122 Future Lobby Consumption

Phase 4 should expose a service/API that future lobby logic can use to retrieve:

```text
all decks current user may use
```

meaning:

```text
owned decks
+
shared decks
```

---

## 4.123 Deck Selection Contract

Later phases should be able to submit:

```text
deck_id
```

and have the server validate:

```text
canUseDeck(currentUserId, deckId)
```

before proceeding.

No match is launched in Phase 4.

---

## 4.124 No Deck Legality Decision in Deck Depot

Deck Depot does not decide whether a deck is legal for:

```text
Standard
Modern
Commander
Two-Headed Giant
other format
```

That remains Forge/match setup responsibility.

---

## 4.125 No Card Rules in Deck Depot

Do not duplicate Forge card rules in Deck Depot.

---

## 4.126 Storage Accounting

Sharing a deck must not multiply physical storage usage.

A shared relationship should be a small database record only.

---

## 4.127 Storage Measurement

Record:

```text
number of imported decks
total deck artwork storage
number of shares
average share-record size if useful
```

only as practical diagnostics.

Do not build an analytics platform.

---

## 4.128 No Premature Storage Quotas

Because accounts are administrator-created and expected scale is small, Phase 4 does not require a complex quota system.

Phase 2 archive limits remain in force.

If actual storage measurements demonstrate a need for per-user limits, report evidence before adding them.

---

## 4.129 Audit Logging

Log important Deck Depot actions.

Examples:

```text
deck uploaded
deck import failed
deck deleted
share created
share revoked
unauthorized management attempt
```

---

## 4.130 Audit Fields

Where appropriate:

```text
request_id
user_id
deck_id
recipient_user_id
action
result
```

Do not log binary artwork or entire package contents.

---

## 4.131 No Sensitive Session Data in Deck Logs

Never log:

```text
raw session token
password
CSRF token
```

with Deck Depot actions.

---

## 4.132 Database Query Authorization

Avoid patterns such as:

```text
load any deck by ID
then forget to authorize it
```

Prefer repository/service operations that make authorization difficult to bypass.

---

## 4.133 Query Owned Decks

Owned deck listing must filter by:

```text
owner_user_id = authenticated user
```

server-side.

---

## 4.134 Query Shared Decks

Shared deck listing must join only share rows for:

```text
shared_with_user_id = authenticated user
```

server-side.

---

## 4.135 Pagination

At expected project scale, sophisticated pagination is not mandatory.

However, APIs should avoid architectural assumptions that require loading an unlimited global deck collection.

Simple pagination may be added if implementation is straightforward.

---

## 4.136 Sorting

Reasonable initial sort:

```text
most recently imported first
```

or another simple deterministic ordering.

Do not build elaborate filtering in Phase 4.

---

## 4.137 Search

Deck name filtering within:

```text
My Decks
Shared With Me
```

is optional.

Do not implement global deck discovery.

---

## 4.138 Owner Deck Deletion Confirmation Test

Verify the browser cannot accidentally delete a deck with a single unintended click.

---

## 4.139 Ownership Database Test

Upload as User A.

Inspect the database.

Verify:

```text
owner_user_id = User A
```

---

## 4.140 Client Ownership Spoof Test

Authenticate as User A.

Attempt to upload while submitting:

```text
owner_user_id = User B
```

The resulting deck must still belong to User A or the invalid ownership field must be rejected.

---

## 4.141 Private Deck Isolation Test

User A uploads a deck.

User B must not see it in:

```text
My Decks
Shared With Me
direct deck URL
artwork URL
```

before sharing occurs.

---

## 4.142 Share Creation Test

User A shares Deck X with User B.

Verify:

```text
User A remains owner

User B sees deck in Shared With Me

User B can view deck details

User B can retrieve authorized artwork

no deck files are duplicated
```

---

## 4.143 Third-User Isolation Test

With Deck X shared from User A to User B:

```text
User C
```

must not receive access.

---

## 4.144 Share Revocation Test

Revoke User B's access.

Verify:

```text
Deck X disappears from User B's shared library

deck detail access fails

artwork access fails

canUseDeck(User B, Deck X) = false
```

---

## 4.145 Owner Access After Revocation

Revoking User B must not affect User A's ownership/access.

---

## 4.146 Multi-Recipient Share Test

Share the same deck with:

```text
User B
User C
```

Verify both can access it independently.

Revoking User B must not revoke User C.

---

## 4.147 Duplicate Share Test

Attempt to share the same deck with the same user twice.

Verify only one active share relationship exists.

---

## 4.148 Self-Share Test

Owner attempts to share deck with their own username.

Request fails safely.

---

## 4.149 Disabled Recipient Share Test

Attempt to create a share to a disabled user.

Request is rejected.

---

## 4.150 Disabled Recipient Existing Share Test

Create share.

Disable recipient.

Verify recipient cannot authenticate/access.

Re-enable recipient.

Verify the existing share behaves according to the locked Phase 4 policy.

---

## 4.151 Shared Management Denial Test

User B has shared access to User A's deck.

User B attempts:

```text
delete
create another share
revoke User C
change owner
```

All owner-only operations fail.

---

## 4.152 Direct Object Reference Test

User B manually changes a URL/API request to an unshared User A deck ID.

Access fails.

---

## 4.153 Artwork Direct Reference Test

User B obtains or guesses:

```text
deck ID
asset ID
```

for an unshared deck.

Artwork request fails.

---

## 4.154 Revoked Artwork Test

User B has access to artwork.

Owner revokes share.

A new artwork request must fail.

---

## 4.155 Delete Shared Deck Test

User A shares deck with User B and then deletes it.

Verify:

```text
deck disappears for both

share row disappears

metadata disappears

deck assets are removed

no broken shared entry remains
```

---

## 4.156 Shared User Delete Test

User B attempts to delete User A's shared deck.

The operation fails and deck remains intact.

---

## 4.157 Two-User Browser E2E

Using two independent browser sessions:

```text
User A logs in

User A uploads deck

User B logs in

User B cannot initially see deck

User A shares deck with User B

User B sees deck

User B opens deck

User A revokes share

User B loses access
```

**Required evidence:** Playwright or equivalent real-browser RUN.

---

## 4.158 Public Production Deck Depot Test

Through:

```text
https://arena.barnflix.net
```

verify:

```text
anonymous user cannot access Deck Depot

authenticated User A may upload

User A owns upload

authenticated User B cannot see it until shared

sharing works through production deployment
```

---

## 4.159 CSRF Deck Upload Test

Authenticated upload without valid Phase 3 CSRF proof fails.

Valid upload with correct CSRF proof succeeds.

---

## 4.160 CSRF Share Test

Creating or revoking a share without valid CSRF proof fails.

---

## 4.161 Session Spoofing Test

Changing request body/query to another:

```text
user_id
```

must not change the authenticated Deck Depot identity.

---

## 4.162 Legacy Deck Migration Test

If legacy unowned Phase 2 decks exist:

verify they remain inaccessible until explicitly assigned or deleted according to project-owner direction.

No implicit owner assignment is permitted.

---

## 4.163 Storage Layout Test

Upload decks as multiple different users.

Verify physical files remain:

```text
/data/decks/<deck-id>/
```

rather than being reorganized into user folders.

---

## 4.164 Share Storage Test

Share the same deck with multiple users.

Verify only one physical normalized deck/artwork set exists.

---

## 4.165 Container Persistence

Deck ownership and sharing metadata must survive:

```text
Arena Server restart

PostgreSQL restart

Arena container replacement

Docker Compose recreation
```

provided persistent application data is preserved.

---

## 4.166 Static Analysis

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

## 4.167 Phase 4 Required Documentation

Create:

```text
docs/architecture/DECK_DEPOT.md
docs/architecture/DECK_AUTHORIZATION.md
docs/troubleshooting/DECK_DEPOT.md
```

Update as required:

```text
README.md
BUILD_PLAN.md
AGENTS.md
```

---

## 4.168 `DECK_DEPOT.md`

Document:

```text
ownership model
private-by-default behavior
sharing model
My Decks
Shared With Me
upload workflow
share workflow
revocation workflow
delete workflow
legacy Phase 2 deck handling
persistent storage relationship
```

---

## 4.169 `DECK_AUTHORIZATION.md`

Document the exact server-side rules for:

```text
OWNER
SHARED
NO_ACCESS
view
use
share
delete
artwork access
```

This document should become the authorization reference for later lobby/match phases.

---

## 4.170 Deck Depot Troubleshooting

Cover:

```text
upload unavailable
upload rejected
deck not appearing
wrong owner
share user not found
recipient disabled
deck already shared
shared deck not visible
share revocation not reflected
artwork forbidden
legacy ownerless deck
persistent storage missing
database ownership mismatch
```

---

## 4.171 Phase 4 Checklist

### Execution prerequisites

- [ ] Prior phases have been implemented, tested, and accepted before Phase 4 implementation begins.
- [ ] Phase 2 importer behavior is available.
- [ ] Phase 3 authenticated user identity is available.
- [ ] Phase 3 CSRF protection is available.
- [ ] Phase 3 authorization principal is available.

### Database

- [ ] Inspect existing Phase 2 deck records.
- [ ] Identify legacy unowned decks.
- [ ] Escalate legacy ownership decisions when required.
- [ ] Add `owner_user_id`.
- [ ] Enforce owner relationship.
- [ ] Create `deck_shares`.
- [ ] Add share uniqueness.
- [ ] Add indexes.
- [ ] Add foreign keys.
- [ ] Add delete cascade/transaction behavior.
- [ ] Enforce no new ownerless production decks.

### Ownership

- [ ] Authenticated uploader becomes owner.
- [ ] Ignore/reject client-supplied owner.
- [ ] Owner remains stable.
- [ ] No transfer ownership feature.
- [ ] No automatic legacy ownership assignment.
- [ ] Storage remains deck-ID based.

### Sharing

- [ ] Private by default.
- [ ] Owner may share with specific user.
- [ ] Shared user may view.
- [ ] Shared user may use.
- [ ] Shared user may not manage.
- [ ] No re-sharing.
- [ ] Owner may revoke.
- [ ] Prevent self-sharing.
- [ ] Prevent duplicate shares.
- [ ] Reject new share to disabled user.
- [ ] No public sharing.
- [ ] No anonymous share links.

### Authorization

- [ ] Implement central deck authorization.
- [ ] Implement OWNER.
- [ ] Implement SHARED.
- [ ] Implement NO_ACCESS.
- [ ] Protect metadata.
- [ ] Protect artwork.
- [ ] Protect delete.
- [ ] Protect share management.
- [ ] Expose `canUseDeck`.
- [ ] Do not trust browser claims.
- [ ] ADMIN does not automatically bypass privacy.

### Import

- [ ] Enable authenticated production upload.
- [ ] Require ACTIVE authenticated user.
- [ ] Require CSRF.
- [ ] Reuse Phase 2 import pipeline.
- [ ] Bind owner atomically.
- [ ] Preserve ZIP security.
- [ ] Preserve Forge resolution.
- [ ] Keep Deck Builder read-only.
- [ ] Keep external card APIs unnecessary.

### Frontend

- [ ] Add Deck Depot navigation.
- [ ] Provide My Decks.
- [ ] Provide Shared With Me.
- [ ] Provide authenticated upload.
- [ ] Show owner/shared distinction.
- [ ] Add owner share dialog.
- [ ] Show current share recipients to owner.
- [ ] Add revoke action.
- [ ] Add owner delete action.
- [ ] Hide management controls from recipients.
- [ ] Add useful empty states.
- [ ] Handle authorization failures.

### Storage

- [ ] Keep `/data/decks/<deck-id>/`.
- [ ] Do not create permanent user deck directories.
- [ ] Sharing creates no duplicate artwork.
- [ ] Protect artwork through authorized application route.
- [ ] Prevent public caching of private deck content.

### Security

- [ ] Verify cross-user IDOR protection.
- [ ] Verify owner spoof protection.
- [ ] Verify share-management authorization.
- [ ] Verify protected artwork.
- [ ] Verify CSRF on mutations.
- [ ] Verify disabled users cannot access.
- [ ] Verify no global deck enumeration.
- [ ] Verify no client-side-only authorization.

### Testing

- [ ] Ownership test passes.
- [ ] Private deck isolation passes.
- [ ] Share creation passes.
- [ ] Third-user isolation passes.
- [ ] Share revocation passes.
- [ ] Multiple-recipient share passes.
- [ ] Duplicate share protection passes.
- [ ] Self-share rejection passes.
- [ ] Disabled recipient tests pass.
- [ ] Shared management denial passes.
- [ ] Direct deck-ID attack test passes.
- [ ] Direct artwork attack test passes.
- [ ] Delete shared deck test passes.
- [ ] Two-user browser E2E passes.
- [ ] Production Deck Depot test passes.
- [ ] Persistence tests pass.
- [ ] Static analysis passes.

### Documentation

- [ ] `DECK_DEPOT.md` complete.
- [ ] `DECK_AUTHORIZATION.md` complete.
- [ ] Deck Depot troubleshooting complete.
- [ ] README updated.
- [ ] BUILD_PLAN updated.
- [ ] AGENTS.md updated if required.

---

## 4.172 Mandatory Acceptance Tests

### P4-A — Ownership Migration

The Phase 2 deck database state is inspected before ownership constraints are finalized.

Any existing ownerless decks are explicitly handled rather than silently assigned.

**Required evidence:** RUN / migration report.

### P4-B — Authenticated Upload Ownership

User A uploads a valid Deck Builder ZIP.

The resulting deck:

```text
owner_user_id = User A
```

**Required evidence:** RUN.

### P4-C — Owner Spoof Protection

User A attempts to submit User B as the owner.

The deck does not become owned by User B.

**Required evidence:** RUN.

### P4-D — Private by Default

User A uploads a deck.

User B and User C cannot see or access it.

**Required evidence:** RUN.

### P4-E — My Decks

User A's uploaded deck appears in:

```text
My Decks
```

for User A.

**Required evidence:** browser RUN.

### P4-F — Share Creation

User A shares the deck with User B.

User B receives valid shared access.

**Required evidence:** RUN.

### P4-G — Shared With Me

The shared deck appears in User B's:

```text
Shared With Me
```

and identifies User A as owner.

**Required evidence:** browser RUN.

### P4-H — Shared Deck View

User B can view the shared deck's normalized information and protected artwork.

**Required evidence:** RUN.

### P4-I — Third-User Isolation

User C cannot access the deck shared only with User B.

**Required evidence:** RUN.

### P4-J — Shared Management Denied

User B cannot:

```text
delete
share
revoke shares
change ownership
```

of User A's deck.

**Required evidence:** RUN.

### P4-K — Share Revocation

User A revokes User B.

User B loses metadata, artwork, and `canUseDeck` access.

**Required evidence:** RUN.

### P4-L — Multiple Recipients

A deck can be shared independently with User B and User C.

Revoking one does not revoke the other.

**Required evidence:** RUN.

### P4-M — Duplicate Share Protection

Repeated sharing with the same recipient creates only one active share relationship.

**Required evidence:** RUN.

### P4-N — Self-Share Protection

Owner cannot share deck with themselves.

**Required evidence:** RUN.

### P4-O — Disabled Recipient Protection

A new share cannot be created to a disabled account.

**Required evidence:** RUN.

### P4-P — Direct Deck-ID Attack

A user with no deck access cannot gain access by manually using another deck ID.

**Required evidence:** RUN.

### P4-Q — Direct Artwork Attack

A user with no deck access cannot retrieve protected artwork by guessing or reusing asset URLs.

**Required evidence:** RUN.

### P4-R — Delete Shared Deck

Owner deletes a shared deck.

Deck records, shares, manifest relationship, and owned assets are cleaned up consistently.

Recipients no longer see the deck.

**Required evidence:** RUN.

### P4-S — Shared User Cannot Delete

Shared recipient cannot delete the owner's deck.

**Required evidence:** RUN.

### P4-T — `canUseDeck`

Server authorization returns:

```text
true for owner

true for active shared recipient

false for unrelated user

false after revocation
```

**Required evidence:** RUN.

### P4-U — No Filesystem Duplication

Sharing one deck with multiple users does not duplicate:

```text
/data/decks/<deck-id>/
```

or its artwork.

**Required evidence:** inspection/RUN.

### P4-V — Storage Layout Preservation

Uploads from multiple different owners continue to use:

```text
/data/decks/<deck-id>/
```

rather than user-specific physical directories.

**Required evidence:** inspection.

### P4-W — CSRF

Authenticated Deck Depot mutations without valid CSRF protection are rejected.

**Required evidence:** RUN.

### P4-X — Two-User Browser Workflow

Using two independent real browser sessions:

```text
User A uploads

User B cannot see deck

User A shares

User B sees and opens deck

User B cannot manage deck

User A revokes

User B loses access
```

**Required evidence:** Playwright RUN.

### P4-Y — Production Deck Depot

Through:

```text
https://arena.barnflix.net
```

authenticated ownership and specific-user sharing work correctly.

Anonymous users cannot access Deck Depot.

**Required evidence:** external RUN.

### P4-Z — Project Integrity

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD
```

remains unchanged.

Verify:

```text
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

remains unchanged.

Verify upstream Forge contains no unapproved Proxic modifications.

**Required evidence:** integrity check.

---

## 4.173 Required Phase 4 Deliverables

At completion provide:

```text
1. Summary of implementation.

2. Phase 4 database migration.

3. Legacy Phase 2 deck ownership report.

4. Final owner schema.

5. Final deck-share schema.

6. Final ownership rules.

7. Final sharing rules.

8. Final authorization matrix.

9. canUseDeck contract.

10. Deck Depot API routes.

11. Authenticated upload behavior.

12. My Decks behavior.

13. Shared With Me behavior.

14. Share creation behavior.

15. Share revocation behavior.

16. Deck deletion behavior.

17. Artwork authorization behavior.

18. Persistent storage confirmation.

19. Confirmation no user-based filesystem migration occurred.

20. Owner-spoof test result.

21. Private-deck isolation result.

22. Sharing tests.

23. Revocation tests.

24. Cross-user authorization tests.

25. Protected-artwork tests.

26. Two-user Playwright result.

27. Production Deck Depot result.

28. Static-analysis results.

29. Confirmation old Arena remained unchanged.

30. Confirmation Deck Builder remained unchanged.

31. Confirmation upstream Forge remained clean.

32. Any deviations.

33. Any unresolved concerns.

34. Proposed requirements for Phase 5.
```

Do not begin Phase 5 automatically.

---

## 4.174 Phase 4 Exit Gate

Phase 4 implementation is complete only when:

```text
authenticated users can upload Deck Builder ZIPs

the authenticated uploader becomes the owner

every production deck has a real owner

legacy ownerless decks are explicitly handled

decks are private by default

owners can share with specific users

recipients can view shared decks

recipients can use shared decks through server authorization

recipients cannot manage another user's deck

owners can revoke sharing

revocation removes future access

private deck metadata is protected

private deck artwork is protected

client-supplied ownership is not trusted

direct deck-ID attacks fail

sharing does not duplicate deck files

physical storage remains /data/decks/<deck-id>/

Deck Depot works through arena.barnflix.net

anonymous users cannot access Deck Depot

Deck Builder remains read-only

old Arena remains untouched

Forge remains authoritative and unmodified except approved patches

documentation matches actual behavior
```

---

## 4.175 What Phase 4 Does Not Build

The following are intentionally outside Phase 4:

```text
deck editing

ownership transfer

public deck publishing

anonymous share links

global deck discovery

deck ratings

deck comments

social feeds

deck download/export

copy/fork shared deck

email notifications

push notifications

generic deck import

internet card-art downloading

match lobby

session codes

match creation

battlefield

gameplay

match history

replays

spectators
```

---

## 4.176 Escalation Rule

Stop and ask the project owner before:

```text
automatically assigning legacy decks to a user

moving physical deck storage into user directories

giving every authenticated user access to all decks

giving ADMIN automatic access to all private decks

adding public/global deck visibility

adding anonymous share links

adding ownership transfer

allowing recipients to re-share decks

allowing recipients to delete owner decks

changing the Deck Builder export format

modifying Proxic Deck Builder

adding an external card-data dependency

turning Deck Depot into a deck editor

expanding Phase 4 into lobby/gameplay
```

For a conflict report use:

```text
CONFLICT

Phase 4 requirement:

Observed reality:

Evidence:

Impact:

Options:

Recommendation:

Question for project owner:
```

---

## 4.177 Locked-Phase Amendment Rule

This Phase 4 specification is locked.

If a legitimate change to a locked Phase 4 requirement becomes necessary, do not silently edit history.

Create an explicit amendment:

```text
PHASE 4 AMENDMENT <number>

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

# Phase 4 Final Principle

Deck Depot establishes a simple permanent rule:

```text
A deck has one owner.
```

By default:

```text
only that owner may access it.
```

The owner may explicitly grant another authenticated user:

```text
view + use
```

access without copying or transferring the deck.

The permanent authorization chain becomes:

```text
authenticated Arena user
        ↓
deck_id
        ↓
OWNER / SHARED / NO_ACCESS
        ↓
server-authorized deck access
```

The physical deck remains:

```text
/data/decks/<deck-id>/
```

regardless of who may access it.

This gives later lobby and match phases a stable rule:

```text
before accepting a selected deck:

canUseDeck(authenticatedUserId, deckId)
```

must succeed.
