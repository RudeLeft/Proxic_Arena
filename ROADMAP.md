# Proxic Arena — Roadmap

What is built, what is next, and how new work happens. Read `AGENTS.md`
first.

**One play mode today: Open Format** — 60–65 cards, max 4 copies of a
specific card (basic lands unlimited), no sideboard, 2 players. See
`docs/architecture/OPEN_FORMAT.md`.

## How work happens now

The main build ran as eight locked phases and finished on 2026-10-22
with version **1.0.0**. From here the project grows **one feature at a
time** (owner decision, 2026-10-22):

1. **Spec.** A short document in `docs/features/NNNN-name.md`: what the
   player sees, the tests that prove it, and any decisions for the owner.
   `docs/features/README.md` has the template.
2. **Approval.** The owner approves the spec. An approved spec is what a
   locked phase used to be; a big feature (Commander) simply has a long
   one.
3. **Build and ship.** Built and verified under every rule in
   `AGENTS.md`, released with a plain-English entry in `CHANGELOG.md`,
   and marked Done below.

## Features

| # | Feature | Status | Spec |
|---|---|---|---|
| 0001 | Sacrifice and surveil — "which creature do you sacrifice?" (Eldrazi Monument, Diabolic Edict) and "surveil N"; the two unbuilt questions most likely to stop a game | **Done** in 1.1.0 (with "destroy" too) | `docs/features/0001-sacrifice-and-surveil.md` |
| 0002 | "Resolving…", not "Waiting for" the other player — while the rules engine works (Krenko making Goblins) and nobody is asked, both screens say so instead of each blaming the other | **Done** in 1.1.0 | `docs/features/0002-resolving-not-waiting.md` |
| 0003 | Big boards stay playable — 300 attacking Goblin tokens are one pile with one fire line, not 300 cards and lines; where a big board's time goes, measured before any speed change | **Done** in 1.1.0 | `docs/features/0003-big-boards.md` |
| 0004 | Hold priority — a Hold button on the rail: with it on, you are asked after your own spell, ability or trigger goes on the stack (to respond to it), not passed for; on until you turn it off. From the Phase 8 rules review (CR 117.3c) | **Dropped** 2026-10-23 — replaced by 0005 | `docs/features/0004-hold-priority.md` |
| 0005 | The response window — your own spell or trigger on the stack, with something you could respond with: the act button counts down "Resolving in 2…" and resolves it by itself; clicking a card you could play, the countdown, a close look or a list pauses it. Fully automatic, nothing to set (Phase 8 Amendment 4) | **Done** in 1.1.0 | `docs/features/0005-response-window.md` |
| 0006 | Lobby redesign — players, your room and chat side by side; online players first, offline folded; one plain status per room; numbered steps (deck, ready, start); avatar pictures chosen on Account; a compact phone header. From the 2026-10-24 lobby review and a visual example | **Done** in 1.2.0 | `docs/features/0006-lobby-redesign.md` |
| 0007 | Chat polish — the time next to the name, your own lines marked, message bubbles, an emoji button by Send, reactions (👍 ❤️ 😂 😮 😢 🔥), lobby events in the chat ("Pat joined Friday night"), and a "New" unread marker. From the owner's chat review after 0006 | **Done** in 1.2.0 | `docs/features/0007-chat-polish.md` |
| 0008 | Deck Depot — click a card to zoom (full-size picture, arrows through the deck, Turn over for two-faced cards), a Small/Medium/Large card size, phone fixes (View goes to the deck, the library folds), and a clean-up (no doubled or silent messages, plain headings for every refusal, no wrong-deck flash, dead code out). From the owner's Depot review | **Done** in 1.2.0 | `docs/features/0008-deck-depot-zoom.md` |
| 0009 | Online, away, offline — a badge on every lobby avatar (green dot; yellow clock after 5 minutes without activity; grey ✕ offline, with "last seen"), in Players, on room seats and in chat. From the owner, picked from three options | **Done** in 1.3.0 | `docs/features/0009-online-away-offline.md` |
| 0010 | Admin redesign — a centred page with a health pill (short version), five tiles (online now, accounts, rooms, games today, sign-ins today) and tabs: Accounts (one Manage menu per row, avatars and badges, disabled folded), Rooms, Games (outcomes in plain words), Sign-ins (grouped by person), Server. From the owner, option A of three | **Done** in 1.3.0 | `docs/features/0010-admin-redesign.md` |
| 0011 | Hall of Champions — a lobby panel: the Reigning Proxic Champion (most all-time wins, gold trophy), 2nd and 3rd (silver, bronze) and dead last (fewest wins after 5 finished games); gold, silver, bronze and dead-last rings on those players' pictures across the lobby. From the owner, with their trophy art | **Done** in 1.3.0 | `docs/features/0011-hall-of-champions.md` |
| 0012 | Deck icons — 100 icons from the owner's ten sheets; one per deck, suggested from its colours, chosen after import and changeable later; shown in the Deck Depot list, the deck view and the room's deck picker | **Done** in 1.3.0 | `docs/features/0012-deck-icons.md` |
| 0013 | Game screen polish — a not-a-button "Waiting for the host" and "Loading…" on the joiner's Start, no corner icons while the game loads, the game on its own page (no lobby flash on refresh), a separate game chat with every lobby-chat feature and an open/close tab, avatars beside the life medallions, and plain descriptions in the gear menu. From the owner, with a demo | **Done** in 1.4.0 | `docs/features/0013-game-screen-polish.md` |
| 0014 | Accounts by invitation — the Admin page invites an email address; a one-time 48-hour link (emailed when an email account is set up, always shown to copy) opens "Create your account", where the person picks their own username (suggested from the email) and password. "No self-registration" becomes "by invitation only". From the owner, with a demo | **Done** in 1.5.0 | `docs/features/0014-account-invitations.md` |
| 0015 | Card close-ups without the paint-in — a zoomed card shows the table's picture at once and swaps in the sharp one only when it is whole; a lighter close-up copy (JPEG, about seven times smaller); during a game the close-ups of cards in view are fetched ahead. From the owner | **Done** in 1.6.0 | `docs/features/0015-card-close-ups.md` |
| 0016 | Lobby polish, a clearer room list, and Ask to join — the owner's sixteen points: fewer words under the room's steps, a Start button that says what it waits for, "Checking both decks…" for both players, no game-chat Close, notices in the top bar (invitations answerable from any page), bigger seat pictures, the Hall of Champions as a strip across the top ("Won 6 of 9 games"), room cards anybody can read with "Held for Pat", Ask to join, and a pop-up when an invitation or request is declined. From the owner | **Done** in 1.7.0 | `docs/features/0016-lobby-polish-and-ask-to-join.md` |
| 0017 | One type scale — every text size one of seven steps, reading text 16px, nothing under 12px, following the browser's own text size; the spaced-capital labels kept, bigger; the game screen included (not the card text on the board); a test keeps it so. From the owner | **Done** in 1.8.0 | `docs/features/0017-type-scale.md` |
| 0018 | The Hall of Champions page — the trophies on their own page: monthly seasons ranked by a rating (playing more never beats playing well), 1st, 2nd, 3rd and Last place kept season by season, the Champion's Belt (beat the holder to take it), badges, records, rivalries and the latest results; one screen on a desktop. A deck's name and icon may be seen by others, never its cards. From the owner, with a draft | **Done** in 1.8.0 | `docs/features/0018-hall-of-champions-page.md` |
| 0019 | Lobby, Hall of Champions, Deck Depot and Admin fixes — the deck check shown to both players in the waiting box's style, the deck dropdown fixed (no overlap, "(60 Cards)", no "Choose a deck" to pick), a mini Champion's Belt beside the holder's name, one 40px size for list pictures and room deck icons, the Hall's places aligned with colour fades, title-case badges with tooltips, a rating "i", a roomier leaderboard, a wider Deck Library, and Admin lists with named columns and games in words. From the owner | **Done** in 1.9.0 | `docs/features/0019-lobby-and-hall-fixes.md` |
| 0020 | One set of picture sizes (40px in lists, 56px for featured players) on the Hall of Champions, Admin and Deck Depot; every Admin room status fits its box; the server's health as a pill on the Server tab, with a red dot on the tab when something is wrong. From the owner | **Done** in 1.9.0 | `docs/features/0020-picture-sizes-and-admin-health.md` |
| 0021 | Deck rules for the Deck Builder — Arena's Forge lists every card and printing it accepts, and Arena serves them with Open Format's limits at /api/deck-rules; the Account page links a computer with a one-time code, and a linked Deck Builder downloads those rules, so it follows Arena's Forge with no release of its own. From the owner | **Done** in 1.10.0 | `docs/features/0021-deck-rules-for-the-deck-builder.md` |
| 0022 | Send decks and token pictures from the Deck Builder — a linked computer sends its deck straight to the Deck Depot (only pictures Arena lacks), token cards travel as pictures and a token in play wears the one a deck brought, matched by name; the Deck Depot's upload box becomes a link to the Account page; the deck rules list printings in Forge's own order. From the owner | **Done** in 1.11.0 | `docs/features/0022-send-decks-and-token-pictures.md` |
| 0023 | Load Forge's editions once — the worker stops handing Forge its editions a second time as home-made ones, so Forge can tell a regular set from a special one and the deck rules list regular-set printings first (Lightning Bolt: TLE, not Secret Lair-style SLZ); nothing in a game changes. Found while building 0022 (Deck Builder half dropped by Amendment 1, with 0024). From the owner | **Done** in 1.13.0 | `docs/features/0023-load-editions-once.md` |
| 0024 | Keep the printing you picked — any printing of a card Arena can play is accepted and wears the player's own picture; the game plays it like any copy of that card. Still refused: cards Arena cannot play, and the 24 whose printing changes the card (Attractions, Everythingamajig…). Today 13.6% of real printings are refused. The Deck Builder stops swapping, in its own project. From the owner | **Done** in 1.13.0 | `docs/features/0024-keep-the-printing-you-picked.md` |
| 0025 | Forge release watch — every Monday a GitHub Actions workflow checks for a Forge release newer than the one we play and opens one issue saying what moving would mean: new questions for players, whether our Forge patches still apply, new cards and sets, and cards whose printing changes what they do. A report only; the pin never moves by itself. From the owner | **Done** in 1.12.0 | `docs/features/0025-forge-release-watch.md` |
| 0026 | Password reset by email — the Admin page sends a reset instead of setting a password: Arena emails the player a link that works once, for an hour, and they choose their own password. Accounts keep an email address (from the invitation, or added by the player or an administrator). "Your password was changed" after every change. No "Forgot your password?" (owner decision). From the owner | **Done** in 1.15.0 | `docs/features/0026-password-reset-by-email.md` |
| 0027 | Linked computers on the Admin page — a Computers tab lists every computer linked to the Deck Builder, for every player (name, linked, last used and the address it last connected from), with Remove that asks first; each account shows its count and a Manage shortcut. From the owner | **Done** in 1.15.0 | `docs/features/0027-admin-linked-computers.md` |
| 0028 | The stack as a cascade — every object on the stack fanned at the board's right edge so each name shows, numbered in resolve order, gold yours / red theirs with the caster's picture, point to see a card's target, abilities shown with their source, a visible resolve, and a ring counting down the auto-pass. From the owner | **Done** in 1.16.0 | `docs/features/0028-stack-cascade.md` |
| 0029 | Player plates — the game's right-hand column redrawn: each player on a raised plate with picture and Hall ring, name and Belt, life in a red banner, and a grid of big tiles for hand, library, graveyard and exile. From the owner | **Done** in 1.16.0 | `docs/features/0029-player-plates.md` |
| 0030 | The turn ladder — the turn's steps move from the bar over the board to a ladder between the two player plates; the current step gold, the passed ones dimmed, combat says which part. From the owner | **Done** in 1.16.0 | `docs/features/0030-turn-ladder.md` |
| 0031 | Belt mark and zone pictures — the owner's belt drawing as the small Champion's Belt mark, and the owner's library, graveyard and exile pictures faded behind the counts on the player plates; the opponent's hand drawn at the top of the board. From the owner | **Done** in 1.16.0 | `docs/features/0031-belt-and-zone-pictures.md` |
| 0032 | Card-title font and life banner — the font real Magic cards use for names, on the battlefield only (card names, numbers, player names, the big words); every other page and the emails keep today's fonts. The life total in a new gold-and-velvet banner. From the owner | **Done** in 1.16.0 | `docs/features/0032-card-title-font-and-banner.md` |
| 0033 | The battlefield as lit velvet — the green table gets a brushed-velvet texture, even light across the middle and a deep shadow with a faint gold rim round the edge, like an inset tabletop. From the owner | **Done** in 1.17.0 | `docs/features/0033-velvet-table.md` |
| 0034 | The action button and the turn's steps — the button says where a pass lands, whose spell resolves and at what, the power in combat and who won, in a new seal look with a coin; the steps as gems on a rail that sweep smoothly, dimming and starting again at a new turn; "Your turn" / "Opponent's turn". From the owner | **Done** in 1.18.0 | `docs/features/0034-action-button-and-steps.md` |
| 0035 | One rule for when the game stops for you — the stop options and "Skip to end of turn" removed; the game stops only when you could play something and the moment can matter, now including the opponent's end step, before they attack, a card's only step, and a sacrifice outlet in answer; the countdown on your own spell lasts 5 seconds and a click resolves it. From the owner | **Done** in 1.18.0 | `docs/features/0035-one-rule-for-stops.md` |
| 0036 | Identical cards stack, up to 15 — any identical cards stack, not only basic lands and tokens; any difference (tapped, attacking, power and toughness, keywords, counters, damage, summoning sickness, token or card) splits them; at most 15 to a stack; a click acts on one card of a stack. From the owner | **Done** in 1.19.0 | `docs/features/0036-stacking-identical-cards.md` |
| 0037 | Big combats — a blocker is drawn riding on the attacker it blocks (no block lines), identical blocked pairs stack, and a stack of your creatures can block many attackers in two clicks with a how-many chooser. From the owner | **Done** in 1.19.0 | `docs/features/0037-big-combats.md` |
| 0038 | The rail evenly spaced, with a status tray — the plates, turn steps and action button spread evenly down the right-hand rail; each player gets a tray for floating mana (the real mana symbols with counts), counters, held markers and the command zone, so the plates never grow. From the owner | **Done** in 1.20.0 | `docs/features/0038-rail-spacing-and-status.md` |
| 0039 | Bug reports and ideas — a Report button on every page (beside the gear in a game); a problem form that asks where, what part, which cards, what happened and how much it mattered, and an idea form; each report saved with the game record, the page's last 15 minutes and the server's lines; an Admin › Reports tab and a zip of it all to hand to Claude. From the owner | **Done** in 1.21.0 | `docs/features/0039-bug-reports-and-ideas.md` |
| 0040 | Flexible lines — each kind of card on its own lines across the table (creatures nearest the middle, then artifacts, enchantments and planeswalkers, then lands at your edge), never mixed; a crowded kind takes a spare line, then the whole side shrinks in steps (90/80/75/70%), each card always showing at least half of itself; tapped cards tilt 5° and are never cut. From the owner | **Done** in 1.22.0 | `docs/features/0040-flexible-lines.md` |
| 0041 | Short names, clear password checks, the checking box — display names 1–12 characters and required, shown in full everywhere (shrunk to fit where a place is narrow); a green check on each sign-up and password box and a list of what's still missing under the button; Account page asks for the new password twice; the lobby's "Checking both decks…" box the size of the waiting box. From the owner | **Approved** 2026-10-30 | `docs/features/0041-names-passwords-checking-box.md` |
| Phase 9 | **Every window, popup and prompt in a game** — one look for every window (a bubble beside the card asking, a tray from the bottom for many cards), then each window taken one at a time with a canvas and the owner's decision: the question banner and box, "List choices", yes/no, ordering triggers, many identical triggers (Boggart Shenanigans in 2 clicks, not 20), putting cards in order, looking at cards, searching, piles, numbers, naming, combat damage, the stack with its pictures, the zone viewers, the close-up, notices and game over. From the owner | **Locked**, active (2026-10-30) | `PHASE_09_GAME_WINDOWS_LOCKED.md` |
| Phase 8 | **Every Forge question, answered and proven** — a record of all 170 questions and cost kinds Forge can put to a player, generated from Forge itself; a CI gate so none can be skipped; a real-game proof for each; the 31 missing questions (Un-set ones included) and 31 missing costs built, in order of how many cards need them. 0001 is its Part 1 | **Done** — accepted 2026-10-24, in 1.1.0 | `docs/history/phases/phase-08/` |
| — | Commander | Planned (owner decision 2026-10-17; not scoped) | — |
| — | Two-Headed Giant | Planned (owner decision 2026-10-17; not scoped) | — |
| — | A match that survives a server restart (today it ends with no winner; P6-AZ) | Idea | — |
| — | A computer opponent | **Never** (owner 2026-10-23: "we will never implement an AI opponent") | — |
| — | Card rules text in the close look — right-click any card, a token or a card with no picture included, and read what it does now (a Treasure's "sacrifice: add one mana", abilities it has gained); today a card with no picture shows only name, type, power and keywords | Idea (owner 2026-10-23, from the Forge comb) | — |
| — | Offer a draw — both players agree to end a game as a draw (Forge has it: `DrawOfferCoordinator`) | Idea (owner 2026-10-23, from the Forge comb) | — |
| — | Undo and replays — take back a misclick with the opponent's OK; watch a finished game again (both new in Forge after 2.0.15) | Idea (owner 2026-10-23, from the Forge comb; needs Forge 2.0.16) | — |
| — | Best of three — a match is first to two game wins, no sideboarding (Forge's `gamesPerMatch`) | Idea (owner 2026-10-23, from the Forge comb) | — |
| — | Forge 2.0.16 — when it is released: rules fixes (simultaneous entry, mana refunds, an endless trigger loop is a draw, ~40 card scripts), new cards, the three Unfinity sticker questions built (Phase 8 D1); patches 0001 and 0002 still needed upstream. A before/after report and plan for the owner first (VEND-005) | Planned (owner 2026-10-23), next | — |
| — | Web server framework: Ktor 2.3 (end of its line) → Ktor 3 | Planned (maintenance) | — |
| — | Offer Forge patches 0001 and 0002 upstream | Idea | — |

Commander and Two-Headed Giant are not built and nothing offers them,
but the runtime is designed so they stay reachable without rework.
AGENTS FMT-001 and FMT-005 draw that line — a seat model that can hold
four is in scope; a game that seats four is not.

## Built: the main build, 2026-10-15 → 2026-10-22

Each phase's specification, amendments, audit, exit gate and research
are kept, unedited, in `docs/history/phases/phase-NN/`. The code cites
their sections by name ("PHASE_06 §6.17").

| Phase | Name | Result |
|---|---|---|
| 0 / 0A / 0B | Forge architecture validation | 0 superseded by 0A + 0B; 0A **ACCEPTED** 2026-10-15; 0B is a standing register of deferred questions, each with its trigger |
| 1 | Application Foundation | **COMPLETE** 2026-10-15 — deployed and verified at `https://proxic.barnflix.net` |
| 2 | Deck Package Import | **COMPLETE** 2026-10-15 — 20/20 acceptance tests |
| 3 | Accounts & Authentication | **COMPLETE** 2026-10-16 |
| 4 | Deck Depot | **COMPLETE** 2026-10-16 — private decks, sharing by username |
| 5 | Lobby, Game Rooms, Match Setup | **COMPLETE** 2026-10-17 — 26/26; no join codes: presence, invitations, chat |
| 6 | Forge Match Runtime & Game Protocol | **COMPLETE** 2026-10-20 — 65/65 (63 met, 2 classified); 48/48 required Mechanics Lab cards |
| 7 | Battlefield Presentation & Interaction, and the application pages | **COMPLETE** 2026-10-22 — 27/27, signed off by the owner; a 2026-10-22 security review fixed and recorded |

How the game works today — the living reference, kept current — is
`docs/architecture/`; the locked architectural facts from Phase 0A are
`docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md`; lasting decisions
are in `docs/decisions/`.
