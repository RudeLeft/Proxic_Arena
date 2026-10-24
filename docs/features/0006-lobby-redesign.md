# 0006 — Lobby redesign

**Status:** Draft
**Owner decisions:** D1 card count only; D2 avatar pictures, chosen in Account (owner supplies the set); D3 "Closes in" in the last 3 hours; D4 phone chat always open (2026-10-24)

The visual example the owner reviewed (2026-10-24): the "Proxic Lobby
Redesign" canvas, two artboards -- desktop (1440 x 900) and phone
(390 wide) -- at the same moment: you host "Friday night", you have
picked a deck and are ready, Pat is still choosing. Owner change on
review: no "Chat isn't saved" line under the chat box.

## What the player sees

**Layout.** Three columns on a wide screen: **Players** on the left,
**your room** as the main area with the other rooms under it, **Chat** on
the right. The page fills the window's height -- no strip across the top
over empty space. Narrower than about 1100 px, chat moves under the room;
on a phone everything stacks: your room first, then players, then chat.

**Players.** Online players first, each with their avatar (D2), where
they are ("In your room", "In the lobby", "In Cole's room") and Invite
where you can invite them. Offline accounts fold into **"Offline · 12"**,
closed by default; clicking opens the list. The count reads "2 online".

**Your room.**
- The name, one **status** in plain words, and "Your room" or "Your seat":

  | When | Status |
  |---|---|
  | One seat filled | Waiting for a player |
  | Both seats, not both ready | Choosing decks |
  | Both ready | Ready to start |
  | Starting | Starting… |
  | A game running | In a game |

  It replaces today's "Open seat" (shown twice), "1/2", "Setting up" and
  "Clears in 24h". The room's expiry shows only near the end: "Closes in
  2h" (D3).
- **Two seats**, each with the player's avatar (D2), name ("· you, host"),
  their deck -- yours only; the other player's stays hidden, as today --
  and **✓ Ready** or "Not ready". An empty seat is dashed: "Open seat --
  invite someone from Players".
- **Three numbered steps**: **1 Your deck** (the deck menu, with its card
  count, "60 cards", D1), **2 Ready** ("Mark yourself ready" / "You're
  ready · undo"), **3 Start** (the host's Start match, saying what it waits
  for: "Waiting for Pat to be ready"; the guest sees "The host starts the
  game"). A finished step turns green with a ✓.
- The host's **Remove Pat** and **Close room**, and the guest's **Leave
  seat**, sit together at the bottom right of the room, quieter than the
  steps.

**No room yet.** The main area offers "Open a room" (with the optional
name), above the other rooms.

**Other rooms.** One line each: name, who is in it and its status
("Cole · waiting for a player"), "Closes in 2h" near its end; "Join by
invitation" in the heading. An invitation to a room shows Accept on its
line, as today.

**Chat.** Its own column, newest at the bottom, the box at the bottom,
nothing written under it. Empty: "Nothing yet." On a phone, chat is
always open, under the players (D4).

**Avatars (D2).** Each player has an avatar picture, shown beside their
name in Players, on their seat, and in chat. They choose it on the
**Account** page from a set the owner supplies; until they choose, a
default picture. Stored with the account; the pictures are served by the
app itself. The owner's own images, free to use (owner, 2026-10-24) --
not card art, so they ship with the app (GIT-001 does not apply); resized
to one square size.

**Header on a phone.** One row: the logo, a dot for connected (with the
page's name), and a menu button holding Deck Depot, Lobby, Account, Admin
and Sign out.

## Scope

In: the Lobby page's layout and wording; the header on phones; a room's
status words; the steps; the deck's card count (D1); avatars -- the
set, the choice on Account, saving it with the account, showing it (D2).

Out: what the lobby does (rooms, invitations, readiness, starting a
match: all unchanged, same server rules and messages); the game screen;
the Deck Depot, Account and Admin pages beyond the shared header.

## Rules and boundaries

- No behaviour change on the server: the same room, invitation and match
  rules; the status words are read from the room the server sends.
- Hidden information: the other player's deck stays hidden (§5.47) --
  the redesign shows only your own.
- Accessible: real buttons, links and labelled inputs; 44 px touch
  targets; text contrast 4.5:1; the folded Offline list is a button with
  `aria-expanded`.
- AGENTS rules for a look change: a demo on the real app and the owner's
  yes before it ships.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0006-A | At 1366 x 768, 1920 x 1080 and 390 wide: no horizontal scroll, nothing overflows a card, the room is fully visible without scrolling on desktop | browser test, screenshots |
| F-0006-B | Online players are listed first; offline ones fold under "Offline · N", closed by default, opening on click | browser test |
| F-0006-C | The room's status reads correctly in each state: waiting, choosing decks, ready to start, starting, in a game | unit test + browser test |
| F-0006-D | The steps: each turns ✓ as it is done; Start says what it waits for; the guest never sees Start | browser test |
| F-0006-E | Your deck shows its card count; the other player's deck is never shown | browser test |
| F-0006-G | A player chooses an avatar on Account; it is saved, survives a reload, and shows beside their name in Players, on their seat and in chat, to both players; a new account has the default | server test + browser test |
| F-0006-F | Every existing lobby browser test still passes (invite, decline, withdraw, leave, remove, refresh, chat) | browser tests |
| F-0006-O | The owner reviews it on the real app and accepts it | owner |

## Decisions for the owner

- **D1 — Deck colours, or card count only.** *Recommendation: colours.*
  **Owner, 2026-10-24: card count only.**
- **D2 — Player badges: a letter, or nothing.** *Recommendation: the
  letter.* **Owner, 2026-10-24: neither -- an avatar picture, chosen by
  each player on the Account page, from a set the owner supplies.**
- **D3 — When "Closes in" shows.** *Recommendation: the last 3 hours.*
  **Owner, 2026-10-24: the last 3 hours.**
- **D4 — Chat on a phone: folded, or always open.** *Recommendation:
  folded.* **Owner, 2026-10-24: always open.**

## Amendments
