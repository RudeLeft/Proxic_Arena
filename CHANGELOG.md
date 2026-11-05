# Changelog

What changed for players and for whoever runs the server, in plain
words, newest first. Each release on GitHub carries the same notes.

## Unreleased

The status tray's list, and a Peek button (Phase 9).

**The status tray** (the thin bar beside each player's plate: mana, counters, Monarch, the Ring, emblems, dungeons)
- Long names are shortened in the row ("Liliana emblem", "Undercity · Secret Entrance"), so one emblem no longer hides behind a lone "+1". The Ring shows once, with how many times it has tempted you.
- Clicking a chip or "+N" opens a list beside the tray, left of the right-hand column. It no longer covers the turn steps or the action button.
- The list says what each thing does: Monarch and the initiative in plain words, an emblem's own words, the dungeon room you're in and where you can go next, and the Ring's four powers with the ones you've earned lit. Mana shows as symbols, and nothing is listed twice.
- Esc, clicking anywhere else, or clicking the chip again closes it. Opening one player's list closes the other's.

**Peek**
- Every game window has a **Peek** button: press and hold it to see the table behind the window, let go and it comes back. Holding Space still works.
- Peek and Space now fade every window: questions, Play or draw and the opening hand, the revealed cards, the graveyard / exile / library viewer, the card close-up and the status list. (During the countdown before a spell resolves, Space still means "resolve now"; use the Peek button then.)

## 1.44.0 — 2026-11-05

Choosing targets, and cards you can't pay for (Phase 9).

**For whoever runs the server**
- Two database updates run by themselves on start; both are from 1.43.0, which was not published on its own (its notes follow). Nothing in 1.44.0 itself changes the database.

**Choosing targets** (Arc Lightning, Forked Bolt, and any spell that takes "up to" several targets)
- Once you have chosen enough targets, a gold **Done** appears ("Done · 2 targets"); press it to go on with the ones you chose.
- Chosen targets wear a TARGET tag, and the question counts them: "2 chosen: RudeLeft, Hill Giant".
- "Cancel Arc Lightning" (and Esc) now always cancels the spell and puts it back in your hand, however many targets you had chosen.
- The question names the card where it used to say "CARDNAME".

**Cards you can't pay for**
- A card in your hand that you can't pay for right now is greyed out, without the gold glow. You can still click it.

## 1.43.0 — 2026-11-05

An administrator can rename a player, and the last fixes from the documentation review.

**For whoever runs the server**
- Two database updates run by themselves on start: old rooms can now be cleaned up, and a renamed player's notice is kept until they see it.
- Closed rooms older than seven days are now removed even if a game was played in them. The games, their players and the Hall of Champions are kept.

**Renaming a player** (Admin page)
- "Change display name…" in an account's Manage menu opens a small form, like changing an email address, with the same 1 to 12 character rule as signing up.
- Only the name shown in the lobby, games and the Hall changes; the player still signs in with the same username.
- The player is told once: "An administrator changed your display name to Ash." Everyone else sees the new name at once.
- Renames are written to the sign-in log, including when a player renames themselves.

**Rooms and decks**
- Someone who is not in a room is always told "no such room" if they try to change it.
- Ticking or unticking ready while a game is being played is refused.
- Sharing a deck with the same player twice at the same moment shares it once and says so once.

## 1.42.0 — 2026-11-04

Fixes from a full review of the documentation against the code.

**For whoever runs the server**
- A database update runs by itself on start: a player can only ever be in one room (it clears any seats left in closed rooms first).
- The game's headings now use their own font (Barlow Condensed), shipped with the game instead of relying on the player's computer.
- The sign-in log now records every account change once: an account turned on or off and a role changed from the Admin page, a password changed (it was written twice), and sessions signed out.
- `arena-admin set-password` now emails the player "Your password was changed", `arena-admin create` refuses a display name sign-up would refuse, and with the database down the tool prints one plain line instead of a stack trace.
- A game no longer leaves an empty folder behind in the server's temporary space.

**Rooms**
- Sending an invitation counts as activity, so an inviting host's room no longer closes as idle.
- A room back from a game, including one a server restart gave back, starts a fresh idle clock instead of closing at the next check.
- If a player leaves, is removed, is taken out for being away or unticks ready after the game was prepared, the start is cancelled and the room waits again. Before, Start match could seat somebody who had gone.
- Two tabs opening a room at the same moment can no longer give one player two rooms.

**In a game**
- "End the game" for a player who has gone offline follows the server's away setting, and says it ("Pat has been gone 20 minutes"); it was always 10 minutes on the page.

**Accounts and reports**
- Signing out is protected the same way as every other change, so another website can't sign you out.
- An idea sent from the report button carries only its words, picture, page and version; the browser, screen, game details and server log go with problems only.

## 1.41.0 — 2026-11-04

Naming a card (Phase 9).

**For whoever runs the server**
- Nothing to do: no database update.

**Naming a card** (Pithing Needle, Phyrexian Revoker, Meddling Mage)
- The question now sits beside the card asking, titled "Name a card" (or "Name a nonland card"), with the card's own words.
- The cards you can see that it may name glow on the table, and in an open graveyard: one click names one.
- A card it can't name says so when clicked: "Phyrexian Revoker can't name a land."
- The search is still there for any other card, and each result shows what it costs and what it is: "Goblin Guide {R} · Creature — Goblin Scout".

## 1.40.0 — 2026-11-04

Choosing a number, and the countdown in a second tab (Phase 9).

**For whoever runs the server**
- Nothing to do: no database update.

**Choosing a number**
- Choosing X (Fireball, Rolling Thunder) is now a dial: the number in large type with − and +, "Most you can pay", what it costs as you change it, how much mana you can make, and one button: "Cast Fireball with X = 3".
- A number you can't pay for right now is still allowed, and says so.
- Paying a kicker more than once (Everflowing Chalice, Comet Storm) uses the same dial: "Kick it how many times?" and "Each time costs {2} more."
- Paying energy (Harnessed Lightning) says what it does and how much you have: "Pay how much energy? ... You have 3."
- Each one shows the card's own words about the number.

**Splitting damage**
- A spell that splits its damage (Arc Lightning, Forked Bolt, Rolling Thunder) now lets you choose every target first, then split it in one window, like combat damage: each target with − and +, filled in to start, Done when nothing is left.
- You can't choose more targets than there is damage to give each of them at least 1.

**The countdown on your own spell**
- Only the tab in front counts down: a game left open in another tab never resolves your spell for you. Back in front, it starts again from 5.
- A paused spell stays paused until you resolve it.

## 1.39.0 — 2026-11-03

Your list of 13 game-screen fixes, the rest of it (Phase 9).

**For whoever runs the server**
- Nothing to do: no database update.

**Your own spell's countdown**
- The circle shows a pause sign. Click it and the spell waits ("Paused · Resolve when you're ready") until you click again. Clicking the words still resolves it at once.

**Casting and the stack**
- A card you cast no longer flashes in the stack spot while it's still flying there.
- A trigger being paid for shows the mana still owed under its words, counting down as you pay.
- Trigger words read as one paragraph, and one line under the stack says what's next: "Next: Pat's trigger · 2 on the stack".
- A trigger that resolves keeps its look, glows, then shrinks into the card it came from.

**Questions and buttons**
- Choosing a target says what it's for and what comes next: "Wirewood Symbiote: Untap target creature. Next, you'll pay its cost: return an Elf you control to its owner's hand."
- Paying mana is plainer: "Pay the mana", "Use {R} you already made (1 left)", a land's button is just its name, "Pay 2 life instead (you have 20)".
- A card's abilities read more cleanly: the mana cost in its own column, the words as one paragraph, "Play this land".
- A card's ability menu always opens fully on screen, even for a card at the far left.
- No more long dashes in the game's own words (card text keeps its own).

**Cards you can choose**
- What you can choose now breathes with a soft gold glow, instead of a dashed outline and a CHOOSE tag.
- A creature you've selected to attack or block shows a gold seal with a check on its corner, with how many from a pile ("2").
- Cards in a tray have more room round them, so a chosen card's outline and number always show.

## 1.38.0 — 2026-11-03

Who did it, and what they did (Phase 9).

**For whoever runs the server**
- Nothing to do: no database update.

**Searching, looking at and moving cards**
- When a player searches their library, looks at or reveals the top of it, puts cards back in order, scries or surveils, puts cards from their hand back on top, looks at your hand, makes you discard, or puts cards from a library into a graveyard, the other player is told.
- The tray shows the player's picture and name and the card they used ("Pat · Demonic Tutor"), then says the whole thing in one sentence: "Pat searched their library and put a card into their hand, then shuffled."
- It's in your own words: "Pat looked at your hand and chose Savannah Lions for you to discard."
- The player who made the choices isn't shown it again: after your own Goblin Ringleader you see nothing extra. When the other player chooses (Mind Rot: they pick what to discard), you're told what they discarded.
- Their seat glows while the tray is open.
- Cards only show face up when you're allowed to know them (your own, ones revealed to you, or ones that went somewhere public). Anything else is a face-down card back.
- Before, most of these said nothing to the other player, and the rest only named the card ("Goblin Matron revealed:").

## 1.37.0 — 2026-11-03

Idle rooms close, and nobody waits forever for a missing player (spec 0054).

**For whoever runs the server**
- Nothing to do: no database update.
- Four optional settings, in minutes: `PROXIC_ROOM_ALONE_MINUTES` (30), `PROXIC_ROOM_TOGETHER_MINUTES` (120), `PROXIC_AWAY_MINUTES` (10) and `PROXIC_ROOM_WARNING_MINUTES` (5). Leave them out to keep these.

**Rooms in the lobby**
- A room closes after 30 minutes with nothing happening while the host is on their own (an invite may be waiting), or after 2 hours once a second player has joined.
- Chatting, picking decks, readying up, joining or changing settings all count as something happening.
- 5 minutes before it closes, the room says "This room closes in 5 minutes" with a Keep it open button.
- If the host goes offline for 10 minutes, the room closes and the other player is told why. A refresh or a short Wi-Fi drop doesn't lose it.
- If the guest goes offline for 10 minutes, they're taken out of the room and the host keeps it.
- The old rule that kept an idle room for a whole day is gone.
- The admin page shows when each room closes.

**In a game**
- A game is never ended by a timer.
- If the other player has been offline for 10 minutes, the player still at the table sees "Pat has been gone 10 minutes" with Keep waiting or End the game. Ending it counts as Pat conceding, so the player who stayed wins.

## 1.36.0 — 2026-11-03

Attacking and blocking (Phase 9 W-14).

**For whoever runs the server**
- Nothing to do: no database update.

**Attacking and blocking**
- Click your creatures to select them, then click what they attack (the other player, a planeswalker or a battle) or what they block. Every selected creature goes there, and a line shows where each one is going.
- This works the same for every attack and every block, even when there is only one thing to attack.
- On a pile of identical tokens, each click selects one more (the pile shows "✓ 2"). Pointing them at a pile of attackers puts one blocker on each.
- "All attack" now selects every creature that can attack; you then click the target.
- While creatures are selected but not pointed at anything, the Attack or Block button says "2 selected · click what they attack" and can't be pressed, so you never skip combat by mistake. Click them again, or press Esc, to unselect.
- The "Block how many of these?" box is gone.
- Ten Goblins attacking someone with a planeswalker out is now "All attack", a click on the target and Attack, instead of ten questions.

## 1.35.0 — 2026-11-03

The start of the game, and what a card can do (Phase 9 W-15 and W-16).

**For whoever runs the server**
- Nothing to do: no database update.

**The start of the game**
- Play or draw is two big buttons: "Play first: you're a turn ahead" and "Draw first: you're a card ahead".
- Your opening hand is laid out across the table, every card big enough to read, with how many lands it has, and Keep 7 / Mulligan under it.
- To put cards back after a mulligan, click them (they drop and grey out), then Keep.
- A Leyline in your opening hand has a "Start in play?" tick on the card.
- Mulligans are public: the other player sees "Mulliganed once" while you choose.
- The turn track says "Before the game" instead of "Turn 0".

**What a card can do**
- Clicking a card with several abilities shows its name and picture once, then each ability with its cost first and large: a planeswalker's +1 in green, −3 in red, or the mana.
- Abilities it can't use yet are shown greyed with why, such as "Needs 7 loyalty (it has 5)", "already used this turn" or "It's tapped".
- A card you can't play right now says why in the same panel, until you close it.
- A planeswalker with only one usable ability no longer uses it on a single click when others are greyed: the menu opens instead.

## 1.34.0 — 2026-11-03

Graveyard, exile and the close-up (Phase 9 W-18 and W-19).

**For whoever runs the server**
- Nothing to do: no database update.

**Graveyard and exile**
- Clicking a graveyard or exile pile opens the cards as pictures, newest first, with copies shown once ("Mountain ×4").
- Tabs switch between your graveyard and exile and the other player's, each with how many cards it holds.
- In exile, each card says why it's there: "You may play it", "Exiled by Light Up the Stage", or a suspended card's time counters.

**The close-up**
- A creature changed by counters or equipment shows its printed power and toughness crossed out next to what it is now (2/3 → 4/5).
- It also says whose card it is, what's attached to it (or what it's attached to), and its state: tapped, new this turn, attacking, blocking.

**Fixed**
- Opening a card's close-up from the graveyard or exile list showed it behind the list. It now opens on top.

## 1.33.0 — 2026-11-03

The stack, readable (Phase 9 W-20).

**For whoever runs the server**
- Nothing to do: no database update.

**Spells and abilities waiting to resolve**
- Each one on the stack is its whole card, big enough to read without pointing at it, at the right edge of the table.
- A trigger or ability shows its own words on the card ("Trigger: At the beginning of combat on your turn, create a 1/1 red Goblin..."), so you can tell which of a card's abilities it is.
- Older ones fan out above it, each showing its name and some art. Point at one to bring it to the front.
- While you're choosing something on the table (a target, mana to pay, attackers), the stack steps back to its old smaller size so it never covers what you need to click.
- A card being cast still shows large in the middle while you pay for it, then moves to the stack.

**Fixed**
- "Let it all resolve" sat on top of the opponent's corner at the top of the right-hand column. It now sits just above the main button.

## 1.32.0 — 2026-11-03

Each printing of a card keeps its own picture (spec 0053).

**For whoever runs the server**
- Nothing to do: no database update.

**Your printings, as you chose them**
- A deck with four different Mountain pictures (like the Duel Decks: Elves vs. Goblins decks) now shows all four: on the deck page, on the table and in the close-up. Before, every Mountain showed the first one.
- The same for any card you hold in more than one printing, such as two different Lightning Bolts.
- Send the deck again from the Proxic Deck Builder 1.4.3 to get its pictures; a deck sent before keeps the pictures it has.
- No rule changes: a card plays exactly as before. What changed is that a deck holding several printings of one card keeps each printing in the game, so each card looks like the one you chose.

## 1.31.0 — 2026-11-02

The end of a game, and whose move it is (Phase 9 W-24 and W-25).

**For whoever runs the server**
- Nothing to do: no database update.

**Game over**
- A banner across the table says who won, in large letters (gold when it's you), with why and the turn underneath, said once.
- Back to the room takes you to your room, where you are both still seated with your decks chosen.
- Look at the board puts the banner away so you can see how the game ended; the button in the right-hand column then takes you back to the room, and Show the result brings the banner back.
- Someone watching sees "Pat won", never "You won".

**Waiting for the other player**
- The right-hand column says "Pat's move" in plain letters, never broken over two lines, with what Pat is doing underneath: choosing blockers, deciding on your spell, or the step of the turn.
- Pat's corner at the top of the column glows softly while you wait for Pat.

## 1.30.0 — 2026-11-02

Card pictures are kept between games, and pictures nothing uses are
cleaned up.

**For whoever runs the server**
- One database update, made by itself on start: each picture can remember when it stopped being used.
- Once a week, starting 10 minutes after the server starts, Arena deletes pictures that no deck and no game in progress has used for 30 days, and files left behind by failed sends. Nothing a deck still uses is touched. Each run says in the server log what it deleted and how much space it freed.

**Pictures kept between games** (spec 0052)
- Each card picture now has one address, the same in every game and on every deck page, so your browser keeps it. Your second game against the same deck shows its pictures at once, without downloading them again, close-ups included.
- Only signed-in players can load a picture, and Cloudflare keeps no copies.
- When you stop sharing a deck, the other player loses the deck as before. A card picture they had already seen keeps loading, since it's just the public card image.

## 1.29.0 — 2026-11-02

One look for every notice, on every page and in a game.

**For whoever runs the server**
- Nothing to do: no database update.

**Notices** (spec 0050, owner item 6)
- Every notice is the same card, top right of every page: invitations, requests to join, room news, problems, the connection and new versions. The Lobby's pop-ups and the strip in the top bar are gone.
- An invitation or a request to join stays until you answer it. Close it with × to answer later from the Lobby.
- News ("Pat declined your invitation", "The host closed the room") fades after 8 seconds, and waits while you point at it.
- Problems ("Your deck needs attention") stay until you close them, and now say in full what's wrong.
- Several at once no longer hide each other: the newest three show, and the rest wait as "+N more".
- "Signed out" has a Sign in again button.
- When Proxic Arena is updated during a game, the Reload notice waits until the game is over.
- An invitation or a request to join plays a soft chime and shows "(1)" in the browser tab. A Sounds switch on the Account page turns the chime off.

**In a game** (Phase 9, the game's messages and warnings)
- The game's own messages (a coin flip, a card revealed, a choice the opponent made) are small cards top right of the table instead of over your creatures. Clicks go straight through them.
- "Reconnecting to the game" is the same kind of card, and goes by itself once the connection is back.

## 1.28.0 — 2026-11-01

Decks of up to 100 cards, sent as light pictures, and each card's own art
on the table.

**For whoever runs the server**
- One database update, made by itself on start: each deck can keep its cards' art crops.
- Once, in the background after the update, the pictures already stored get a lighter table copy. Nothing stored is deleted except the old heavy table copies it replaces.

**Bigger decks** (spec 0051)
- Decks may have 60 to 100 cards (it was 60 to 65). Up to 4 copies of a card and unlimited basic lands, as before.

**Lighter pictures** (spec 0051)
- Arena now takes the light card pictures the Proxic Deck Builder 1.4.1 sends: a 100-card deck is about 30 MB instead of up to 150 MB, well under the upload limit.
- The small picture each card wears on the table is about 60 KB instead of 340–555 KB, so the board loads faster.
- Decks sent by older Deck Builders keep working as they are.

**Each card's own art on the table** (spec 0051)
- The art window on a card shows the card's own art, cut by Scryfall, instead of a zoom into the whole card. Old-frame, borderless, showcase, saga and planeswalker cards no longer show slivers of their frame or text box.
- Decks sent before this keep the zoom until they are sent again from the Deck Builder.
- Looking at a card up close still shows the whole card.

## 1.27.0 — 2026-11-01

Smoother casting and combat, hovering flyers, the belt's 7-day rule and
an Admin clean-up, and every card keeps its own picture.

**For whoever runs the server**
- One database update, made by itself on start: the Belt's resets are kept with their dates.

**Casting and combat** (owner items 2, 4 and 5)
- A creature nobody can answer now flies straight from the big cast card to its place on the battlefield, with no blink.
- The big card for a spell being cast slides aside toward the stack when it would cover something you can click, like your lands.
- Combat damage among several blockers is assigned in one tray with + and − on each blocker, lethal marked, and trample to the player when allowed.

**Motion on the board** (owner item 3)
- Flying creatures hover and sway gently; a creature that just came in shows a small "zZz" until it can attack. Tapped cards still tilt 5°.

**The Belt and the Admin page** (spec 0048)
- The Champion's Belt holder must finish a game every 7 days (was 14). The Hall shows "Defend by …" with a bar, and the holder gets a lobby reminder 2 days before.
- Admin has a new "Belt and records" tab: Reset the Belt (type RESET), and delete one player's games, games before a date, or a fresh start that keeps accounts. Each shows exactly what it will delete and needs PURGE typed.

**Every card wears its own picture** (spec 0049)
- A creature you take with Control Magic, Threaten or Act of Treason keeps the picture from its owner's deck. It used to show no picture, or the thief's own copy of the same card.
- A spell cast from an opponent's library shows its owner's picture on the stack.
- Pictures now show in an opponent's hand when the game lets you see it, and when you look at a card in a graveyard or in exile.

## 1.26.0 — 2026-11-01

The cards only you see -- putting them back in order, scry, searching
your library, Fact or Fiction -- in one tray, as pictures.

**Cards you handle alone** (Phase 9 group 3, owner 2026-11-01)
- Putting cards back in order (Ponder, Sensei's Divining Top): click them in the order you'll draw them; each gets a gold number. Click a numbered card to take it back.
- Ponder: Done keeps your order and skips the shuffle question; "Shuffle instead" shuffles, in one click.
- Impulse's other cards go to the bottom with "Any order", and are no longer asked as "which do you want to draw first?".
- Brainstorm: the two cards you put back show their number in your hand as you click them, and their order isn't asked again.
- Scry and surveil: two rows, top and bottom (surveil: top and graveyard). Click a card to move it across; the ones on top are numbered in draw order, "Sooner" moves one up. The old box in the middle of the table is gone.
- Searching your library: one picture per card with how many ("×4"), lands last, a search box and Spells / Lands. Impulse's four and an opponent's hand (Thoughtseize) show every card; the ones you can't take are dimmed with why ("a land").
- Fact or Fiction: the opponent clicks cards between Pile 1 and Pile 2; you see both piles as pictures with "Take this pile".
- Every card in these trays has its name under it, and the game's internal numbers ("Island (69)") are gone.
- The gear, Report and "List choices" in the bottom-left corner always stay above a tray, however wide it is.
- Fixed: these windows sometimes named the wrong card -- "Sensei's Divining Top" on an Evolving Wilds, "Fact or Fiction" on an Impulse. They now name the spell that's resolving.

## 1.25.0 — 2026-11-01

Seven reports from real games, answered: the spell being cast gets out of
the way, the game says what happened and why, lands show their mana, and
friends can watch.

**For whoever runs the server**
- One database update, made by itself on start: rooms remember whether people may watch their game.

**The card being cast, out of the way** (spec 0044, owner 2026-10-31)
- When a spell asks you to pick something on the table (a target, a creature to sacrifice), the floating card moves beside the stack, so the creatures in the middle can be clicked.
- Your opponent sees the card face down while you pay for it ("RudeLeft is casting a spell…"); once it is cast it turns over with a flash and flies to the stack.
- Optional costs asked while the card is still in your hand ("Bargain?") show the card too.
- The floating card now wears its picture; it never had one before.

**Seeing what happened** (spec 0045, owner 2026-10-31)
- Counters show on their card. Point at them for where they came from: "+1/+1 from Ajani's Pridemate's trigger: RudeLeft gained 1 life (Soul Warden)".
- The Library tile turns gold at 3 or fewer cards and red at 0: "Empty: your next draw loses the game". The game-over box says why: "Pat lost: had to draw from an empty library".
- Cards a spell reveals (Goblin Ringleader) show face up in a tray, to everyone they were shown to, each marked where it went: "→ hand", "→ bottom of library". It replaces the line of text that faded away.
- Right-click a trigger on the stack: its card large, what it does, why it triggered, its target, whose it is and its place in the order. Point at a stack card to read what it does.

**What each land makes** (spec 0046, owner 2026-10-31)
- Every land shows its mana as symbols: Plains {W}, Hallowed Fountain {W}{U}, Wastes {C}. Read from the land as it is now, so under Blood Moon a Fountain shows {R}. A land that makes no mana itself (Evolving Wilds) shows none.

**Watching games** (spec 0047, owner 2026-10-31)
- Rooms have "Let people watch" when opened, on to start. A room playing a game shows **Watch** in the lobby, or "Players said no watching".
- A spectator sees the table -- both battlefields, graveyards, exile, the stack, life and how many cards each player holds -- never a hand's cards, a library or anything face down, and is never asked anything. "Stop watching" leaves.
- The players see how many are watching, above the turn.
- Not yet: spectators do not see the game's chat.

## 1.24.0 — 2026-10-31

Every question in the game now asks beside the card it is about, spells
float in the middle while you pay for them, and trigger storms are calm.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**Every question beside its card** (Phase 9 group 2, owner 2026-10-30)
- Choosing a target, a creature to sacrifice or anything else on the table: a small window beside the card asking, while you click on the table.
- Choices the table can't show (a mode, a colour, a number, a card type) are buttons in that window, or in a tray along the bottom when there are many, with a search box past a dozen.
- "List choices" opens a tidy tray grouped by card, with copies of one card shown once as "×N".
- Mana shows as mana symbols everywhere in the game's words, never letters and numbers.

**Casting in the middle, and take-backs** (spec 0042, owner 2026-10-30)
- A card you cast floats out of your hand to the middle of the table, large, with sparks in its colour and its cost underneath, each symbol lighting up as you pay. Cast, it flies to the stack or the battlefield; cancelled, back to your hand. Your opponent sees it too.
- Cancelling a spell and casting it again now works.
- Clicked the wrong attacker or blocker? Click it again to take it back; the line between attacker and blocker still shows who blocks whom.
- An optional cost asks as itself ("Bargain?"), with "No" to cast without it.

**Calmer trigger storms** (spec 0043, owner 2026-10-31, after a Goblin mirror)
- A trigger that asks you to pay mana (Skirk Drill Sergeant) asks first: Pay, Skip, or Skip all of them. If you can't pay, it isn't asked at all.
- Copies of one trigger on the stack show as one card "×N".
- Ordering different triggers opens already numbered (damage first, payments last); press Done straight away or reorder.
- "Let it all resolve" passes until the stack is empty, and stops if anything new is added.

**Names and passwords** (spec 0041, owner 2026-10-30)
- Display names are required and at most 12 characters, and show in full everywhere: where a place is narrow, the name gets smaller instead of being cut. Names already longer stay as they are until changed.
- Making an account, choosing a new password and changing it on the Account page show each rule turning green as it is met, with a "password again" box and a short list of what is still missing.
- The lobby's "Checking both decks…" box now matches the box it replaces.

## 1.23.0 — 2026-10-30

Many triggers at once in two clicks, a new look for the game's questions,
and the screens Proxic Arena is made for.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**Many triggers at once** (Phase 9 group 1, owner 2026-10-30)
- Seven Goblins die with Boggart Shenanigans out: two clicks instead of twenty. Copies of one trigger no longer ask which resolves first; the first copy asks for its target in a window beside the stack, with "Same target for all 7" ticked; the first yes offers "Yes to all 7", "Just this one" or "No".
- Different triggers at once (a Boggart Shenanigans and a Goblin Arsonist) show their cards in a tray along the bottom, each card large enough to read: click them in the order they should resolve, the first one clicked resolves first. Copies of one trigger are one card, "×7" -- also the same trigger of several copies of a card (three Goblin Arsonists dying together).
- Every yes-or-no question ("Use Boggart Shenanigans?") is now a window beside the stack, showing the card asking and what it would hit, with one gold answer button.
- The new windows fade while you hold Space, so you can see the table under them.

**Supported screens** (owner 2026-10-30)
- Proxic Arena is made for desktop and laptop screens 1920×1080 and bigger, up to 4K and ultrawide. Smaller screens, phones and tablets may work but are not supported or tested.

## 1.22.0 — 2026-10-30

A tidier battlefield: each kind of card on its own lines, busy boards
kept in order, and tapped cards no longer lose their corners.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**A tidier battlefield** (spec 0040, owner 2026-10-30)
- Each kind of card has its own lines across the whole table: creatures nearest the middle, then artifacts, enchantments and planeswalkers, then lands at your edge. Lands, creatures and the rest never share a line any more.
- When a side fills up, cards overlap but always show at least half of themselves (name, picture, power and toughness). A crowded kind takes a line nobody else needs: a creature horde uses the empty artifacts line instead of shrinking.
- Only then does that side's cards shrink, all together, in steps (90%, 80%, 75%, 70%). Each side is sized on its own, so your opponent's busy board never makes yours smaller, and cards grow back only when there is clear room.
- Tapped cards tilt a gentle 5° and are never cut: their corners used to be trimmed off at the edge of their row.

## 1.21.0 — 2026-10-29

A Report button on every page: tell us about a problem or suggest an
idea, with everything needed to find the cause sent along.

**For whoever runs the server**
- One database update, made by itself on start: a table for reports. Reports' files are kept in the data folder under `bug-reports/`, until an administrator deletes them.

**Report a problem or an idea** (spec 0039, owner 2026-10-29)
- A Report button on every page, beside Sign out, and in a game beside the gear.
- Report a problem: where you were, what part of the game, which cards, what happened, what you expected, how much it got in the way. A picture of your screen is taken when you press it (untick to leave it out, or add your own).
- A problem report also sends what your screen did in the last 15 minutes and, from a game, that game's full record, so the cause can be found. The game carries on while you write.
- Suggest an idea: in a few words, what you would like, what it would help with, how much it would matter.
- Admin › Reports lists them with a red count of new ones: open one to read the answers, see the picture and the logs, set its status (New, Seen, Fixed, Won't fix, Planned), keep a private note, delete it, or download it all as one zip.

## 1.20.0 — 2026-10-29

A tidier right-hand column: everything evenly spaced, and a tray for
each player showing floating mana, counters and markers.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**The right-hand column, evenly spaced** (spec 0038, owner 2026-10-29)
- The player plates, the turn's steps and the action button are spread evenly down the column; nothing is squeezed in the middle any more.
- Each player has a status tray beside their plate. Tap five Mountains and an Island and it shows the real mana symbols, red 5 and blue 1, while the mana floats.
- Counters (poison, energy, experience...) show there as chips with their numbers; held markers (Monarch, the initiative, the city's blessing, the Ring) in gold; the command zone (an emblem, the Ring, a dungeon) in purple, listing what is there when clicked.
- The plates never grow any more: before, a long line of counters could push your plate off the bottom of the screen.

**The Hall** (owner 2026-10-29)
- A name beside a trophy is never cut off: on a laptop screen, one too long for its space now takes a second line instead of ending in "…". Hover it for the whole name.

## 1.19.0 — 2026-10-29

Big boards made readable: identical cards stack, blockers sit on the
attackers they block, and a whole stack can block a stack in two clicks.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**Identical cards stack** (spec 0036, owner 2026-10-29)
- Any identical cards now stack into one card with a count, not only basic lands and tokens: four Grizzly Bears show as one card "×4".
- Any difference splits a stack: tapped or not, attacking and at whom, power and toughness, abilities like flying, counters, damage, summoning sickness, token or real card. Four with flying and four with deathtouch are two stacks of four.
- At most 15 to a stack: 40 Goblins show as ×15, ×15 and ×10.

**Big combats** (spec 0037, owner 2026-10-29)
- A blocker now sits on the attacker it blocks, marked BLOCKING, instead of a blue line across the board. Identical blocked pairs stack too.
- A blocked attacker no longer draws its orange line to you: it is hitting its blockers.
- Block many at once: click a stack of your creatures, then a stack of attackers, and choose how many to block in the "Block how many?" box. Single cards still block one at a time.

## 1.18.0 — 2026-10-29

The game moves faster and asks better: one rule for when the game stops
for you, with new chances to act at the moments that matter, and an
action button that says what happens next.

**For whoever runs the server**
- One database update runs by itself on start: everyone's saved stop settings are deleted (there are none any more).

**One rule for when the game stops for you** (spec 0035, owner 2026-10-29)
- The Stop options are gone from the game menu, and so is "Skip to end of turn". One rule for everyone: the game only stops for you when you hold something you could play and the moment can matter.
- New chances to act that the old settings skipped: your opponent's end step (flash in a creature, cast a draw spell), before they attack (kill a creature before it swings), the one step a card of yours only works in ("only during your upkeep"), and sacrificing to Ashnod's Altar and the like in answer to a spell.
- The countdown on your own spell or trigger now runs 5 seconds, with the same rings round the button and the card. Clicking the button resolves it at once; clicking a card you could play still stops it.

**The action button and the turn's steps** (spec 0034, owner 2026-10-29)
- The action button says more: where a pass really lands ("Nothing can attack · to Main 2"), where your opponent goes next, whose spell resolves and at what ("Pat’s Lightning Bolt → you"), the power coming at you and the power that gets through, and who won.
- While you wait it says what your opponent is doing when the screen shows it ("Pat is choosing blockers").
- A new look for the button: dark and rounded with a gold edge and a coin that shows what pressing does (an arrow, a sword, a shield, an X, or the countdown's seconds). Combat is red, Cancel silver.
- The turn's steps are gems on a rail. The bright gem slides smoothly to the step the game is in; at a new turn the steps dim and it starts again from the top.
- The line above the steps reads "Your turn" or "Opponent’s turn".

## 1.17.0 — 2026-10-29

The table dressed up: the green battlefield becomes lit velvet, and your
opponent's hidden cards show the Proxic card back.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**The battlefield as lit velvet** (spec 0033, owner 2026-10-29)
- The green table has a brushed-velvet texture, evenly lit, with a deep shadow and a faint gold rim round its edge.

**The Proxic card back** (spec 0031 Amendment 1, owner 2026-10-29)
- Your opponent's hand at the top of the board shows the Proxic card back, turned round as if held across the table.
- Face-down cards on the table (a morph, a manifest) show the same back.

## 1.16.0 — 2026-10-28

A new look for the game screen: the stack fanned out so every card shows,
player plates with pictures for library, graveyard and exile, the turn's
steps beside the plates, your opponent's hand along the top, the font
Magic cards use for their names, and a new life banner.

**For whoever runs the server**
- Nothing to do: no database updates and no new settings.

**Account page** (owner, 2026-10-28)
- Changing your email address no longer asks for your password. The old address is still told.
- The gold ring around the avatar you've chosen fits the picture instead of stretching into an oval.

**Game screen** (owner, 2026-10-28)
- The chat icon by the gear is gone. The Game chat tab on the left edge pulses when the other player says something.
- The player panels show just the name and the Champion's Belt; "Opponent", "You" and "active turn" are gone (the gold ring on the life total still shows whose turn it is). The picture wears the same gold, silver or bronze ring as in the lobby.
- The graveyard count fits in its box, two digits included.

**Player plates** (spec 0029, owner 2026-10-28)
- Each player in the game's right-hand column sits on a raised plate: picture with its Hall ring, name and Belt, life in a red banner.
- Hand, library, graveyard and exile are big tiles with an icon, a large count and the word. Whose turn it is: the plate's top edge and the banner turn gold.

**Card-title font and life banner** (spec 0032, owner 2026-10-28)
- On the game screen, card names and type lines, power/toughness, counts, player names, the life total and the big words are in the font Magic cards use for their names. Everything else, and every other page, keeps its current font; no wording changed.
- The life total sits in a new banner: a gold frame, red velvet and rubies. It glows gold on that player's turn.

**Belt mark and zone pictures** (spec 0031, owner 2026-10-28)
- The small Champion's Belt beside the holder's name is a new gold belt, drawn bolder so it reads at that size. The Hall of Champions keeps its big belt.
- The Library, Graveyard and Exile tiles on the player plates show new pictures (card backs, a tombstone, a portal) faded behind the count. Library runs across the top of each plate, Graveyard and Exile side by side beneath.
- Your opponent's hand is drawn at the top of the board as card backs, the mirror of yours at the bottom. A card they've shown you is face up there; click it to look.

**The turn ladder** (spec 0030, owner 2026-10-28)
- The steps of the turn moved from the bar across the top of the board to a ladder between the two player plates: the turn number, whose turn it is, then Untap to Cleanup, top to bottom.
- The step the game is in is gold and the steps already passed are dimmed; in combat it also says Attackers, Blockers or Damage. The top of the board is left to the cards.

**The stack as a cascade** (spec 0028, owner 2026-10-28)
- Every spell and ability on the stack shows, fanned at the right edge of the board so each name is visible, numbered in the order they resolve.
- Your cards are edged gold and your opponent's red, with the caster's picture beside each. Point at one to see what it targets; click it for a close look.
- An ability has a faint line back to the card it came from. Resolving, a card glows, a spark runs to its target, then it leaves.
- When you are asked to respond, a ring round the front card counts down the two-second auto-pass.

## 1.15.0 — 2026-10-28

Password resets by email, every linked computer on the Admin page, 132
new avatars, and a new invitation email.

**For whoever runs the server**
- Three database updates run by themselves on start: email addresses on
  accounts and password reset links, the address a linked computer last
  connected from, and room for 132 avatars.
- Password resets send with the email account on the Admin page's Email
  tab. No new settings.

**Password resets by email** (spec 0026, owner 2026-10-28)
- The Admin page no longer sets passwords. **Send password reset** emails the player a link that works once, for an hour, and they choose their own password.
- Each account has an email address: the one it was invited with, or one added on the Account page (it asks for your password) or by an administrator.
- After every password change, the player gets a "Your password was changed" email.

**Linked computers on the Admin page** (spec 0027, owner 2026-10-28)
- A new **Computers** tab lists every computer linked to the Deck Builder: whose it is, its name, when it was linked, and when and from where it was last used.
- **Remove** asks first, then ends that computer's link. The player's decks already on Arena stay.
- Each account shows how many computers it has linked, and Manage → **Linked computers** opens just theirs.

**Avatars** (owner, 2026-10-28)
- A new set of 132 avatars replaces the old 50. A player who had chosen one keeps its number, so it shows the new picture with that number.
- On the Account page the avatars fold away: **Choose an avatar** opens them, and picking one saves it and folds them again.

**Password reset page** (owner, 2026-10-28)
- The page no longer shows whose account the link is for.

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
