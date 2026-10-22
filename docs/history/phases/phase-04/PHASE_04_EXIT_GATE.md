# Phase 4 Exit Gate

**Status: PASSED — 2026-10-16**

Decks belong to people. A deck is private until its owner shares it
by username, a recipient may look and play but not manage, and
revoking a share ends access — detail, listing and artwork together.
Proven on the real host: shared with a second account, seen by that
account, revoked, gone.

```text
233 server tests      0 skipped  0 failed
 49 frontend tests    0 failed
 29 browser tests     0 failed
ESLint, Prettier, ktlint, detekt   clean
```

**26 of 26 acceptance tests pass.** Evidence:
`docs/research/phase-04/ACCEPTANCE_LOCAL.md`, covering the local pass
and the production run.

---

## §4.174 Exit criteria

| Criterion | Result |
| --- | --- |
| authenticated users can upload Deck Builder ZIPs | **YES** — through the page, on the host |
| the authenticated uploader becomes the owner | **YES** — from the session, never the request |
| every production deck has a real owner | **YES** — `owner_user_id NOT NULL` |
| legacy ownerless decks explicitly handled | **YES** — `V004`, by name, owner decision D1 |
| decks are private by default | **YES** |
| owners can share with specific users | **YES** — by exact username |
| recipients can view shared decks | **YES** |
| recipients can use shared decks through server authorization | **YES** — `canUseDeck` |
| recipients cannot manage another user's deck | **YES** — 403 on delete, share, revoke, share-list |
| owners can revoke sharing | **YES** |
| revocation removes future access | **YES** — detail, listing and artwork together |
| private deck metadata is protected | **YES** — 404, identical to "does not exist" |
| private deck artwork is protected | **YES** — AMENDMENT 2 |
| client-supplied ownership is not trusted | **YES** — body fields ignored; nothing lands in the named victim's library |
| direct deck-ID attacks fail | **YES** |
| sharing does not duplicate deck files | **YES** — 22 files, 17 MB either side of a share |
| physical storage remains `/data/decks/<deck-id>/` | **AMENDED** — see AMENDMENT 1 |
| Deck Depot works through the production hostname | **YES** — `proxic.barnflix.net` |
| anonymous users cannot access Deck Depot | **YES** — 401 on every deck route |
| Deck Builder remains read-only | **YES** — nothing written to it |
| old Arena remains untouched | **YES** — one pre-existing deletion, owner decided to leave it |
| Forge remains authoritative and unmodified | **YES** — pinned commit, no tracked changes |
| documentation matches actual behaviour | **YES** |

---

## §4.172 Acceptance tests

All 26 pass. P4-A through P4-X and P4-Z locally, P4-Y on the host.
The full record is in the acceptance document; the three worth
repeating here:

**P4-Q — direct artwork attack.** Before this phase the deck id in an
artwork URL was decorative: a valid asset id under a deck id that did
not exist returned `200` and the whole image. It now needs deck
access **and** the asset belonging to that deck. The case that proves
the check is about the deck rather than ownership is an unrelated
deck owned by the *same* user — also refused.

**P4-U — sharing duplicates nothing.** 22 files and 17 MB either side
of a share, and unchanged again after two owners imported the same
package. Content-addressed storage means a second copy adds rows and
no image bytes.

**P4-Y — production.** Shared, seen by the second account, revoked,
gone. Two sessions, one server, a Cloudflare tunnel in between.

---

## Amendments

Four, each recorded in `PHASE_04_DECK_DEPOT_LOCKED.md` rather than
edited quietly into the phase text.

| | What |
| --- | --- |
| **1** | Storage is content-addressed, not `/data/decks/<deck-id>/`. The intent of §4.8 — no reorganisation by user — holds more strongly than the words it used. |
| **2** | Artwork needs deck access **and** the asset being referenced by that deck. The URL shape only pretended to do this. |
| **3** | `Cache-Control: private` on artwork. Phase 2's header was right for public images and wrong for private ones. |
| **4** | Package uniqueness is **per owner**. Global uniqueness leaked a private deck's name and id to a stranger, and made "first to import owns it forever" a rule nobody chose. |

Amendment 4 came from a test-isolation failure, not from a review: two
spec files passed alone and failed together, and chasing that turned
up the leak.

---

## Owner decisions

| | Decision |
| --- | --- |
| **D1** | Both legacy decks assigned to `RudeLeft`, explicitly by name. §4.14 forbids guessing; naming the account the owner identified is a different thing. |
| **D2** | Artwork cached `private` with a long max-age, accepting §4.36's limit that revocation cannot erase a browser's existing copy. |
| **D3** | Recipient self-removal (§4.38) left out of Phase 4. |
| **D4** | Package uniqueness per owner (AMENDMENT 4). |

---

## What this phase learned the hard way

**A leak found by a flaky test.** `decks.spec` and `sharing.spec`
passed alone and failed together. The interference was real, and
underneath it was a privacy fault: a duplicate-import answer named
any deck with that checksum, including a private one belonging to
somebody else.

**"It does not do that" needs someone to have tried.** Nothing in the
authorization path consults the role, so an admin never had
privileged access — but no test had asked. The §4.171 audit found
that, along with `canUseDeck` not being exposed by name for the
phases told to call it.

**The checklist first, documentation second.** Phase 3 did it the
other way and the audit invalidated documents that had just been
written.

**Four of my own test bugs**, each of which passed for the wrong
reason until it did not: comparing 404 bodies containing a unique
request id; asserting a 200 for artwork whose file was never written
to disk; a `${'$'}` escape that produced a directory literally named
`${sha.substring(0, 2)}`; and a "third user" who was actually a share
recipient, which is why the fixtures now carry a fourth account.

**A deployment diagnosed from inference rather than measurement.**
Cached `COPY` layers were read as proof that the build context was
wrong. They were not: an earlier build had legitimately included the
new sources, and every "still the old bundle" reading was taken
before the container was recreated. One command settled what twenty
minutes of reasoning had not — asking the image what it contained.

---

## Unresolved

- **`/api/version` cannot say what is deployed.** `buildId` is null,
  so the only reliable signal is the frontend bundle hash. This cost
  real time during the deployment above. Carried to Phase 5.
- **`up --build` can leave the old container running.** Documented;
  `--force-recreate` is the reliable form.
- **Authentication events are still not logged as events** (deferred
  at the Phase 3 gate, owner decision 2026-10-16).

---

## What Phase 4 did not build

Ownership transfer, admin override, public or anonymous share links,
re-sharing by recipients, recipient self-removal, copy-to-my-decks,
deck export, deck editing, storage quotas, and any gameplay.

---

## Next

`PHASE_04_DELIVERABLES.md` for the §4.173 record. Phase 5 (Lobby,
Game Rooms, Match Setup) is **not** started automatically.
