# 0021 — Deck rules for the Deck Builder

**Status:** Approved 2026-10-27 — built in 1.10.0
**Owner decisions:** R1 Arena publishes the deck rules and the Deck
Builder follows them, so the Deck Builder never tracks Forge itself; R2
only signed-in players may download them, the Deck Builder through a
linked computer; R3 the deck-size limit is Arena's (60-65 today), not
raised here; R4 the Deck Builder drops its own Forge tooling (owner,
2026-10-27); the Deck Builder follows Arena's copy limit (basic lands only),
refuses a deck under 60, and counts Contraptions and Attractions as Arena
does (owner, 2026-10-27, for the Deck Builder's own project). Approved
2026-10-27 after the linking was explained.

## What the player sees

- **Account page**, a new "Deck Builder" panel: **Link a computer** shows
  a one-time code, `K7QX-M4PD`, good for 10 minutes. Below it, the
  computers already linked: their name, when linked, when last used, and
  **Remove**.
- **In the Deck Builder** (its own project), the player types the code
  once. From then on its Proxic Arena export checks the deck against the
  rules this Arena plays by: which cards and printings it accepts, the
  deck size, the copy limit, the Contraption and Attraction decks.

Example: Arena moves to Forge 2.0.16, which adds the new Star Trek
cards. Pat, already linked, exports a deck with The Borg Queen the next
evening. The Deck Builder downloads the new rules first, so the card is
no longer flagged "won't play" and no Deck Builder update was needed.

## Scope

In: the deck rules document and its route; the worker message that lists
Forge's card pool; linking a computer (one-time code, device token,
the Account page panel, Remove).

Out (and why): uploading a deck from the Deck Builder (a later spec, on
top of the linked computer this one builds); raising the 65-card limit
(R3: a format change of its own); anonymous access (R2); any change to
import, which keeps its own checks and stays the authority.

## The deck rules document

`GET /api/deck-rules`, JSON, gzip, with an `ETag` and `304 Not Modified`
for a client that already holds it.

| Part | What it carries | Where it comes from |
| --- | --- | --- |
| `rulesVersion` | One string that changes whenever anything below can | Forge commit + a format revision constant |
| `arenaVersion`, `forgeRelease`, `forgeCommit` | What produced it | Build info |
| `format` | Open Format: 60-65 cards, 4 copies, the names exempt from the copy limit (the basic lands), no sideboard; Contraption deck at least 15, Attraction deck at least 10, one copy each | `OpenFormat`'s own constants and its basic-land list, so the document and import can never disagree |
| `cards` | Every card Forge can play: its name, each face's name, its side deck if any, and every printing (edition code, collector number) | The Forge worker, from the card pool it loaded |
| `editions` | Each edition's code, second code, alias, Scryfall code, type and date | The Forge worker |
| `setCodes` | Every set code Forge's lookup accepts, mapped to the edition it finds | The Forge worker, by asking Forge's own lookup, never a copy of its rule |

It is built once per Forge version: the server asks the worker
(`CARD_POOL`, a new message beside `RESOLVE_CARDS`) the first time it is
requested, keeps the result under `/data/deck-rules/`, and serves that
file until the Forge commit or the format revision changes. Measured
size and build time are recorded at the gate (EVID-005), not estimated.

## Linking a computer

| Step | Route | Rules |
| --- | --- | --- |
| Make a code | `POST /api/auth/device-codes` (signed in, CSRF) | 8 characters from an alphabet without look-alikes, 10 minutes, one use; only its SHA-256 is stored; a new code kills the last unused one |
| Trade it for a token | `POST /api/auth/device-link` with the code and a computer name | Public, so throttled like sign-in; any dead or wrong code gets the same answer; returns a 256-bit token once, stored only as its SHA-256 (as §3.21 does for sessions) |
| List and remove | `GET /api/auth/devices`, `DELETE /api/auth/devices/{id}` (signed in; CSRF to remove) | Your own computers only; a removed token stops working at once |

A device token is sent as `Authorization: Bearer` and is accepted on
`GET /api/deck-rules` and nothing else: it cannot play, join a room,
import, share or delete a deck, or change the account. Signing out
everywhere, an administrator's sign-out, a disabled account and a new
password all end it, as they end sessions.

## Rules and boundaries

- **ARCH-001**: Forge is reached only through the worker; the server
  stores and serves what the worker answered.
- **FMT-002, FMT-004**: the format numbers in the document are
  `OpenFormat`'s constants, and the names exempt from the copy limit are
  `OpenFormat`'s own basic-land list, the one import applies (never
  `canHaveAnyNumberOf`). Import still enforces the format itself; the
  document only lets the Deck Builder warn before upload.
- **AUTHENTICATION.md** is amended: a second kind of credential, the
  device token, read-only and limited to one route.
- **VEND-005**: nothing here changes the Forge pin. A Forge update simply
  produces a new document.
- **ISO-002**: nothing in this spec writes into the Deck Builder; its side
  is built in its own project.

## Acceptance tests

| ID | Test | Evidence |
| --- | --- | --- |
| F-0021-A | The document lists the printings Forge resolves: for a sample of 5,000 printings from Scryfall, "listed" equals the worker's `RESOLVED` | unit + real worker |
| F-0021-B | `setCodes` answers as Forge does: CON finds Conflux (CFX), UGIN finds nothing, M21 finds M21 | real worker |
| F-0021-C | The format part equals `OpenFormat`'s constants; changing one changes `rulesVersion` | unit |
| F-0021-D | A second request is served from the stored file without asking the worker; a new Forge commit rebuilds it | unit (spy on the worker) |
| F-0021-E | Without a session or a token: 401. With a token: 200, and the same token on any other route: 401 | route test |
| F-0021-F | A code works once, dies after 10 minutes, and a wrong code reads the same as a dead one; attempts are throttled | unit |
| F-0021-G | Remove, sign out everywhere, and a disabled account each end a token | unit |
| F-0021-H | The Account page links a computer and removes it, in a real browser | Playwright |

## Decisions for the owner

All four made 2026-10-27 (R1-R4, above).

## Amendments

- **2026-10-27, while building (no change to what the player sees).** The
  draft said "basic land" would be Forge's reading of each card. Import
  decides it by `OpenFormat`'s list of basic-land names (owner-confirmed
  2026-10-15), so the document carries that list instead: one rule, the
  one import applies. The account routes sit under `/api/auth/` beside the
  other account routes, not `/api/account/`. A new password also ends a
  linked computer, as it ends every session.
