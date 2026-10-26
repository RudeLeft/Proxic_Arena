# Changelog

What changed for players and for whoever runs the server, in plain
words, newest first. Each release on GitHub carries the same notes.

## Unreleased

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
