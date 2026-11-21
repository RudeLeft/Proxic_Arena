# Player words

The rules every word a player reads in a game follows: the windows, the
play log, the act button, the close-ups, the status tray and the
screen-reader text. Owner decisions 2026-11-19b (item 3) and 2026-11-20
("Keep as printed"); built by spec 0113 (the game screen) and spec 0114
(the player pages, the server's sentences a player reads, and the emails).
Spec 0115 applies them to the admin pages, the Admin API's sentences and
`arena-admin` with a lighter touch (below).

## The rules

- **Spelling: "color".** American, as on the cards: "color",
  "colorless", "gray". Never "colour".
- **Numbers.** Counts of one to ten in a sentence are words: "two
  cards", "three time counters", "Put two charge counters on Pentad
  Prism?". Bigger counts are digits: "12 Goblin tokens". Printed game
  terms and game values keep their digits: "Scry 2", "Crew 3", "Ward 2",
  "Main 1", "deals 3 damage", "20 life", "3/3", a die's "4", "X = 3" on a
  dial.
- **Articles.** "an Island", "a Forest", "the other card": a card that
  is a kind of thing (a basic land) takes "a" or "an"; a card's proper
  name takes none ("putting Goblin Matron into their hand").
- **Dashes.** Our own sentences never use one: no em or en dash, no
  " -- ", no spaced hyphen " - ". Two exceptions, both printed:
  - the type line keeps its dash, as printed: "Creature — Human Knight";
  - printed card text quoted in a label or window keeps its own dashes:
    ability words ("Landfall —"), "Choose one —", keyword costs
    ("Ward—{2}", "Suspend 4—{U}").
- **" · "** only between separate facts on a button or label
  ("Lightning Bolt · {R}", "Away · 3 min"), never inside a sentence:
  "Nothing can attack. On to Main 2.", not "Nothing can attack · to
  Main 2".
- **No code words.** No card numbers ("Grizzly Bears (68)"), no "(s)",
  no braces read aloud ("Tap: add one red mana.", never "left brace T
  right brace"), no Forge labels ("Damage Source:", "Zone Changer:"), no
  enum or id names ("First_strike", an `actionId`), no "Seat 2" for a
  player, and never the word "Forge" (admin and logs are exempt).
- **Screen-reader and alt text** follow the same rules: mana in words
  ("one generic and two red"), counts in words ("Bob's hand, seven
  cards").

## Where the rules live in code

- **The helpers.** Worker: `PlainWords.number`, `PlainWords.count`,
  `PlainWords.some`, `PlainWords.withArticle`, `PlainWords.and`
  (`forge-worker/.../game/PlainWords.java`, on Forge's
  `forge.util.Lang`). Page: `numberWord`, `countWords`, `someWords`,
  `ordinalWord`, `timesWord`, `andList`, `manaWords`, `symbolWords`,
  `manaTextWords` in `frontend/src/words.ts`. Every sentence builder uses
  them; none keeps its own number table.
- **Safety net 2, the worker cleanup.** `PlainWords.tidy` runs on every
  player-visible string the worker sends that holds Forge's pass-through
  words, after our own rewrites: `WorkerMain` (a question's prompt,
  labels, refusal, reasons, `about`) and `GameHost.tidyTexts` (every
  board: report window, reveal tray, stack, play log, notices, passing,
  moves, command list). It strips " (N)" card numbers (digits only: a
  card's own name in brackets, "Hazmat Suit (Used)", is kept, read from
  Forge's cards by `GameHost.namesToKeep`), fixes "(s)" by the count
  beside it, turns a joining " - " into ": " (a type line's into the
  printed "—"), collapses spaces and trims. Forge's English file is never
  edited (VEND-001); Forge's own question templates are reworded in
  `PlainWords.forgeWords`.
- **Safety net 1, the CI check.** `scripts/check-wording.py`, run in
  ci.yml over every Mechanics Lab trace: it reads every player-visible
  text field of the game frames (never Forge's `GAME_LOG`), with card and
  player names as placeholders, and fails on a dash outside the type line
  and quoted card text (matched against the card's own Forge script and
  the printed fields the frames carry), " (N)", "(s)", a double space,
  "colour" and "Forge". `--self-test` has one case per rule.
- **Safety net 3, the source sweep** (spec 0114). `scripts/check-wording.py
  --source`, run in ci.yml's checks job: every string of the player pages
  (`frontend/src`, read with the frontend's own TypeScript by
  `scripts/page-strings.mjs`), every server string
  (`server/src/main/kotlin`) and the worker's deck-check words
  (`ForgeRuntime.Resolution`), with the same rules (no dash outside the
  type line, no "(s)", no "colour", no "Forge"). Admin pages and
  `arena-admin`, logs, exception messages, comments and code (class
  names, SQL, CSS, imports) are left out; `check_source` lists them.
- **The server's helpers.** `PlayerWords.number`, `PlayerWords.count`,
  `PlayerWords.waitWords` ("about 15 minutes", "a minute", "a few
  seconds") and `PlayerWords.megabytes`
  (`server/.../proxic/PlayerWords.kt`). A worker's deck-check reason is
  never passed on: `CardResolution.wordsFor` gives fixed words by its
  status ("Arena doesn't know this card yet.").
- **Admin pages and owner-only text (spec 0115, the lighter touch).** The
  same rules, except that the word "Forge" is allowed (admin and logs are
  exempt) and the compact short forms in admin tables and chips are kept
  (owner 2026-11-20, "Keep short forms"): "3h ago", "2d 5h", "in 2 h",
  "Pat vs Sam". No enum or exception class names, no "(s)", no server
  `detail` glued into the page's own sentence. A stored failure code is
  sent as the code and worded by the page (`admin.ts` `REASON_WORDS`,
  "Problem (CODE)" in the tooltip as the last resort); the worker's own
  failure detail stays in the server log. The admin pages stay outside the
  CI source sweep (`check_source`).
- **PROTO-006.** No page behaviour and no test locator hangs on these
  words: tests read the words from a window's role and assert them; they
  find things by role or data attribute.
