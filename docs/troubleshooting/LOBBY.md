# Lobby troubleshooting

**Required by PHASE_05 §5.227.** What each symptom actually means,
and what to do about it.

Most entries end with "this is the rule working". That is not a
dismissal — it is the most useful thing to know first, because the
alternative is looking for a bug that is not there.

---

## "Host a game" is refused

> **ALREADY_IN_A_ROOM** — Leave your current room first.

§5.5: one room at a time. You are still in one, probably in another
tab, or you closed the tab without leaving — **closing a tab does not
leave a room** (§5.61), and it should not: a dropped connection would
otherwise throw you out of a lobby every time the wifi hiccuped.

Reload `/play`. The page asks `GET /api/rooms/current` on load and
will put you back in the room you are actually in (§5.119). Leave it
from there.

If the room is one you no longer want and cannot see, it expires on
its own after 24 hours (owner D4).

---

## There is no "join" button, and nowhere to type a code

Correct. PHASE 5 AMENDMENT 1 removed join codes entirely, and
AMENDMENT 2 replaced them with presence and invitations.

The host clicks your name in **Who is here** and you get a prompt.
There is no public games list and no code, by design (§5.13 survived
the amendments unchanged).

If the host cannot see your name, see the next entry.

---

## Somebody is signed in but not in "Who is here"

Presence is **connection state** (§5.120), not account state. The
list shows people with an open `/ws/user` socket right now.

Check, in order:

1. Are they on `/play`? The socket is opened by the lobby page.
2. Does their page show the **Disconnected** banner? Then their
   socket dropped and they should reload.
3. Did they sign in since you loaded the page? They should appear
   automatically; if not, your own socket has quietly died — reload.

A user in two tabs appears **once** (§5.6). That is deliberate.

---

## The Invite button is not there

It appears only when all of these hold:

- you are the **host** of a room (§5.17),
- the room is still `OPEN` — not prepared, not closed,
- there is a free seat (§5.22),
- the person is not you.

Host a game first; the button appears next to every other name.

---

## An invitation never arrived

Invitations go to **online users only** (owner D2) and live five
minutes. They are forgotten when:

- the room fills, closes or expires,
- either party disconnects,
- a newer invitation replaces it — a user holds at most one.

If the invitee was already in a room, the prompt is **suppressed on
purpose**: §5.5 means they would have to leave to accept, and a
dialog you cannot say yes to is one that should not appear. Ask them
to leave their room first.

---

## Accepting an invitation fails

> **ROOM_NOT_FOUND** — No such room.

Deliberately the same answer as a room that does not exist. The
likely causes:

- the invitation expired (five minutes),
- the host closed the room or left it,
- somebody else took the last seat,
- the invitation was already used — it admits you **once**.

Ask for another one. This refusal is also what you get for guessing a
room id, which is the point: a room id is not a key (AMENDMENT 1).

---

## "That room is full"

> **ROOM_FULL**

Open Format is two players (FMT-001) and the server never silently
creates a seat (§5.22). If a seat looks free on your screen, your
view is stale — reload.

---

## The page says Disconnected

Your socket closed. The room is **still on the server** — the banner
says exactly that, because a lobby that looks live while nothing is
reaching it is worse than one that admits it (§5.133).

Reload the page. Your membership, seat and deck selection are all
persisted (§5.118); only presence was lost.

If it keeps happening: check that the reverse proxy allows WebSocket
upgrades on `/ws/user`, and look for `authenticated ws close` in the
server log.

---

## The room is not updating

Symptoms: somebody joined and your seat list did not change.

1. **Check for the Disconnected banner.** No socket, no updates.
2. **Reload.** The page re-fetches the room and reconnects.
3. If a reload fixes it every time, look in the server log for
   `authenticated ws close` right after `authenticated ws open` —
   that pattern is a proxy closing idle upgrades.

The page never computes a room locally (§5.132), so a stale view is
always a delivery problem, never a divergence.

---

## A deck is missing from "My decks"

The list is **decks you own plus decks shared with you** (§5.41).

- Imported it just now? Reload — the library is fetched on page load.
- Expecting a shared one? Ask the owner to confirm the share is still
  there; a revoked share disappears immediately (§5.51).
- Shared decks say **"shared by <name>"**. If yours does not, it is
  one of your own.

No decks at all: import one from Deck Builder on `/decks`.

---

## My deck vanished from my seat, and my ready tick with it

Somebody changed deck access underneath the room (§5.50, §5.51):

| What happened | Why your seat cleared |
| --- | --- |
| the owner revoked the share | you may no longer use it |
| the owner deleted the deck | it does not exist any more |
| you changed your own deck | §5.59 — readiness follows the deck |

This is the rule working, and it is better than the alternative: a
match that cannot start, discovered at the moment the host presses
Prepare.

Choose another deck.

---

## "You cannot use that deck"

> **DECK_NOT_USABLE** — 422

`canUseDeck` said no (§5.42). It is the same answer for a deck that
does not exist, deliberately, so nobody can probe which deck ids are
real (§5.43).

You get this when the deck is not yours and was not shared with you,
when the share has been revoked, or when the id is simply wrong.

---

## A player cannot mark themselves ready

The Ready button stays unusable until a deck is chosen (§5.41), and
the server refuses anyway:

> **DECK_REQUIRED** — Choose a deck before readying up.

There is also a database CHECK behind it, so "ready with no deck" is
not merely unlikely but unrepresentable.

You can only ready **yourself** (§5.57). There is no control for
readying somebody else and no endpoint that would accept one.

---

## Everybody readied, then a tick cleared itself

Readiness is reset by anything that changes what people agreed to:

- the player count changing (§5.60),
- your deck changing (§5.59),
- losing access to your deck (§5.51),
- your deck failing the preflight (§5.98),
- the host cancelling a preparation (§5.117),
- **a server restart** (§5.198).

The last one surprises people. "Ready" is a claim about somebody who
is watching, and after a restart nobody is — every socket died with
the old process.

---

## "Prepare match" is greyed out

It needs **every** seat filled, decked and ready (§5.92). The seat
list shows which is missing: `no deck yet` or `not ready`.

An empty seat counts: a one-player Open Format match is not a match.

---

## Preparation was refused

> **SETUP_NOT_READY** — Not everyone is ready yet.

The host sees **which** seats need attention. Each affected player
sees **why**, on their own screen, under "Your deck needs attention".

That split is deliberate (§5.101): the reason is about a deck that
was shared with that player, not with the table. If you are the host
and need to know, ask them — the server will not tell you.

Per-player reasons:

| Code | Meaning |
| --- | --- |
| `DECK_REQUIRED` | they have not chosen |
| `NOT_READY` | they have not ticked |
| `NOT_CONNECTED` | their socket is gone — they should reload |
| `ACCESS_REVOKED` | their deck is no longer theirs to use |
| `INVALID_FOR_PRESET` | Open Format: 60–65 cards, max 4 copies, no sideboard |
| `FORGE_RESOLUTION_ERROR` | Forge could not build the deck |

---

## Forge preflight failure

> **FORGE_RESOLUTION_ERROR** — Forge does not recognise X.

Preparation asks Forge to build each deck (§5.96). It does **not**
start a game; it proves the cards still resolve.

Causes, most likely first:

1. **The Forge worker is not configured or not running.** Check
   `GET /api/health/ready` — `forgeWorker` should be `ok`. If it says
   `unconfigured`, `missing` or `unreachable`, the preflight
   deliberately **fails closed**: a server that cannot check decks
   must not launch matches with unchecked ones.
2. **A card no longer resolves** after a Forge pin change. The
   message names up to three.
3. The worker ran out of memory. One JVM per deck, ~611 MB each
   (Phase 0A).

Server log: `forge worker probe:` at startup.

---

## "The room changed while you were deciding"

> **ROOM_REVISION_STALE** — 409

Two people acted at once and your click was based on a view that had
already moved (§5.135–§5.137). Nothing was overwritten, which is the
whole point.

The page refreshes itself; act again.

If it happens constantly with nobody else in the room, something is
sending `expectedRoomRevision` from a cached snapshot — look for a
page that is not applying `ROOM` messages.

---

## "That room expired after a day of inactivity"

Owner decision D4: 24 hours of **inactivity**, where activity is
joining, leaving, configuring, selecting a deck, readying or a host
action (§5.124).

**Holding a socket open is not activity.** Two people idling in a
room overnight have an abandoned room with tabs open, and it expires.

The sweep runs hourly, so a room can outlive its 24 hours by up to an
hour. Host a new one; nothing is lost but the room.

---

## A prepared match disappeared after a restart

Expected (§5.122, §5.213). An unconsumed setup is **invalidated** on
startup and the room returns to `OPEN`, never "probably still fine".

It froze a room whose players had all gone. Ready up and prepare
again.

The room, its members, their seats and their deck selections all
survive (§5.119, §5.120). Only readiness and the setup are reset.

---

## A deck cannot be deleted

Fixed in `V009` and `V008`. If you meet it on an older build:

- **"violates foreign key constraint `match_setup_player_deck_id_fkey`"**
  — an invalidated setup was holding the deck. `V008` releases those.
- **"violates check constraint `room_member_ready_needs_deck`"** — a
  player was ready with it, and nulling the selection produced a row
  the CHECK rejected. `V009` adds a trigger that clears readiness
  first.

Both are database-level. Upgrading the server runs them.

---

## See also

- `docs/architecture/LOBBY_ARCHITECTURE.md` — the model
- `docs/architecture/LOBBY_PROTOCOL.md` — routes, events, error codes
- `docs/architecture/MATCH_SETUP_CONTRACT.md` — the Phase 6 handoff
- `docs/troubleshooting/DECK_DEPOT.md` — sharing and import problems
- `docs/troubleshooting/AUTHENTICATION.md` — sessions and sign-in
