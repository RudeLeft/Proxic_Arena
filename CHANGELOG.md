# Changelog

What changed for players and for whoever runs the server, in plain
words, newest first. Each release on GitHub carries the same notes.

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
