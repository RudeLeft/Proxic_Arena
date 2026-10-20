# Match asset authorization

PHASE_06 §6.181. Which card picture a player may see during a match,
and how it is served. Written from `MatchArt.kt`, `MatchRecords.kt`,
`MatchRuntime.kt` and the asset route in `MatchRoutes.kt`.

> **Phase 6 owns asset identity, authorization, visibility, and
> retrieval. Phase 7 owns final graphical composition and battlefield
> presentation.**

---

## The chain

```text
Forge object → visible identity → imported asset → match-scoped reference
             → viewer authorization → retrieval
```

### Forge object → visible identity

Decided by Forge and the worker (MATCH_STATE_VISIBILITY.md). A card a
viewer may not identify arrives with `known: false` and no name -- so
there is nothing to look up. Nothing in this chain re-decides
visibility.

### Visible identity → imported asset

At launch the server loads each seat's imported deck art (Phase 2's
import stores every image by content hash) keyed two ways:

1. **by printing** -- `printing:SET/NUMBER|name`, the exact printing
   Forge built the card from (`card.printing`, P6-BD);
2. **by name**, as a fallback.

The snapshot's printing is tried first, then the name. A printing match
is used **only for the card's front face** (below).

### Match-scoped reference

The server adds `art: <sha256>` to a card in a viewer's snapshot when
that card is `known` and an asset exists for it. **Sending it is the
grant:** each viewer's set of fetchable assets is built from exactly the
references its own snapshots carried (`MatchArt.shown[seat]`).

### Viewer authorization and retrieval

```text
GET /api/matches/{matchId}/assets/{sha256}
```

Served only if **all** hold:

- the asset id is 64 hex characters (anything else is 400, so no path
  traversal is possible);
- the match is **live** in this server (`LAUNCHING`/`RUNNING`);
- the caller is a participant of it;
- that participant's snapshots have referenced this asset.

Otherwise **404 "No such asset"** -- the same answer as an asset that
does not exist, so a refusal never confirms what is in an opponent's
deck.

Proven: 16 assets served end to end in one match (P6-X); a known card
with no reference has nothing to retrieve (P6-Y, mutation-tested);
another match's image and an unshown image are 404 (P6-Z, P6-AY); on
the live site a picture shown only to the host was served to it (200)
and refused to the guest (404) during the match (P6-BK).

## Hidden and face-down cards

A hidden card (another player's hand, a library) is never in the
snapshot, so it has no reference. A face-down permanent is sent to its
opponent as "Face-down" with no `art`: the opponent cannot ask for the
front of a face-down card because they were never told which card it is.
Its controller, who may identify it, gets the real picture.

## Multi-face cards

Picture follows the face **shown**. Packages carry **front images
only**, so:

- a card on its front face (Delver of Secrets; a split, adventure,
  aftermath or Room card, stored as "A // B" and named "A" by Forge)
  gets its picture;
- a transformed card (Insectile Aberration; a daybound card at night
  showing its back face) gets **no `art`** rather than the front's --
  showing the front's picture for the back face would be wrong.

## Tokens

Tokens are in nobody's deck package and get no `art` (§6.128). The board
shows a token as a named chip (P6-BG).

## Cache and access

`Cache-Control: private`: Cloudflare sits in front of the server and a
shared cache could serve one viewer's authorised image to somebody never
shown it. A browser may keep its own copy: an id is a content hash, so
those bytes cannot come to mean something else.

Access ends with the match. The authorization lives with the live match
in memory and goes when it stops; after the end, even its own players
get 404 for its assets.

## Relationship to Deck Depot permissions

Separate on purpose. Seeing an opponent's card during a match grants
**no** access to their deck: the Deck Depot's image route still requires
owning or being shared the deck, and this route serves only what this
match has shown you (§6.122, §6.129). Being shown four cards lets you
fetch four images, not the package.
