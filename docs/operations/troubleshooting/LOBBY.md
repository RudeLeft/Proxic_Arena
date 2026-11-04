# Lobby troubleshooting

**Required by PHASE_05 §5.227.** What each symptom actually means,
and what to do about it.

Most entries end with "this is the rule working". That is not a
dismissal — it is the most useful thing to know first, because the
alternative is looking for a bug that is not there.

---

## "Open a room" is refused

> **ALREADY_IN_A_ROOM** — Leave your current room first.

§5.5: one room at a time. You are still in one, probably in another
tab, or you closed the tab without leaving — **closing a tab does not
leave a room** (§5.61), and it should not: a dropped connection would
otherwise throw you out of a lobby every time the wifi hiccuped.

Reload `/play`. The page asks `GET /api/rooms/current` on load and
will put you back in the room you are actually in (§5.119). Leave it
from there.

If the room is one you no longer want and cannot see, it closes on its
own: 30 minutes with nothing happening while you are alone in it, 2 hours
with two players (spec 0054; server settings).

---

## There is nowhere to type a code

Correct. PHASE 5 AMENDMENT 1 removed join codes entirely, and
AMENDMENT 2 replaced them with presence and invitations.

The host clicks **Invite** beside your name in **Players** and you get
a prompt. Or
find the room in the room list and click **Ask to join** (spec 0016):
it shows on a room with an open seat while you are in no room, and the
host accepts or declines. There is no code and no link, by design
(§5.13).

If the host cannot see your name, see the next entry.

---

## Somebody is signed in but shows as offline in "Players"

**Players** lists every account; offline ones are folded away under
"Offline · N". Online is **connection state** (§5.120), not account
state: a player is online while they have an open `/ws/user` socket.

Check, in order:

1. Are they signed in in a page of the app? The socket is opened by
   every signed-in page, not only the lobby, and closed at sign-out.
2. Does their page show **Reconnecting…** ("The connection dropped.
   This page catches up by itself as soon as it's back.")? Then their
   socket dropped; it reconnects on its own.
3. Did they sign in since you loaded the page? They should appear
   automatically; if not, your own socket has quietly died — reload.

A user in two tabs appears **once** (§5.6). That is deliberate.

---

## The Invite button is greyed out, or not there

**Invite** shows beside every online player who is not in your room.
With no room yet, clicking it offers **Open a room**, and the
invitation is for that one. Otherwise it is greyed, with the reason
beside it:

- "Only the host of a room invites" (§5.17),
- "Your room has no free seat" — or it is starting a match (§5.22),
- "One invitation at a time" — withdraw the one you sent first,
- "<name> is already in a room".

An offline player has no Invite button: invitations go to online
players only.

---

## An invitation never arrived

Invitations go to **online users only** (owner D2) and have no timer.
They end, and both sides are told why, when:

- it is accepted, declined or withdrawn,
- the seat fills or the room closes,
- either of the two has been offline 60 seconds (a reload does not
  end it).

A user holds at most one invitation at a time.

If the invitee was already in a room, the prompt is **suppressed on
purpose**: §5.5 means they would have to leave to accept, and a
dialog you cannot say yes to is one that should not appear. Ask them
to leave their room first.

---

## Accepting an invitation fails

> **INVITATION_GONE** — That invitation is no longer open.

There is no open invitation from that room to you. The likely causes:

- the invitation ended (it was withdrawn, or one of you was offline
  60 seconds),
- the host closed the room or left it,
- the invitation was already used — it admits you **once**.

If the invitation was still open but the room refused the seat, you get
the room's own answer instead (`ROOM_FULL`, `ROOM_NOT_OPEN`,
`ALREADY_IN_A_ROOM`…), and the invitation is put back for you if it
can be.

Ask for another one. A room id alone admits nobody: every room is
listed, so the id is public, and the invitation is the key
(AMENDMENT 1).

---

## "That room is full"

> **ROOM_FULL**

Open Format is two players (FMT-001) and the server never silently
creates a seat (§5.22). If a seat looks free on your screen, your
view is stale — reload.

---

## The page says Reconnecting…

Your socket closed. The room is **still on the server**, and the page
says so rather than looking live while nothing is reaching it
(§5.133). It reconnects on its own and catches up; a reload does the
same. Your membership, seat and deck selection are all persisted
(§5.118); only presence was lost.

If it keeps happening: check that the reverse proxy allows WebSocket
upgrades on `/ws/user`, and look for `authenticated ws close` in the
server log.

---

## The room is not updating

Symptoms: somebody joined and your seat list did not change.

1. **Check for Reconnecting….** No socket, no updates.
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
Start match.

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

## There is no "Start match" button

The host's **Start match** needs **every** seat filled, decked and
ready (§5.92); until then the box says what it waits for ("Waiting for
a second player", "Waiting for you to be ready", "Waiting for <name> to
be ready"). Your seat shows "No deck chosen yet" or "Not ready".

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
| `INVALID_FOR_PRESET` | Open Format: 60–100 cards, max 4 copies, no sideboard |
| `FORGE_RESOLUTION_ERROR` | Forge could not build the deck |

---

## Forge preflight failure

> **FORGE_RESOLUTION_ERROR** — Not supported yet: X.
>
> or: The deck could not be checked right now. Try again in a moment.

Preparation asks Forge to build each deck (§5.96). It does **not**
start a game; it proves the cards still resolve.

Causes, most likely first:

1. **The Forge worker is not configured or not running.** Check
   readiness from inside the container (`docker compose exec arena-server
   wget -qO- http://127.0.0.1:8080/api/health/ready`) — `forgeWorker`
   should be `ok`. If it says
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

## "That room closed" while nobody was playing

Spec 0054: a room in the lobby closes after 30 minutes with nothing
happening while the host is alone, 2 hours with two players, or when the
host has been offline 10 minutes; a guest offline 10 minutes is taken
out. The room says so 5 minutes before an idle close, with **Keep it
open**. Activity is joining, leaving, configuring, selecting a deck,
readying, a host action (§5.124), sending an invitation, or a lobby chat
line from one of the room's members.

**Holding a socket open is not activity.** A room with a game in it is
never closed this way. The limits are server settings
(`PROXIC_ROOM_ALONE_MINUTES`, `PROXIC_ROOM_TOGETHER_MINUTES`,
`PROXIC_AWAY_MINUTES`, `PROXIC_ROOM_WARNING_MINUTES`; see the Unraid
install guide). Host a new one; nothing is lost but the room.

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
- `docs/operations/troubleshooting/DECK_DEPOT.md` — sharing and import problems
- `docs/operations/troubleshooting/AUTHENTICATION.md` — sessions and sign-in
