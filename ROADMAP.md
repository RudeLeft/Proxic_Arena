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
