# Phase 4 Deliverables

PHASE_04 §4.173, in its order. The gate is
`PHASE_04_EXIT_GATE.md`; the evidence is
`docs/research/phase-04/ACCEPTANCE_LOCAL.md`.

---

## 1. Summary of implementation

Decks have owners. The account that uploads a deck owns it, nobody
else can see it, and the owner may share it with named users who can
look and play but not manage. Revoking a share ends access. All of it
is decided server-side by one authorization service, and none of it
moved a file.

## 2. Database migration

`V004__deck_ownership.sql` and `V005__per_owner_package_uniqueness.sql`,
both applied on the host:

```text
flyway applied=2 target=005
```

Earlier migrations were not edited.

## 3. Legacy deck ownership report

Two decks existed before ownership did — one on the development
stack, one on production, both imported by the owner.

`V004` assigns them explicitly to `rudeleft` by normalized username,
under owner decision D1. §4.14 forbids assigning to "the first admin"
or "the first user"; naming the account the owner identified is a
different act. Where that account does not exist the migration
**raises** with what is wrong and what to do, and a test proves it
refuses rather than picking a different administrator it can see.

Nothing was deleted. Nothing was guessed.

## 4. Owner schema

```text
imported_deck.owner_user_id  UUID NOT NULL
    REFERENCES app_user (user_id) ON DELETE RESTRICT
INDEX imported_deck_owner_idx (owner_user_id)
UNIQUE (owner_user_id, package_sha256)      -- V005
```

`RESTRICT`, not `CASCADE`: §4.92 leaves user deletion unimplemented,
and a future `DELETE` that quietly took someone's decks would be a
worse discovery than a foreign key complaining.

## 5. Deck-share schema

```text
deck_share
  share_id             UUID PRIMARY KEY
  deck_id              UUID NOT NULL REFERENCES imported_deck ON DELETE CASCADE
  shared_with_user_id  UUID NOT NULL REFERENCES app_user ON DELETE RESTRICT
  created_by_user_id   UUID NOT NULL REFERENCES app_user ON DELETE RESTRICT
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
  UNIQUE (deck_id, shared_with_user_id)
INDEX deck_share_recipient_idx (shared_with_user_id)
```

The cascade is §4.91's "no orphan share rows", enforced by the
database rather than by remembering to delete in the right order.

## 6. Ownership rules

- The owner is the authenticated uploader, taken from the session
  (§4.6, §4.52). `import()` requires it as a parameter, so an
  ownerless import cannot be written by accident (§4.53).
- Not transferable (§4.17). No admin override (§4.49, §4.50).
- Every deck has one (§4.16).

## 7. Sharing rules

| Rule | Behaviour |
| --- | --- |
| by username | exact, normalized like accounts; `pAt` finds `Pat` |
| with yourself | refused, `CANNOT_SHARE_WITH_OWNER` |
| with a disabled account | refused, `SHARE_USER_DISABLED`; an existing share survives disabling |
| twice | idempotent, `200` not `201`, one row |
| by a recipient | refused, `403` — no re-sharing |
| revocation | by recipient id, idempotent, immediate |

No user directory and no search (§4.30): exact-name lookup only.

## 8. Authorization matrix

| | OWNER | SHARED | NO_ACCESS |
| --- | --- | --- | --- |
| view detail / entries | yes | yes | no |
| view artwork | yes | yes | no |
| use in a match | yes | yes | no |
| share / revoke | yes | no | no |
| delete | yes | no | no |
| see the share list | yes | no | no |

Status codes: `401` no session, `404` no access *and* nonexistent
(identical), `403` for a recipient attempting an owner action —
because they can see the deck, so `404` would be a lie they could
disprove.

## 9. `canUseDeck` contract

```kotlin
DeckAuthorization(dataSource).canUseDeck(userId: UUID, deckId: UUID): Boolean
```

True for owner and recipient, false otherwise, computed from the
database on the asking. Phases 5 and 6 must call this; a browser
stating that it may use a deck is a claim, not an answer.

It does **not** decide format legality (§4.48), nor anything about
seats, priority or hidden information inside a match.

## 10. API routes

```text
GET    /api/decks                               { mine, sharedWithMe }
POST   /api/decks/import                        authenticated upload
GET    /api/decks/{id}                          detail + access + owner
DELETE /api/decks/{id}                          owner only
GET    /api/decks/{id}/assets/{sha}             artwork, private cache
POST   /api/decks/{id}/shares                   share by username
GET    /api/decks/{id}/shares                   owner only
DELETE /api/decks/{id}/shares/{userId}          revoke
```

## 11. Authenticated upload

Session and CSRF required. The Phase 2 pipeline is unchanged
(§4.55): inspect, parse, legality, Forge resolution, artwork. The
owner is bound in the same transaction as the deck row, and a failed
import creates nothing (§4.75).

## 12. My Decks

`mine` — decks owned by the caller, newest import first.

## 13. Shared With Me

`sharedWithMe` — decks shared with the caller, newest share first,
each naming its owner so the page can say "shared by Pat" without a
second request.

Two named lists rather than one array with a flag: §4.60 asks that
nobody assume they may manage a shared deck, and a shape that cannot
express "mixed" enforces that better than a field the page must
remember to read.

## 14. Share creation

`POST /api/decks/{id}/shares` with `{"username": "..."}`. `201` when
created, `200` when it already existed. The insert uses `ON CONFLICT
DO NOTHING` and reads the row back, so two requests racing end with
one share and an answer describing what is (§4.104).

## 15. Share revocation

`DELETE /api/decks/{id}/shares/{userId}`. Immediate, server-side, and
idempotent. Ends detail, listing and artwork together — one test
asserts all three, because stopping two of three would look like
success.

It cannot erase what a browser already downloaded (§4.36).

## 16. Deck deletion

Owner only. Removes the deck, its entries and its share rows;
artwork other decks reference survives (§2.135). A recipient is
refused `403`, a stranger `404`.

## 17. Artwork authorization

PHASE 4 AMENDMENT 2 — deck access **and** the asset being referenced
by that deck, else `404`. Served
`Cache-Control: private, max-age=31536000, immutable` (AMENDMENT 3,
owner decision D2).

## 18. Persistent storage

```text
/data/art/original/<aa>/<sha256>.png
/data/art/display/<aa>/<sha256>.png
```

Bind-mounted to `/mnt/user/appdata/proxic_arena/v2/data`. Survives
container recreation; proven across restarts on the host.

## 19. No user-based filesystem migration

Confirmed after uploads by two accounts: no per-user directory, no
per-deck directory, nothing moved. Ownership and sharing are purely
database concepts (AMENDMENT 1).

## 20. Owner-spoof result

`owner_user_id` and `ownerUserId` submitted in the upload body are
ignored; the owner comes from the session. The assertion that matters
is that nothing appeared in the named victim's library.

## 21. Private-deck isolation

A third party sees `404` for detail, artwork, share list, delete and
share-creation, and the deck is absent from their library. An
administrator gets exactly the same.

## 22. Sharing tests

Share, case-insensitive match, idempotency, several recipients, self-
share refusal, disabled-recipient refusal, unknown-username refusal,
recipient cannot re-share.

## 23. Revocation tests

Access ends for detail, listing and artwork; the other recipient is
unaffected; the owner is unaffected; a recipient cannot revoke.

## 24. Cross-user authorization tests

Direct deck-id, direct artwork, admin privilege, third-user
isolation, and the 403/404 distinction asserted in both directions.

## 25. Protected-artwork tests

Owner yes, recipient yes, stranger no, after revocation no, wrong
deck no, nonexistent deck no, and the cache header is `private`.

## 26. Two-user Playwright result

29 browser tests, 0 failures, including the §4.157 arc across two
independent contexts and a second test driving the same denials
through the API alone.

## 27. Production Deck Depot result

Deployed to the Unraid host; both migrations applied to live data.
The owner shared a deck with a second account, that account saw it,
the share was revoked, and it was gone. Behind a Cloudflare tunnel,
two sessions, one server.

## 28. Static analysis

ktlint, detekt, tsc and ESLint all clean. Detekt twice forced a
split rather than a raised threshold — `deckRoutes` by length and
complexity, and earlier `authRoutes` in Phase 3.

## 29. Old Arena unchanged

`Proxic_Arena_OLD` carries only the deletion that predates Phase 3,
which the owner decided on 2026-10-16 to leave. Nothing was written
there.

## 30. Deck Builder unchanged

`Proxic_Deck_Builder` is read-only to this project (ISO-002) and
nothing was written to it. The ZIP contract is unchanged (§4.55,
§4.56).

## 31. Upstream Forge clean

```text
HEAD                  4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
forge-pin.properties  4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
tracked modifications none
forge_patches/        README.md only
```

## 32. Deviations

- **AMENDMENT 1** — storage is content-addressed, not
  `/data/decks/<deck-id>/`. §4.163's test restated.
- **AMENDMENT 2** — artwork authorization needs the asset-in-deck
  check the URL shape only implied.
- **AMENDMENT 3** — `Cache-Control: private`, changing a Phase 2
  route under Phase 4 authority.
- **AMENDMENT 4** — per-owner package uniqueness, replacing Phase 2's
  global rule.
- **§4.38 recipient self-removal** left out by owner decision.

## 33. Unresolved concerns

- **`/api/version` cannot say what is deployed.** `buildId` is null,
  so the only reliable signal is the frontend bundle hash. This cost
  real time during the deployment and is the first thing I would fix.
- **`up --build` can leave the old container running** — Compose
  compares a config hash, not image contents. `--force-recreate` is
  the reliable form; now documented.
- **Authentication events are still not logged as events** (deferred
  at the Phase 3 gate).
- **No storage quotas** (§4.128, deliberate). Two owners of the same
  package cost no extra artwork, but nothing bounds total uploads.
- **Revoked recipients keep cached images** until their browser
  expires them (§4.36, accepted under owner decision D2).

## 34. Proposed requirements for Phase 5

1. **A build identifier that reaches `/api/version`.** Carried from
   §33. Deployment verification should be one request, not an
   archaeology exercise.
2. **`canUseDeck` is the only deck-permission question the lobby may
   ask.** No second answer, no cached copy, no client claim.
3. **Deck selection carries a deck id, never deck contents** (§4.123).
   The server resolves it; a client that can send a decklist can send
   any decklist.
4. **Decide shared-deck semantics in a match before building them.**
   If a recipient brings a shared deck to a lobby and the owner then
   revokes, what happens to a match in progress is a rule, not an
   implementation detail.
5. **Carry the authentication event logging** from Phase 3's
   unresolved list; lobby actions touch the same request paths.

Phase 5 does not begin automatically.
