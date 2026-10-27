# 0019 — Lobby, Hall of Champions and Deck Depot fixes

**Status:** Approved 2026-10-27 — built; look approved ("Yes, ship it")
**Owner decisions** (2026-10-27): F1 the Belt holder gets a mini belt
beside their name wherever names appear; F2 pictures in the Players list
and chat, and deck icons in rooms, share one size, 40px; F3 the rating
explanation sits behind an "i" by the Leaderboard title; F4 written up
first, built only on the owner's word.

## What the player sees

**In a room**

1. **"Checking both decks…"** looks exactly like the dashed "Waiting
   for you to be ready" box beside it (owner, 2026-10-27): same dashed
   border, size, letters and colours, with a spinner where the
   hourglass is.
2. **The deck dropdown**: the deck's icon no longer covers its name
   (spec 0017 reset the dropdown's left padding inside the room's steps,
   which the icon needed). Each deck reads "Blue White Choices
   (60 Cards)" instead of "Blue White Choices — 60 cards".
   "Choose a deck" shows in the closed dropdown until a deck is chosen,
   but is not in the open list: it cannot be picked, so the only choices
   are decks (owner, 2026-10-27). Once a deck is chosen it can be changed
   to another deck, not back to none.
3. **The invited player sees "Checking both decks…" too**, from the
   moment the host presses Start. Today the check runs before the room
   is marked as starting, so the invited player saw "Waiting for the
   host" through the check and then went straight to the game. The
   server tells both players when the check begins (the room is marked
   as checking), and both boxes say so.

**Everywhere names appear**

4. **The Belt holder** (F1): a small picture of the owner's belt beside
   their name in the Players list, on room seats and room cards, in chat
   and on the game's life medallions, with the words "Champion's Belt
   holder" for a screen reader and on hover.
5. **One size** (F2): pictures in the Players list and chat, and deck
   icons in rooms, are all 40px (were 36px, 28-32px and 28px).

**The Hall of Champions**

6. The line "Ranked by rating: winning moves you up, playing more
   doesn't" goes. An "i" beside the Leaderboard title (F3) shows, on
   hover or click: "Everyone starts each season at 1000. A win adds
   points and a loss takes them away; beating a higher-rated player is
   worth more (up to 32), a lower-rated one less. A draw changes
   nothing. Five games in a season to be ranked." The page still fits
   one screen.
7. 3rd place and Last place line up with 1st and 2nd (an empty place
   keeps the same rows as a filled one).
8. Each place has its own background fade: gold, silver, bronze and
   green, behind its trophy.
9. Badge names in title case — Belt Holder, On Fire · 4, Giant Slayer,
   Speed Demon, Never Conceded, Deck Master. Hovering any badge shows a
   tooltip saying how that player earned it (owner, 2026-10-27):
   - Belt Holder: "Holds the Champion's Belt right now."
   - On Fire · N: "N wins in a row (a loss or a draw ends the run)."
   - Giant Slayer: "Beat the player leading the season, this season."
   - Speed Demon: "Won a game by turn 5, this season."
   - Never Conceded: "10 or more games, and never conceded one."
   - Deck Master: "Won with 5 or more different decks."
   Where a row has room for one badge only, a small "+2" sits beside it,
   and hovering that lists the others with the same explanations.

9b. **The leaderboard breathes on its left side** (owner, 2026-10-27):
    the rank, the player and the rating are spaced further apart (a
    wider rank column, more room between the picture and the name, and
    a gap before Rating), so the columns spread evenly across the table
    instead of bunching at the left; nothing is cut off at 1280px.

**The Deck Depot**

10. The Import and Deck Library column is wider, so View and Delete sit
    on one line beside each deck; the deck icons there are bigger.

**The Admin page**

11. The Games tab says how a finished game ended in words, with the
    players' names instead of seat numbers (owner, 2026-10-27; it showed
    the raw record, "Finished · winner:seat 1 on turn 19"):
    - "RudeLeft won on turn 19"
    - "RudeLeft won on turn 4 · Pat conceded"
    - "Pat won on turn 9 · Laboratory Maniac" (a win by a card's own
      rule names the card, from the rules engine's sentence)
    - "Draw on turn 17"
    The "Finished" status beside it stays; anything the server cannot
    read is shown as "Finished" alone rather than raw.
12. Every list on the Admin page has named columns, in the same style
    as Accounts' header today, with each row lined up under its names
    (owner, 2026-10-27; only Accounts had them):
    - Accounts: Player · Role · Status · Last seen · Sessions · Actions
    - Invitations: Email · Role · Status · Expires · Actions
    - Rooms: Room · Players · Status · Idle · Actions
    - Games: Started · Players · Result · Record
    - Sign-ins: Result · Player · Details · Last attempt · Address
    On a phone the header hides and each row keeps its words, as Accounts
    does today.

## Scope

In: the twelve points above. Out: new badges, new notices.

## Rules and boundaries

- Item 3 adds a short-lived "checking" state to the room the members
  are sent (the server sets it when the host starts the check and clears
  it with the result); nothing else about preparing a match changes.
- Item 4 shows only who holds the Belt, which the Hall already shows to
  everyone.
- Every size stays on spec 0017's scale; icon and picture sizes are not
  text sizes and are named once.

## Acceptance tests

| ID | Test | Evidence |
|---|---|---|
| F-0019-A | Both players see "Checking both decks…" from the moment the host presses Start | server test + browser |
| F-0019-B | The deck dropdown's icon and name do not overlap; "(60 Cards)" | browser (bounding boxes) + screenshot |
| F-0019-C | The Belt holder's mini belt in the Players list, seats, chat and the game | unit + screenshot |
| F-0019-D | 40px pictures and icons; the Hall's places aligned; badges title-cased with tooltips; the "i" | unit + screenshots |
| F-0019-E | Deck Depot: View and Delete on one line at 1280px | browser + screenshot |
| F-0019-F | Admin Games: a finished game in words, by name (win, concession, alternate win, draw) | server test + screenshot |
| F-0019-G | Every Admin list has named columns, rows lined up under them | browser + screenshots |
| F-0019-O | The owner approves the look ("Yes, ship it", 2026-10-27) | owner |
