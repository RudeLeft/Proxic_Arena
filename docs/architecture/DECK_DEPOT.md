# Deck Depot

PHASE_04 §4.168. What a deck belongs to, who can see it, and what
happens when somebody shares one.

The exact authorization rules are `DECK_AUTHORIZATION.md`. When
something will not work, `docs/operations/troubleshooting/DECK_DEPOT.md`. The
package format itself is unchanged from Phase 2 —
`DECK_PACKAGE_FORMAT.md`.

---

## Ownership

Every deck has exactly one owner: the account that uploaded it.

```text
imported_deck.owner_user_id -> app_user.user_id   NOT NULL
```

- The owner is taken from the **session**, never from the request
  (§4.6, §4.52). A client that could name the owner could give a deck
  away, or take one. `import()` requires the owner as a parameter, so
  an ownerless import cannot be written by accident (§4.53).
- Ownership is **not transferable** in Phase 4 (§4.17). There is no
  "give deck away" and no admin override.
- `ON DELETE RESTRICT` on the user: §4.92 leaves user deletion
  unimplemented, and a future `DELETE` that quietly took somebody's
  decks with it would be a worse discovery than a foreign key
  complaining.

### ADMIN is not a master key

An administrator has no privileged access to another user's deck
(§4.49, §4.50) — not detail, artwork, shares, deletion or sharing.
Nothing in the authorization path consults the role at all, and a
test tries each of those as an admin, because "it does not do that"
is only worth believing once somebody has tried.

Account administration still lives in `arena-admin`, behind host
access.

---

## Private by default

A deck is visible to its owner and to nobody else until the owner
shares it (§4.3).

`GET /api/decks` returns **two named lists**:

```json
{ "mine": [...], "sharedWithMe": [...] }
```

Two lists rather than one array with a flag, because §4.60 asks that
nobody assume they may manage a deck merely shared with them, and a
shape that cannot express "mixed" enforces that better than a field
the page has to remember to read.

There is no global listing (§4.62). The endpoint that used to return
every deck in the database now returns only what you may open — a
behaviour change to a live endpoint, not a new feature.

---

## Sharing

A share is a row, not a copy (§4.19):

```text
deck_share: deck_id, shared_with_user_id, created_by_user_id, created_at
            UNIQUE (deck_id, shared_with_user_id)
```

The deck, its entries and its artwork stay exactly where they were.
Sharing with three people duplicates nothing.

### What a recipient may and may not do

| | Owner | Shared | No access |
| --- | --- | --- | --- |
| see it in their library | yes | yes, under *Shared with me* | no |
| open it, with artwork | yes | yes | no |
| use it in a match (§4.47) | yes | yes | no |
| share, revoke, delete | yes | **no** (§4.23, §4.24, §4.80) | no |
| see who else holds it | yes | **no** (§4.99) | no |

The recipient's UI hides the controls it would be refused; the
server refuses them regardless. Hiding is the courtesy, the refusal
is the protection.

### The rules that bite

- **Not yourself** (§4.27) — `CANNOT_SHARE_WITH_OWNER`. The deck is
  already yours, and a self-share would make the access answer
  ambiguous.
- **Not a disabled account** (§4.28) — `SHARE_USER_DISABLED`. An
  existing share *survives* the account being disabled and works
  again if it is re-enabled: that is the account's state talking,
  not the share's.
- **Twice is fine** (§4.33) — idempotent, answered `200` rather than
  `201`. The insert uses `ON CONFLICT DO NOTHING` and reads the row
  back, so two requests racing end with one share and an answer that
  describes what *is* (§4.104).
- **By username, exactly** (§4.29) — normalized the way accounts are,
  so `pAt` finds `Pat`. There is no listing endpoint and no prefix
  search: §4.30 forbids building a user directory to implement
  sharing.

### Revocation

```text
DELETE /api/decks/{deckId}/shares/{userId}
```

Immediate and server-side (§4.35). It ends deck detail, the library
listing **and artwork** together — a test asserts all three, because
stopping two of three would look like success.

Idempotent: revoking a share that is not there is a success, since
the end state is the one asked for.

**What it cannot do** (§4.36): erase what a browser already
downloaded. Artwork is served `Cache-Control: private`, so no shared
cache keeps it, but the viewer's own browser may hold its copy until
that expires. Revocation governs the server, not pixels already
delivered — and nothing prevents a screenshot.

---

## Workflows

### Upload

```text
sign in -> /decks -> choose a .zip exported by Proxic Deck Builder
         -> Phase 2 pipeline (inspect, parse, legality, Forge, art)
         -> deck row written with owner_user_id in the same transaction
```

Authentication and CSRF are required (§4.51), the Phase 2 pipeline is
unchanged (§4.55), and a failed import creates no ownership and no
rows (§4.75, §2.18).

**The same package may be imported by different owners** (PHASE 4
AMENDMENT 4). Each account may import a given package once; a
re-import by the same owner is refused and names the existing deck,
because that deck is theirs to be told about. Storage cost of a
second owner's copy, measured: zero image bytes — artwork is
content-addressed.

### Names, and renaming (PHASE_07 §7.65)

**A player's deck names are unique to that player** (owner decision
18). The comparison ignores capitals and surrounding spaces, so
"Burn" and " burn" are the same name; two players may each have a
"Burn". An upload whose name you already use is refused with `409
DECK_NAME_TAKEN`; the page asks for another name and sends it as the
optional multipart field `name`. Names you type are 1 to 80
characters on one line (`422 INVALID_DECK_NAME`).

```text
PATCH /api/decks/{deckId}    {"displayName": "New name"}
```

**Rename** is the owner's (owner decision 17): a recipient gets `403`,
a stranger `404`, a clash `409`. It is allowed while the deck is
selected in a room, because rooms, setups and matches all hold the
deck's id; the room is re-sent at the same revision so its members see
the new name without a Start match in flight being turned away.

Not a database constraint: duplicates imported before the rule are
left as they are, and a unique index cannot be built over them. The
check runs in the writing transaction under a per-owner advisory lock,
so two uploads racing for one name cannot both win.

### Deck icons (spec 0012)

```text
PUT /api/decks/{deckId}/icon    {"icon": "goblin"}    (or null)
```

Every deck shows one of the owner's 100 round icons
(`frontend/src/assets/deck-icons/`, named in `DeckIcons.NAMES`). The
library's entries carry `colors` (the deck's colour identity in WUBRG
order, as Forge reports each card at import; `""` colourless; absent
until Forge has been asked, which the background fill does once for
older decks) and `icon` (the owner's choice, or absent). With no
choice the page shows the suggestion from the colours
(`deckIcons.tsx`). Setting it is the owner's: a recipient gets `403`, a
stranger `404`, a name outside the set `422 INVALID_ICON`. A new
import opens with the picker; "Change icon" opens it later. The icon
shows only where the deck's name does (the list, the deck's header,
your own deck dropdown in a room), never to the other player.

### Share, revoke, delete

Open a deck you own and the Share panel appears: a username field,
and the current recipients with a revoke control beside each. A
recipient opening the same deck sees no panel.

Deleting a deck removes its entries and its shares (§4.78, §4.91),
and leaves artwork that other decks still reference (§2.135). Only
the owner may delete; a recipient is refused with `403` and a
stranger with `404`.

---

## Legacy Phase 2 decks

Two decks existed before ownership did — one on the development
stack, one on the production host, both imported by the owner.

`V004` assigns them **explicitly, by username**, under owner decision
D1 (2026-10-16). §4.14 forbids assigning decks to "the first admin"
or "the first user"; naming the account the owner identified is a
different thing. Where that account does not exist, the migration
raises with what is wrong and what to do rather than failing through
a constraint.

Nothing was deleted, and nothing was guessed.

---

## Storage

Ownership and sharing are **database** concepts. No file moved, and
none will (PHASE 4 AMENDMENT 1).

```text
/data/art/original/<aa>/<sha256>.png
/data/art/display/<aa>/<sha256>.png
```

The asset id **is** the SHA-256 of the image, so one file is shared
by every deck that uses that printing, whoever owns them. This is
also why §4.68's artwork check is "is this asset part of a deck you
may see" rather than "is this asset yours" — the question of whose
an image is has no meaning in a content-addressed store.

Roughly 1.5 MB per distinct printing, counted once no matter how
many decks or owners reference it.
