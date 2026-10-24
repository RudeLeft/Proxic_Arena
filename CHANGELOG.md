# Changelog

What changed for players and for whoever runs the server, in plain
words, newest first. Each release on GitHub carries the same notes.

## Unreleased

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
