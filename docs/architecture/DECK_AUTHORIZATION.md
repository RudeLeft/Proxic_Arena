# Deck authorization

PHASE_04 §4.169. The exact server-side rules for who may do what
with a deck.

§4.169 says this should become the authorization reference for the
lobby and match phases, so it states the rules as they are
implemented, names the function that answers each question, and is
explicit about what it does **not** decide.

The feature around these rules is `DECK_DEPOT.md`.

---

## One service, deliberately

```kotlin
DeckAuthorization(dataSource)
    .accessFor(userId, deckId): DeckAccess      // OWNER | SHARED | NO_ACCESS
    .canUseDeck(userId, deckId): Boolean        // §4.46
    .mayViewAsset(userId, deckId, assetSha256): Boolean
```

§4.45 forbids scattering ownership comparisons across routes, and
§4.67 is the reason: horizontal authorization fails at the one route
that forgot, and that is never the route anybody tests.

Every answer is computed from the database **on the asking**. Nothing
is cached, and nothing is taken from the request: a share revoked a
second ago must not still be in force.

---

## The three states

```text
OWNER       imported_deck.owner_user_id = you
SHARED      a deck_share row names you
NO_ACCESS   neither — including "the deck does not exist"
```

One SQL statement decides it, so a deck that is somehow both owned
and shared cannot produce two answers depending on which query ran
first. **Ownership wins**: a self-share should never exist (§4.27),
and if one ever did, it would not demote the owner.

A deck that does not exist and a deck you may not see are the **same
answer** (§4.65). The caller must not be able to tell them apart.

### What each state permits

| Capability | OWNER | SHARED | NO_ACCESS |
| --- | --- | --- | --- |
| `mayView()` — detail, entries, artwork | yes | yes | no |
| `mayUse()` — play it (§4.47) | yes | yes | no |
| `mayManage()` — share, revoke, delete | yes | no | no |

Three states rather than a boolean, because "may view" and "may
delete" have different answers for a recipient, and a boolean forces
every caller to re-derive the difference — which is how answers
drift apart.

---

## Status codes, and why they differ

| Situation | Answer | Reason |
| --- | --- | --- |
| no session | `401` | Phase 3; signing in would help |
| deck you cannot see | `404` | §4.65 — do not confirm it exists |
| deck that does not exist | `404` | identical, deliberately |
| recipient tries to delete | `403` | §4.66 — they can see it, so `404` would be a lie they could disprove |
| recipient tries to share | `403` | §4.24 |
| recipient asks who else holds it | `403`, no names | §4.99 |
| asset not in that deck | `404` | §4.68 |

**404 bodies are uniform.** The application's §1.44 handler rewrites
every 404 into one shape, so a route's `DECK_NOT_FOUND` never reaches
a client. That makes §4.65 stronger than it asks for: error codes
cannot leak a difference that does not exist.

---

## Artwork

PHASE 4 AMENDMENT 2. Two conditions, both required:

```text
1. accessFor(user, deck).mayView()
2. the asset is referenced by THAT deck: a deck_entry, a back face
   (deck_face_art, spec 0008) or a token picture (deck_token, spec 0022)
```

The second is what the URL shape `/api/decks/{deckId}/assets/{sha}`
only pretended to do. Measured before the amendment: a valid asset id
requested under a deck id that **did not exist** returned `200` and
the whole image.

Because art is content-addressed and shared between decks, "is this
asset yours" is not a meaningful question — the id is a hash of image
bytes that many decks may use. The meaningful question is whether it
belongs to a deck you may see.

Served with `Cache-Control: private, max-age=31536000, immutable`
(AMENDMENT 3, owner decision D2): shared caches, Cloudflare included,
must not hold deck artwork; the viewer's own browser may, because a
content hash cannot change meaning.

---

## For the lobby and match phases

`canUseDeck(userId, deckId)` is the stable answer those phases must
ask for (§4.46). A browser stating that it may use a deck is not an
answer; it is a claim, and claims are not read anywhere in this
service.

Two things it deliberately does **not** decide:

- **Format legality** (§4.48). A deck you may use can still be an
  illegal deck. Open Format validation is Phase 2's, and it answers a
  different question.
- **Seat, priority or visibility within a match.** Those belong to
  the match (Phase 6), and hidden information is enforced where state
  is serialized, not by a deck-access check.

When Phase 6 needs match-scoped asset access (§6.122), the rule here
is the one to extend rather than replace: a second, parallel answer
to "may you see this image" is how the two drift apart.

---

## What is not implemented

- **No ownership transfer** (§4.17).
- **No admin override** (§4.49, §4.50) — proven by test, not asserted.
- **No public or anonymous sharing** (§4.39, §4.40). Every share
  names an account.
- **No re-sharing** (§4.24). A recipient cannot pass a deck on.
- **No recipient self-removal** (§4.38) — optional in Phase 4, and
  the owner decided to leave it out. It needs no schema change to
  add.
