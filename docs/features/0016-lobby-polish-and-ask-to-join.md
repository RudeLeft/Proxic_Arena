# 0016 — Lobby polish, a clearer room list, and Ask to join

**Status:** Approved 2026-10-26 — built; look approved ("finish it and push when green")
**Owner decisions:** the owner's sixteen-point list (2026-10-26), with:
R1 every room stays visible to everyone, as a card with useful seats;
R2 a seat held by an invitation says "Held for Pat" to everyone;
R3 a player may **Ask to join** a room with an open seat; R4 rooms are
ordered most useful first; H1 the Hall of Champions is one strip across
the top of the lobby; N1 an invitation reaching you on another page has
Accept and Decline right in the top bar (owner, 2026-10-26)

## What the player sees

**Your room**

1. Under *1 · Your deck*, no line under the dropdown (the dropdown
   already says "60 cards"). With no decks the Deck Depot link stays:
   it is the only way forward.
2. Under *2 · Ready*, no line under the button.
3. Under *3 · Start*, no line under the button.
4. The Start button says what it is waiting for, in its own words:
   "Waiting for a second player", "Waiting for Pat to be ready",
   "Waiting for you to be ready"; lit, "Start match". The joiner's
   not-a-button box says the same, and "Waiting for the host" once
   both are ready.
5. When the host presses Start, both players' boxes read "Checking
   both decks…", so the joiner knows the game is starting.
6. The game's chat has no close button: the tab on its edge opens and
   closes it.
7. Your own seat has no "· you, host" ("· you"): you know who you are.
   The other player's "· host" stays.
8. No "Your room" ("Your seat") label at the top right of your room.
10. The pictures on the seats are the size of the Reigning Champion's.

**Notices in the top bar (N1)**

9. The lobby's notices (reconnecting, a refusal, a deck that needs
   attention…) sit in the top bar, between the page links and the
   Connected pill, on every page, so dismissing one moves nothing on
   the page. On any page but the Lobby, an invitation shows there too
   ("RudeLeft has invited you to join RudeLeft's room", Accept,
   Decline), as do a request to join your room and an invitation that
   ended. In the Lobby the pop-ups stay as they are.

**The Hall of Champions (H1)**

11. One strip across the top of the lobby, above Players, rooms and
    chat: four equal places — 1st, 2nd, 3rd and Dead last — each with
    the big trophy.
12. Each place says the same thing the same way: "Won 6 of 9 games".
13. No "Hall of Champions" title and no "All-time wins": the box is as
    tight as the trophies allow, never clipping them.

**Invitations**

14. A room you are invited to reads "RudeLeft has invited you to join
    RudeLeft's room", with Accept and Decline. "Join by invitation" is
    gone from the room list's corner.
16. When the person you invited declines, you get a pop-up saying so.

**The room list (R1–R4)**

15. Every room is a card everyone can read: its name, then each seat —
    the player's picture and name, ✓ when ready — or "Open seat", or
    the invited player's picture with "Held for Pat" (R2), or "Pat
    asked to join". A coloured status line says where it stands: "1
    seat open", "Waiting on Pat's answer", "Waiting on RudeLeft's
    answer", "Choosing decks", "Ready to start", "Starting…", "In a
    game", and "Closes in 45m" near the end. After Pat declines, the
    room reads "1 seat open" again, for Pat as for everybody.
    - **Ask to join (R3).** A room with an open seat and nobody held
      shows *Ask to join* to a player who is not in a room. The host
      gets "Pat would like to join your room" with Accept and Decline
      (a pop-up in the Lobby, the top bar elsewhere). Accept seats Pat;
      Decline tells Pat with a pop-up. Pat can take the request back
      (Cancel) until it is answered.
    - **Order (R4):** a room you are invited to (or asked to join),
      then rooms with an open seat, then full rooms getting ready,
      then rooms in a game.

## Scope

In: the sixteen points above; the server's room list carries who a seat
is held for; asking to join (a new message both ways).
Out: watching a game; more than one request or invitation per room at
a time (one at a time, both ways, as Amendment 11 set for invitations).

## Rules and boundaries

- A request is the same server record as an invitation, the other way
  round: one per room, one per player, and it ends — with the reason
  told to both sides — when it is answered, taken back, the room fills
  or closes, or either of them has been gone a minute. Accepting it
  goes through the same seat check as accepting an invitation, and only
  the host can accept one: a room id is public, the record is the key.
- Who a seat is held for becomes public (R2). Decks stay private: the
  list still never says which deck anybody chose.
- No "Forge" in any of the new words.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0016-A | The room list carries the held seat (invitation and request), and changes when either starts or ends | server test |
| F-0016-B | Ask to join: only into an open room with nobody held, only by a player in no room, one at a time; the host accepts (seated) or declines (asker told); the asker can cancel; a stranger cannot accept it | server test |
| F-0016-C | The lobby's texts (1–8, 14), the Start button's words, "Checking both decks…" for both | unit + browser |
| F-0016-D | Notices in the top bar; an invitation answered from the Deck Depot | browser |
| F-0016-E | The Hall strip: four equal trophies, "Won 6 of 9 games", no title | unit + screenshot |
| F-0016-F | Room cards and their order, Held for, Ask to join, decline pop-ups both ways | browser + screenshots |
| F-0016-O | The owner approves the look ("finish it and push when green", 2026-10-26) | owner |
