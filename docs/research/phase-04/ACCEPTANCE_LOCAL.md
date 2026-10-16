# Phase 4 acceptance — local pass

PHASE_04 §4.172. Run 2026-10-16 against the local stack and the test
suites that drive it.

**26 of 26 pass.** 25 here; P4-Y was run by the owner on the real
host and is recorded at the end of this document.

Three accounts carry the suites — an owner, a recipient and a
stranger — plus a fourth that is party to nothing, because with three
users and two of them sharing, the "third party" turns out to be a
recipient. That mistake was live in a test until the §4.171 audit.

---

## Results

| Test | Result |
| --- | --- |
| P4-A Ownership migration | **PASS** |
| P4-B Authenticated upload ownership | **PASS** |
| P4-C Owner spoof protection | **PASS** |
| P4-D Private by default | **PASS** |
| P4-E My Decks | **PASS** |
| P4-F Share creation | **PASS** |
| P4-G Shared With Me | **PASS** |
| P4-H Shared deck view | **PASS** |
| P4-I Third-user isolation | **PASS** |
| P4-J Shared management denied | **PASS** |
| P4-K Share revocation | **PASS** |
| P4-L Multiple recipients | **PASS** |
| P4-M Duplicate share protection | **PASS** |
| P4-N Self-share protection | **PASS** |
| P4-O Disabled recipient protection | **PASS** |
| P4-P Direct deck-ID attack | **PASS** |
| P4-Q Direct artwork attack | **PASS** |
| P4-R Delete shared deck | **PASS** |
| P4-S Shared user cannot delete | **PASS** |
| P4-T `canUseDeck` | **PASS** |
| P4-U No filesystem duplication | **PASS** |
| P4-V Storage layout preservation | **PASS** (as amended) |
| P4-W CSRF | **PASS** |
| P4-X Two-user browser workflow | **PASS** |
| P4-Y Production Deck Depot | **PASS** — on the host, see PRODUCTION below |
| P4-Z Project integrity | **PASS** (one pre-existing deletion, owner decided) |

---

## The evidence

### P4-A — ownership migration

`V004` ran against the real development database on container start,
not only in a fixture:

```text
Migrating schema "public" to version "004 - deck ownership"
flyway applied=1 target=004

select d.display_name, u.username ...
 Basic_Mono_Red_65_Card_Deck | RudeLeft
```

Four tests cover the paths a fixture can reach: a legacy deck gets
the named owner; **without that account the migration refuses rather
than assigning to a different administrator it can see**; an empty
database migrates cleanly and ends `NOT NULL`; and a fresh install
has nothing to assign.

### P4-B / P4-C — ownership comes from the session

`a client cannot choose the owner of a deck it uploads` submits both
`owner_user_id` and `ownerUserId` naming another account. The route
reads the session and ignores the body, and the assertion that
matters is that **nothing appeared in the named victim's library**.

`import()` takes the owner as a required parameter, so an ownerless
import cannot be written by accident.

### P4-D / P4-E / P4-G — private by default, two lists

```text
GET /api/decks -> { "mine": [...], "sharedWithMe": [...] }
```

`the library lists my decks and the ones shared with me, and nothing
else` asserts a third party's private deck is absent, and that the
`mine` section does not contain a shared deck. In a browser: *My
decks* with the deck, *Shared with me* with its empty state.

### P4-F / P4-H / P4-L / P4-M / P4-N / P4-O — sharing rules

| Rule | Test |
| --- | --- |
| share by username, recipient gains access | `the owner can share by username...` |
| case-insensitive match | `sharing matches the username case-insensitively` |
| twice is idempotent, `shareCount` stays 1 | `sharing twice is idempotent` |
| several recipients, revoked individually | `a deck can be shared with several users...` |
| not yourself | `the owner cannot share a deck with themselves` |
| not a disabled account | `sharing with a disabled account is refused` |
| unknown username invents nothing | `sharing with an unknown username says so...` |

### P4-I / P4-J / P4-S — the recipient's limits

```text
recipient deletes        -> 403 DECK_OWNER_REQUIRED
recipient shares onward  -> 403, and the third user really did not get it
recipient revokes        -> 403, and the other recipient still has access
recipient lists shares   -> 403, with no other recipient named in the body
third user, any of these -> 404
```

The 403/404 split is asserted both ways. A recipient told "no such
deck" could disprove it; a stranger must not learn there is one.

### P4-K — revocation

`revoking a share ends deck and artwork access at once` checks deck
detail, the library listing **and** artwork in one test, because
stopping two of three would look like success. The owner is checked
afterwards, unaffected.

### P4-P / P4-Q — direct object references

```text
GET /api/decks/{someone-else's-id}            -> 404
GET /api/decks/{random-uuid}                  -> 404, byte-identical body
GET /api/decks/{deck}/assets/{sha}  stranger  -> 404
GET /api/decks/{other-deck}/assets/{sha}      -> 404  (same owner!)
GET /api/decks/{nonexistent}/assets/{sha}     -> 404
```

The fourth line is the one that proves the check is about the deck
rather than ownership. Before PHASE 4 AMENDMENT 2 every one of these
returned `200` and the whole image: the deck id in the URL was
decorative.

### P4-R — deleting a shared deck

`only the owner may delete` deletes a deck that is currently shared;
the deck and its shares go, the share rows cascade (§4.91), and
artwork other decks reference survives (§2.135).

### P4-T — `canUseDeck`

Owner `true`, recipient `true`, stranger `false`, unknown deck
`false`. Exposed by name because Phases 5 and 6 are told to ask it.

### P4-U — sharing duplicates nothing

Measured either side of a share:

```text
before:  22 files   17M
after:   22 files   17M
```

And after two different owners imported the same package: still 22
files, 17 MB. Artwork is content-addressed, so a second owner's copy
adds rows and no image bytes.

### P4-V — storage layout, as amended

PHASE 4 AMENDMENT 1 restates this test, because §4.163 describes a
`/data/decks/<deck-id>/` layout Phase 2 never built. What it asks
for — no reorganisation into user directories — holds more strongly
than written:

```text
/data/art/display
/data/art/original
/data/temp/deck-imports
/data/temp/uploads
```

No per-user directory, no per-deck directory, after uploads by two
accounts.

### P4-W — CSRF

`sharing without a CSRF token is refused` → `403`, **and the share
count is still 0**. Every refusal in this pass is paired with a check
that the state did not move.

### P4-X — two-user browser workflow

Two independent browser contexts, which is the only honest way to
show a deck is invisible to somebody else: upload → invisible →
shared → opened with artwork → revoked → invisible. A second test
drives the same denials through the API alone, since hiding a button
proves nothing about an attacker who never saw it.

29 browser tests, 0 failures.

### P4-Z — project integrity

```text
forge-upstream HEAD      4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
forge-pin.properties     4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676
tracked modifications    none
forge_patches/           README.md only
```

`Proxic_Arena_OLD` still shows the one deleted file from before
Phase 3. Nothing there was touched today, and the owner decided on
2026-10-16 to leave it. Settled, not outstanding.

---

---

# PRODUCTION — P4-Y

Deployed 2026-10-16 to the Unraid host and driven through
`https://proxic.barnflix.net` by the owner.

## The migrations, on real data

```text
Migrating schema "public" to version "004 - deck ownership"
Migrating schema "public" to version "005 - per owner package uniqueness"
flyway applied=2 target=005
```

`V004` assigned the deck that already existed there to `RudeLeft`
(owner decision D1) — the second time that migration has run against
live data rather than a fixture, after the development stack.

## The arc, confirmed by the owner

```text
shared the deck with Pat
signed in as Pat        -> the deck is there
revoked the share
signed in as Pat again  -> the deck is gone
```

Two accounts, two sessions, one real server behind a Cloudflare
tunnel. Access appeared when a share was created and disappeared when
it was revoked, with nothing cached in between.

What the owner verified is the access arc. The finer points of the
recipient's view — no share panel, no delete control (§4.71) — are
covered by the two-user Playwright run against the local stack rather
than by hand here, and this document does not claim otherwise.

## Deployment notes worth keeping

**`up --build` can leave the old container running.** The build
rebuilt the image and Compose reported the container `Running`
rather than recreating it, so the host served the previous bundle
while holding the current image. `--force-recreate` is the reliable
form, and `pull_policy: build` closes only the build half of that
trap.

**Diagnose from the thing, not from the inference.** Cached `COPY`
layers were read here as proof that the build context was wrong; they
were not. An earlier build had legitimately included the new sources,
and the readings that said "still the old bundle" were taken before
the container was recreated. The one measurement that settled it was
asking the image directly:

```bash
docker run --rm --entrypoint sh proxic-arena-arena-server:latest   -c 'grep -lc "Deck Depot" /app/frontend/dist/assets/*.js'
```

**`/api/version` cannot answer "what is deployed?".** Its `buildId`
is null, so the only honest signal was the frontend bundle hash. That
is a gap, and it is carried into the Phase 5 proposals.
