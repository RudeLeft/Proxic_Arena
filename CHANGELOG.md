# Changelog

What changed for players and for whoever runs the server, in plain
words, newest first. Each release on GitHub carries the same notes.

## Unreleased

**Password resets by email** (spec 0026, owner 2026-10-28)
- The Admin page no longer sets passwords. **Send password reset** emails the player a link that works once, for an hour, and they choose their own password.
- Each account has an email address: the one it was invited with, or one added on the Account page (it asks for your password) or by an administrator.
- After every password change, the player gets a "Your password was changed" email.

**Linked computers on the Admin page** (spec 0027, owner 2026-10-28)
- A new **Computers** tab lists every computer linked to the Deck Builder: whose it is, its name, when it was linked, and when and from where it was last used.
- **Remove** asks first, then ends that computer's link. The player's decks already on Arena stay.
- Each account shows how many computers it has linked, and Manage → **Linked computers** opens just theirs.

**Hall of Champions** (owner, 2026-10-28)
- The leaderboard's deck icon is the same size as the player's picture.

**Invitation email** (owner, 2026-10-28)
- A new look with the Proxic Arena logo, and a "Welcome to Proxic Arena" heading.
- It links to the newest Proxic Deck Builder and explains how to link a computer to Arena.
- It no longer names who sent the invitation. The subject line is "Your invitation to Proxic Arena".

## 1.14.0 — 2026-10-28

The Hall of Champions is tidied up: a leaderboard that spreads out,
bigger trophies and a wider Belt, and losses in red.

**For whoever runs the server**
- No database changes and no new settings.

**Hall of Champions tidy-up** (owner, 2026-10-28)
- "This season" and "All time" no longer touch.
- On wider screens the leaderboard's column titles spread across the
  table instead of bunching up on the right, and every badge shows (a
  row with many wraps onto a second line).
- The Champion's Belt box is wider, and on a big screen the trophies
  fill their boxes.
- A loss is red rather than pink, with a green for wins to match.

## 1.13.0 — 2026-10-28

Players keep the printing they picked, and the Deck Builder's swapped-in
printings come from ordinary sets.

**For whoever runs the server**
- No database changes and no new settings. The deck rules are rebuilt
  once after the update (a few seconds), and linked Deck Builders pick
  up the new copy on their next export.

**Keep the printing you picked** (owner, 2026-10-27, spec 0024)
- A deck may hold any printing of a card Arena can play, even one from a
  promo or special set Arena has never heard of. The deck keeps that
  printing and its picture, and in a game the card plays like any copy
  of it.
- Still refused: a card Arena cannot play at all, and the 24 cards whose
  printing changes what they do (the Attractions, Everythingamajig,
  Garbage Elemental and Sly Spy) when the printing is not one Arena has.

**Ordinary sets first** (owner, 2026-10-27, spec 0023)
- When the Deck Builder does have to swap a printing, it now picks one
  from a regular set rather than the newest special edition (Lightning
  Bolt: Avatar: The Last Airbender Eternal instead of a collector
  printing). Nothing in a game changes.

## 1.12.0 — 2026-10-27

Admin's column titles line up with their data, and the project now
watches for new Forge releases and says what moving to one would mean.

**For whoever runs the server**
- No database changes and no new settings. The Forge release watch runs
  on GitHub, not on your server.

**Forge release watch** (owner, 2026-10-27, spec 0025)
- For whoever runs the server: every Monday GitHub checks whether Forge
  has a release newer than the one Proxic Arena plays. If it has, one
  issue on the project says what moving to it would mean (new questions
  for players, whether our Forge fixes still apply, new cards and sets,
  cards whose printing changes what they do). Nothing on the site
  changes until you decide to move.

**Admin columns line up** (owner, 2026-10-27)
- Every Admin list's column titles now sit directly over their data:
  Manage under Actions, Download record under Record (and no longer
  wrapping "2.5 MB" onto a second line), and "Last attempt" on one line.

## 1.11.0 — 2026-10-27

Decks now come straight from the Proxic Deck Builder, and a token in a
game can wear a real picture. Link a computer once from your Account
page; after that the Deck Builder's **Proxic Arena Export** puts the
deck, its card pictures and its token pictures in your Deck Depot.

**For whoever runs the server**
- The database gains one table, for the token pictures a deck brings; it
  is added by itself when the server starts. No new settings.
- Linked Deck Builders download the deck rules again once, because each
  card's printings now come in the order Arena prefers them.

**Send decks and token pictures from the Deck Builder** (owner,
2026-10-27, spec 0022)
- A linked computer sends a deck straight to your Deck Depot. It can also
  read your deck names, so the Deck Builder warns before you send a name
  you already use, and it skips pictures your decks already have.
- The Deck Depot's "Drop a deck package here" box is gone. In its place:
  "Decks come from the Proxic Deck Builder", with a button to the Account
  page where a computer is linked.
- Token cards come along for their pictures only: they never count
  toward the 60 to 65 and are never checked as cards. A deck's page shows
  them in a Tokens band.
- In a game, a token wears a picture with its name, from the deck of
  whoever controls it first, then the other player's. Pongify's Ape on
  your opponent's side wears the Ape picture your deck brought. A token
  nobody brought a picture for plays as before.

## 1.10.0 — 2026-10-27

The Proxic Deck Builder can now follow this Arena's own deck rules. Link
a computer once from your Account page, and every Proxic Arena export
from it checks the cards, printings and deck size Arena accepts, so a
deck that exports is a deck that uploads.

**For whoever runs the server**
- The database gains two tables for linked computers; they are added by
  themselves when the server starts. No new settings.
- The first time the deck rules are asked for after an update, the
  server takes a few seconds to prepare them; after that they are
  answered at once.

**Deck rules for the Deck Builder** (owner, 2026-10-27, spec 0021)
- A new **Deck Builder** panel on the Account page: **Link a computer**
  shows a code like `K7QX-M4PD`. Type it into the Deck Builder (File >
  Proxic Arena Connection). It works once, for 10 minutes.
- A linked computer can download the deck rules and nothing else: it
  cannot play, join rooms, upload, share or delete decks, or change
  your account. Your password never goes into the Deck Builder.
- The panel lists your linked computers, when they were linked and last
  used, with **Remove**. Signing out everywhere, changing your password
  or a disabled account also unlinks every computer.
- The rules are this Arena's own: every card and printing it plays, and
  Open Format's limits (60 to 65 cards, 4 copies, basic lands exempt,
  the Contraption and Attraction decks). When Arena moves to a new
  version of its rules engine, linked Deck Builders follow at once.

## 1.9.0 — 2026-10-27

Polish across the lobby, the Hall of Champions, the Deck Depot and
Admin: the deck check both players can see, a mini Champion's Belt by
the holder's name, one set of picture sizes, and tidier Admin lists.

**For whoever runs the server**
- No database changes and no new settings.

**Lobby, Hall of Champions, Deck Depot and Admin fixes** (owner,
2026-10-27, spec 0019)
- Both players now see "Checking both decks…" from the moment the host
  presses Start, in the same dashed box as "Waiting for you to be ready".
- The deck dropdown: the icon no longer covers the name, decks read
  "Blue White Choices (60 Cards)", and "Choose a deck" can't be picked
  once the list is open.
- A mini Champion's Belt beside the holder's name: in the Players list,
  rooms, chat and on the game's life totals.
- Pictures in the Players list and chat, and deck icons in rooms, share
  one bigger size.
- Hall of Champions: the places line up and each has its colour (gold,
  silver, bronze, green); badges are in title case and say how they were
  earned when you hover them; an "i" by Leaderboard explains the rating;
  the leaderboard has more room on its left.
- Deck Depot: a wider Deck Library, View and Delete on one line, bigger
  deck icons.
- Admin: every list has named columns, and a finished game says who won
  in words ("RudeLeft won on turn 19 · Pat conceded").

**Picture sizes and Admin tidy-ups** (owner, 2026-10-26, spec 0020)
- Pictures everywhere use the lobby's two sizes: the Hall of Champions'
  places and Belt holder are as big as a room's seats, and the Hall's
  side lists, Admin's accounts and Deck Depot's "Shared with" match the
  Players list.
- Admin → Rooms: "Waiting for a player" now fits its box, like every
  other status.
- Admin: the server's health is a pill beside the Server tab's title,
  and a red dot on that tab warns of a problem from any tab.

## 1.8.0 — 2026-10-27

The Hall of Champions gets its own page, with monthly seasons, a fair
rating and the Champion's Belt; and every page's text is bigger and
even.

**For whoever runs the server**
- Seasons change at midnight by the server's clock. Set `TZ` (for
  example `TZ: America/Denver`) in the `arena-server` environment so
  that's your midnight; it defaults to UTC.
- No database changes.

**The Hall of Champions page** (owner, 2026-10-27, spec 0018)
- The trophies have their own page, Hall of Champions, in the top bar;
  the lobby no longer shows them.
- Ranked by a rating, so playing more never beats playing well: a win
  moves you up and a loss down, more for beating a stronger player.
  Five games in a season to be ranked.
- Monthly seasons: when a month ends, 1st, 2nd, 3rd and Last place get
  the trophies and keep them in Past seasons; then everyone starts
  again at 1000. All-time standings stay on their own tab.
- The Champion's Belt: beat whoever holds it, in any game, and it's
  yours. A holder who doesn't play for 14 days hands it to the season
  leader.
- Badges (On fire, Giant slayer, Speed demon, Never conceded, Deck
  master), records, rivalries, your rival, and the latest results.
- A player's deck name and icon can now be seen by others on the Hall;
  the cards in it are still private unless shared.
- The Email account tab on the Admin page no longer shows the Gmail
  help paragraph.

**Bigger, more even text** (owner, 2026-10-26, spec 0017)
- Every page reads more easily: everyday text is 16px (it was mostly
  12-13px), and nothing anywhere is smaller than 12px (some labels
  were 8px).
- One scale of seven sizes replaces 22 different ones, so the same
  kind of text looks the same on every page, the game screen included.
  The text on the cards on the board is unchanged.
- If you set your browser's text size bigger, Proxic Arena follows it.

## 1.7.0 — 2026-10-26

A polished lobby: room cards anybody can read, Ask to join, and the
Hall of Champions across the top.

**The lobby, polished; a clearer room list; Ask to join** (owner,
2026-10-26, spec 0016)
- The Hall of Champions is a strip across the top of the lobby: four
  equal places with full-size trophies, each saying "Won 6 of 9 games",
  with no title in the way.
- Every room is a card anybody can read: who is in each seat (✓ when
  ready), an open seat, or "Held for Pat", and where it stands — "1 seat
  open", "Waiting on Pat's answer", "Choosing decks", "In a game". Rooms
  you are invited to come first, then rooms with a free seat.
- **Ask to join**: a room with a free seat can be asked for. The host
  gets "Pat would like to join your room" with Accept and Decline.
- An invitation reads "RudeLeft has invited you to join Friday Night",
  with Accept and Decline on the card; whoever is turned down — an
  invitation or a request — gets a pop-up saying so.
- Notices now sit in the top bar, so nothing on the page jumps when one
  goes. On any page but the Lobby, an invitation or a request can be
  answered right there.
- In your room: no extra lines under the deck, Ready and Start; the
  Start button says what it is waiting for ("Waiting for Pat to be
  ready"); both players see "Checking both decks…" once the host starts;
  bigger pictures on the seats; no "you, host" or "Your room" labels.
- The game chat has no Close button: its tab opens and closes it.

## 1.6.0 — 2026-10-26

Card close-ups appear whole: never drawn from the top down.

**Card close-ups without the paint-in** (owner, 2026-10-26, spec 0015)
- Zooming into a card no longer draws it from the top down: the table's
  picture shows at once, and the sharp one takes its place in one step
  when it has arrived whole.
- During a game the close-ups of the cards in view are fetched quietly
  ahead, so most zooms are sharp at once; in the Deck Depot, so are the
  cards either side.
- Close-ups are now about seven times lighter. Pictures imported earlier
  get their lighter copy by themselves, in the background, on the first
  start.

## 1.5.0 — 2026-10-26

Accounts by invitation: invite someone by email, and they choose their
own username and password.

**Accounts by invitation** (owner, 2026-10-25, spec 0014)
- The Admin page's "New account" is now "Invite": enter an email address
  and choose player or administrator. The person gets a link that works
  once, for 48 hours, and chooses their own username (suggested from
  their email) and password, then lands in the Lobby.
- Invitations are listed under Accounts, with Send again and Cancel, and
  who joined as whom.
- The server emails the link once an email account is set up on the
  Admin page's new **Email account** tab (server, port, username,
  password, From, and a test email that says what went wrong if it
  fails). The password is stored encrypted and never shown again; to
  change provider, fill the tab in again. Until then, and always as a
  backup, the Admin page shows the link to copy and send yourself.
- Every dead or wrong link reads the same, guessing is slowed down, and
  only a scrambled copy of each link's code is kept.

## 1.4.0 — 2026-10-25

The game on its own page with its own chat, pictures by the life
totals, and a clearer start for the player who joined.

**The game screen** (owner, 2026-10-25, spec 0013)
- The game has its own page: refreshing during a game shows the game
  straight away, never the lobby first.
- A game chat of its own, just for the two players, with everything the
  lobby chat has (times, bubbles, emoji, reactions, "New"). A tab on its
  edge opens and closes it; Close sits beside Send. It is gone once you
  leave the game, and the lobby chat is not shown in a game.
- Each player's picture beside their life total.
- The gear menu says what each option does; "Stops" is now "Stop
  options".
- While the game loads, the gear and chat icons wait for the board (the
  gear comes back if loading takes unusually long, so a stuck start can
  still be abandoned).
- In a room, the player who joined sees "Waiting for the host" in a box
  that is plainly not a button, then "Loading…" once the host starts;
  the "Both decks are being checked" sentence is gone.

## 1.3.0 — 2026-10-25

Who is here and who is winning, an icon for every deck, a redesigned
Admin page, and a site that shows strangers nothing but the sign-in
screen.

**Online, away, offline** (spec 0009)
- Every avatar in the lobby wears a small badge: a green dot when
  someone is here, a yellow clock when they have been idle for 5 minutes
  ("Away 7 min"), a grey ✕ when they are offline ("last seen 2h ago").
- On the Players list, on the seats in your room and beside chat.

**Admin, redesigned** (spec 0010)
- One centred page: a health pill ("Healthy · v1.2.0 · 512116e" -- the
  long build id is gone), five tiles (online now, accounts, rooms in
  use, games today, sign-ins today) and tabs for Accounts, Rooms, Games,
  Sign-ins and Server; the open tab stays in the address.
- Accounts as a table with avatars and online/away badges, one Manage
  menu per row, disabled accounts folded away, New account in a dialog.
- Games say how they ended in plain words; sign-ins are grouped by
  person, with names that never got in at the top in red.

**Hall of Champions** (owner, 2026-10-25, spec 0011)
- A new lobby panel: the Reigning Proxic Champion (most wins, gold
  trophy), 2nd and 3rd (silver and bronze), and dead last (the fewest
  wins, once you have finished 5 games). Only finished games count; an
  abandoned or broken one counts for nobody.
- Those four wear a gold, silver, bronze or muddy ring with a medal on
  their picture across the lobby: the player list, room seats and chat.

**Deck icons** (owner, 2026-10-25, spec 0012)
- Every deck has an icon, from the owner's set of 100. A new import
  suggests one from the deck's colours (red gets Fire, blue-black the
  Eye, and so on) and lets you choose; "Change icon" changes it later.
- Shown beside each deck in the Deck Depot, large on the open deck, and
  in your room's deck dropdown. A deck shared with you shows its
  owner's icon.

**Admin and Account touches** (owner, 2026-10-25)
- Admin and Account no longer repeat their name as a title; the health
  pill keeps its place on Admin.
- The last administrator reads "Last Administrator: Cannot Remove".
- A room's status fits its box ("Waiting for a player"), on a phone too;
  every "Download record" button is one size, so the rows line up.
- A room an administrator closes says "An administrator closed this
  room." -- to the host and whoever had the other seat, nobody else.

**Sign in, addresses and refreshing** (owner, 2026-10-24)
- Somebody who is not signed in sees the sign-in screen and nothing
  else: not the version, not the server's health, not the other pages'
  code. Every other address gives them the same "Sign in to continue",
  so nothing behind it can be mapped. The health checks answer only
  from inside the server's own container.
- Signing in always lands in the Lobby -- also from an old link that
  names another page. The sign-in page no longer says how accounts are
  made.
- An address that is not a page goes to Sign in (or the Lobby when
  signed in), never to a developer placeholder.
- Refreshing looks like a refresh: no "Reconnecting…" flash as the old
  page goes, no "Connecting…" or "nobody here" before the lists arrive,
  and no loading ring for a game that draws at once. A real outage
  still shows after a second.
- The game's loading screen no longer has the logo in its corner; the
  menu reads Lobby, Deck Depot, Account, Admin.

**Deck Depot and lobby touches** (owner, 2026-10-24)
- Card names line up under their pictures; "Shared with" shows avatars;
  the import box no longer lists the format rules; with no decks, the
  lobby links "Go to Deck Depot to Import a Deck".
- The connection pill now notices a network that drops silently (Wi-Fi
  off, a laptop asleep) and says "Reconnecting…" within a minute.

**Tidier chat and invitations** (owner, 2026-10-24)
- Chat no longer posts lobby news ("Pat joined RudeLeft's room"), and an
  empty chat is simply empty. The message box says "Type a message...".
- The invitation box reads: "One seat is open and held for you. To
  decide later, close this window. You can accept anytime from the room
  list." An invited seat says "Invited: Accept Pending". A withdrawn
  invitation no longer adds a second line.

## 1.2.0 — 2026-10-24

A new look for the lobby, a friendlier chat, and a Deck Depot where you
can see your cards up close.

**The lobby, redesigned** (spec 0006)
- Players, your room and chat side by side; on a phone, stacked with your
  room first, and a menu button for the pages.
- Online players first; offline accounts fold under "Offline".
- Your room says where things stand in plain words ("Choosing decks",
  "Ready to start") and walks you through three steps: your deck, ready,
  start. Each seat shows the player and ✓ Ready.
- Avatars: choose yours on the Account page from 50 portraits; it shows
  beside your name in the lobby, on your seat and in chat.
- A room shows when it will close only in its last 3 hours.

**Chat, polished** (spec 0007)
- The time sits right after the name; your own lines have a gold edge.
- A run of lines from one person sits in one bubble.
- A smiley button by Send opens 40 emoji to drop into your message.
- Reactions: point at a line (tap on a phone) for 👍 ❤️ 😂 😮 😢 🔥;
  everyone sees the counts, and pointing at one says who.
- The lobby's news in grey: "Pat opened a room", "Pat joined Friday
  night", "RudeLeft and Pat started a game".
- Lines that came in while you were away sit under a "New" divider, and
  the browser tab shows how many, "(2) Proxic Arena".

**Deck Depot** (spec 0008)
- Click a card to see it large, at full size; ← / → step through the
  deck, Esc closes. A card that turns over (Delver of Secrets) has Turn
  over. Decks you already have learn their back faces in the background
  after the update.
- Small / Medium / Large cards, remembered on your computer; Medium is
  the new default.
- On a phone, View takes you to the deck and folds the library away.
- Re-importing a deck you have says so once; every refusal has a plain
  heading; a failed delete, a library that will not load and a deck that
  will not open now say so; two quick Views always show the second.

**Fixes**
- On a phone, the host's buttons no longer run off the room card.
- Plainer words in the invitation box and the empty chat.
- An invitation that could not be put back after a refused accept now
  tells both players it ended, instead of vanishing.

## 1.1.0 — 2026-10-24

Every question the rules engine can ask a player is now answered by the
player and proven in a real game (Phase 8, accepted 2026-10-24). A deck
can hold any card the engine knows, the joke sets included, and no card
stops a game for want of a question.

**Playing**
- Sacrifice and destroy: "which creature do you sacrifice?" (Eldrazi
  Monument, Diabolic Edict, Innocent Blood) is asked of the right player,
  on the board, even with only one choice.
- Surveil and scry show the cards as pictures; you pick top, bottom,
  graveyard and order by clicking them.
- Every kind of cost now works: crewing, tapping or untapping creatures,
  returning lands, kicker and offspring counts, mana in any combination,
  reveal, draw, exert, behold, collect evidence, blight, forage, damage,
  gifts, counters, coin flips and dice. Costs are asked in a safe order,
  so backing out never loses a card for nothing.
- Your choices: colours, protection, votes, piles, splice, Room doors,
  keyword pumps, dungeons, bidding, ward, shields, counter kinds, cascade.
- Combat: dividing damage between blockers, Lone Wolf's "as though
  unblocked", exert, enlist, attack taxes (Ghostly Prison). **Trample now
  follows the rules**: every blocker must get lethal damage before any
  reaches the player.
- Dice you can change (reroll, nudge, swap, ignore), and the Un-sets:
  Contraptions in their own deck (at least 15, one of each), assembled
  onto sprockets and cranked; Space Beleren's sectors. The board shows a
  creature's sector and a Contraption's sprocket.
- **Respond to your own spells**: when your own spell or trigger is on
  the stack and you could respond, the button counts down "Resolving in
  2…". Do nothing and it resolves; click a card you could play (or the
  countdown) and it waits for you. Your opponent's spells stop you as
  before.
- "Resolving…" instead of "Waiting for" the other player while the rules
  engine is busy, and hundreds of attacking tokens stay one pile.
- Questions name cards plainly (no internal numbers).

**Around the game**
- A deck is checked faster: one that is illegal whatever its cards are
  (too few cards, five copies) is refused at once.
- If a game ever stops on something not yet supported, the admin's game
  record names the card.

**For whoever runs the server**
- The database gains and drops one small column on start (priority
  settings); nothing to do.
- Phase 8's papers are in `docs/history/phases/phase-08/`; who applies
  each Magic rule, and the proof, is `docs/architecture/RULES_COVERAGE.md`.

## 1.0.0 — 2026-10-22

The first release: the main build is finished (eight phases, signed off
2026-10-22).

**Playing**
- Two players play a real game of Magic, with Forge running the rules,
  on a battlefield in the style of MTG Arena: click a card to play it,
  pick targets, attackers and blockers on the board, right-click for a
  close look.
- Spells and abilities wait on the stack as cards, with arrows and a
  glow on what they target. Combat shows its lines and damage.
- Mana costs show as mana symbols, at what the spell costs right now.
- A card that cannot act says why ("came in this turn", "tapped").
  A block or attack the rules forbid is refused with the reason, and any
  creature can be taken back out of combat.
- Turns move on their own unless you have something to do; the stops
  panel says when to pause. "All attack", "skip to end of turn",
  concede and abandon are in the game menu.
- Hand, library, graveyard and exile for both players, each opening its
  list. Two-faced cards show their own back picture (re-import decks
  from the Deck Builder's newer export to get them).
- Only what you are allowed to see ever reaches your browser.

**Around the game**
- Sign in, Lobby (rooms, players online, invitations, chat), Deck Depot
  (import, rename, share by username), Account, and an Admin page
  (accounts, rooms, sign-ins, server state, game records).
- Pages and games reconnect on their own after a server update.

**For the server**
- Runs on Unraid behind Cloudflare; update with two clicks
  (`docs/operations/UPDATING.md`).
- The 2026-10-22 security review: game and lobby connections accept only
  our own page; deck pictures are size-checked before unpacking; Java,
  the database (PostgreSQL 16.4 → 16.15), the web server and every
  website package brought up to date. Take an appdata backup before the
  first update to 1.0.0 — the database version moves.

**Not yet**
- 42 rarer Forge questions are not built: a game that reaches one ends
  with an error. Commander and Two-Headed Giant are planned. See
  `ROADMAP.md`.
