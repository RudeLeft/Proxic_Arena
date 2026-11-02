# 0050 — One look for every notice

**Status:** Built 2026-11-02, not yet released
**Owner decisions:** item 6 of the owner's six items, option A, 2026-11-01
(canvas https://claude.ai/artifact/GXixi5Eb5b43KELUTGjn81). The details are
from the canvas https://claude.ai/artifact/P5eET6QgnywiZTCZPU1uP4 and the
four questions that followed, 2026-11-02:

- *Every page:* every notice is the same card, top right, under the top
  bar. Questions stay until answered or put aside; news fades after 8 s.
- *The game's own messages (Phase 9 W-22):* the same card in grey, top
  right of the table beside the opponent's column. Clicks go through it,
  and it turns see-through under the pointer.
- *A new version during a game:* waits until the game is over.
- *Sound:* a soft chime for questions only (an invitation, a request to
  join), with "(1)" in the browser tab's title. A Sounds switch on the
  Account page turns the chime off.
- *Words and rules:* as in the canvas table (below).

## Today (what this replaces)

About 20 notices in three looks: pop-ups in the Lobby, a one-line strip in
the top bar on other pages (explanation cut off, one at a time with "+N"),
and boxes inside pages. The Lobby's pop-ups replace each other rather than
queue: a second invitation hid the first. In a game the top bar is hidden;
the game's messages sit over the lower middle of the board, and the
connection banners over the opponent's hand. Close buttons say OK, Dismiss
or ×. Nothing makes a sound.

## The card

- Top right of every signed-in page, under the top bar; on the game
  screen, top right of the table, left of the right-hand column.
- A coloured left edge, a small label, a title (no full stop), one
  sentence saying what you can do next, and its buttons.
- Newest on top. Three show at most; the rest wait as "+N more" and move
  up as the top ones go. Nothing replaces anything.
- News drains a thin bar over 8 s and goes. Pointing at the stack pauses
  it. Questions and problems stay until answered or closed.
- A notice that stops being true goes on its own: an invitation the host
  withdraws, a request the asker cancels, a reconnect that succeeds.
- Notices never take the keyboard focus. Screen readers hear each once:
  problems at once (alert), everything else politely (status).
- With reduced motion, cards appear and go without sliding.

Colours: **gold** invitations and rooms; **red** problems; **blue** the
connection and new versions; **grey** the game's own messages. Green stays
for "saved" messages inside Account and Admin forms, which keep their
place in those forms.

## Every notice

| Notice | Title / line | Buttons | Goes away |
|---|---|---|---|
| Invitation | "{host} invited you to {room}" / "One seat is held for you. Close this and you can still accept from the room list in the Lobby." | Decline · Accept, × | Answered, closed (still answerable from the Lobby), or withdrawn |
| Request to join | "{name} would like to join your room" / "Their seat is held until you answer. You can also answer from the seat in your room." | Decline · Accept, × | Answered, closed, or cancelled |
| Your invitation declined | "{name} declined your invitation" / "Your room is still open. Invite someone else from Players." | × | 8 s |
| Invitation withdrawn or ended | "{host} withdrew the invitation" (and the room closed / seat taken / host left forms) / "The seat is no longer held for you." | × | 8 s |
| Your request declined or ended | "{host} declined your request to join" (and the other endings) / "You can ask again, or open your own room." | × | 8 s |
| Your room closed | "The host removed you from the room" (closed, left, an administrator closed it, expired) / "You can open your own room or ask to join another." | × | 8 s |
| Match abandoned | "The match was abandoned" / "Nobody won it, and the room is open again." | × | 8 s |
| Deck problem | "Your deck needs attention" / the server's reason, in full | × | The room changes, or × |
| Match didn't start | "The match did not start" / the reason, "The room is open again, so you can try once more." | × | × |
| Something refused | "That couldn't be done" / the server's reason | × | × |
| Reconnecting | "Reconnecting…" / "The connection dropped. This page catches up by itself as soon as it's back." | — | On its own |
| Signed out | "Your session ended" / "You were signed out, perhaps from another tab or device." | Sign in again | Never |
| New version | "Proxic Arena has been updated" / "Reload to get the new version. Nothing you're doing is lost." | Reload, × | Reload or ×; in a game, shown only once the game is over |
| The game's messages (W-22) | Forge's own words (a coin flip, a choice, a card revealed) | — | 7 s |
| Game reconnecting (W-23) | "Reconnecting to the game…" / "The game is still running, and nothing is answered for you while you're away." | — | On its own |
| Game connection lost (W-23) | "You're no longer connected to the game" / "The game is still running and nothing has been answered for you." | Reload | Never |

Not notices, and unchanged: "Remove {name} from the room?" and "You need a
room before you can invite anyone" stay pop-ups (answers to your own
click); answers the game refused stay inside their question window;
messages inside forms (Account, Admin, sign in, join, reset) stay in their
forms; the belt reminder stays a line in the Lobby.

## Sound

An invitation or a request to join plays a short two-note chime and puts
"(1)" (the number of questions waiting) at the front of the tab's title.
News, problems and game messages are silent. Account gets a **Sounds**
switch, on by default, kept in this browser.

## Found while building

- News arriving in the same moment (four declines at once) showed only
  the last: the lobby kept one slot for news. It is now a queue in the
  lobby state, taken off as each card is shown.
- With the notices gone from the header, Connected, Report and Sign out
  slid left beside the page links; the Connected pill now pushes them
  right.

## Boundaries

- Page only: no server or protocol change.
- The in-room lines ("Waiting on Pat's answer", Accept on the seat) stay.
- The game screen keeps Phase 7 Amendment 12: the game's messages never
  block a click on the table.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0050-A | An invitation arrives as the same card on the Lobby and the Deck Depot; Accept seats you from both; × puts it aside and the Lobby still offers Accept | browser |
| F-0050-B | News arriving together is all kept: queued, never replaced (a player holds one invitation at a time, by the server's rule, so two invitations cannot meet) | unit + browser |
| F-0050-C | News fades after 8 s; pointing at the stack pauses it; questions and problems stay | unit + browser |
| F-0050-D | More than three: three show and "+N more"; closing one brings the next up | unit |
| F-0050-E | A withdrawn invitation's card goes on its own | browser |
| F-0050-F | In a game, a game message sits top right of the table, and a click on the card beneath it reaches the card | browser |
| F-0050-G | In a game, Reconnecting shows as the blue card and goes when the connection is back | browser |
| F-0050-H | A new version in a game waits for the game to end | unit |
| F-0050-I | The chime plays for questions only, not when Sounds is off; the tab title counts waiting questions | unit |
| F-0050-J | Screenshots at 1920×1080: Lobby, Deck Depot, Hall, a game | browser |
