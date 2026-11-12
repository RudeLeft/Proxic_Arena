# Protocol

The wire contract between the browser and the Arena Server.

`PHASE_01` §1.31–§1.33. Phase 1 defines **infrastructure messages
only** — no Magic concepts. Game messages arrive in Phase 6.

## Why fixtures exist

`fixtures/` holds canonical JSON for the four infrastructure messages
(`hello.json`, `ping.json`, `pong.json`, `error-protocol-mismatch.json`).
**Both the Kotlin and the TypeScript test suites parse the same files.**
If one side's model drifts from the other, a test fails rather than a
game breaking at runtime. Its folders are test decks (each with a
README, except `goblin-deck`, which `match-stolen-picture.spec.ts`
describes), not messages; the match and lobby messages are proven by the
tests named in `docs/architecture/MATCH_PROTOCOL.md` and
`LOBBY_PROTOCOL.md`.

## Envelope

Every message the SERVER sends carries:

```text
protocolVersion   on the foundation socket a mismatch fails loudly
type              what this message is
messageId         identity; duplicate/stale rejection depends on it
```

The browser's lobby and match frames carry only `type` and their
fields, and the pages check `protocolVersion` only on the foundation
socket and `/api/version`.

The infrastructure messages put the rest under `payload`. Lobby and
match messages are flat: their fields sit beside `type`
(`{"protocolVersion":1,"type":"WATCHING","messageId":"…","count":2,"names":["Carol","Dave"]}`).

`messageId` is present from the first infrastructure message on
purpose. Phase 0A's decision gate rejects duplicate and stale
responses **by identity**, and proved that removing those guards let
203 answers in a single game be consumed as the answer to a question
they were not sent for. Identity has to exist before it can be
checked.

## Rules that outlive Phase 1

- Client behaviour must never depend on parsing human-readable text
  (§1.34, AGENTS PROTO-006). Branch on `errorCode`, never on `detail`.
- Object ids crossing this boundary must be **typed** — `card:51`,
  `stack:3` — because Forge's card and stack id spaces overlap
  (Phase 0A P0A-F).

## Searchable decisions (Phase 6, P6-AG)

Some questions offer too many answers to send. Naming any card
(Pithing Needle, Phyrexian Revoker, Meddling Mage) allows ~34,000
names. Owner decision 2026-10-20: **search, then pick** — the answer
is still one of Forge's options, chosen from results the server sent.

```text
server → browser  DECISION_REQUEST   searchable: true, optionCount: 34334,
                                     options: []   (none sent)
browser → server  DECISION_SEARCH    decisionId, query
server → browser  DECISION_OPTIONS   decisionId, query, total,
                                     options: [{actionId, label, cost?,
                                     types?}]  (best 50)
browser → server  DECISION_RESPONSE  decisionId, actionId   (as for any question)
server → browser  DECISION_SEARCH_REFUSED  decisionId, reason
```

Rules the server enforces, so a client cannot get round them:

- Only the player being asked may search, and only the question
  outstanding. A search is not an answer: nothing in the game moves.
- **The answer must be a name this player was sent** in a
  `DECISION_OPTIONS`. A guessed id is refused before Forge sees it,
  even when Forge would allow the name.
- Results are ranked exact match, then name-starts-with, then a word
  starts with, then anywhere -- judged at the text's first place in the
  name, so a name where it first appears mid-word ranks "anywhere" even
  if a later word starts with it; case and accents are ignored. `total`
  is how many matched; only the best 50 are sent.
- A query is trimmed and cut to 64 characters.

The worker holds every allowed name in its decision gate and checks
the answer against them as it checks any answer; the list itself is
Forge's (`streamAllFaces` filtered by the effect's own predicate).

## Faces and games (Phase 6, P6-BF, P6-AD)

Two snapshot fields a board must not derive for itself:

```text
card.face    Forge's state for a card with more than one face:
             Original, Backside (transformed), LeftSplit, RightSplit,
             Secondary (adventure), Meld, ...      absent for one face
card.faces   every face name, Forge's, front first
             e.g. ["Delver of Secrets", "Insectile Aberration"]
gameEpoch    which Forge game of the match: 1, then 2 after Karn
             Liberated restarts it. Also on every DECISION_REQUEST.
card.keywords  the keywords a card has NOW, Forge's titles, after every
             continuous effect -- under Humility a Serra Angel has none.
             Never derive them from printed text.
player.counters      every counter Forge keeps on a player: POISON, ENERGY,
                     EXPERIENCE... as {name, count}
player.designations  "monarch", "initiative", "city's blessing"
player.command       emblems, dungeons and cards in the command zone --
                     not Forge's internal effect pieces
dayTime      "day" or "night" once a daybound card has made it one
card.printing  "SET/NUMBER" Forge built the card from, e.g. "M10/242"
             (P6-BD). Only for a card this viewer may identify. A
             token has no real printing: Forge's token answers its
             placeholder set "???" (PaperToken), so a token's is a
             placeholder. Art is chosen by it first, then by name.
card.faceDown  true for a face-down permanent. For its controller it
             carries the REAL name (and `known`); for anyone else
             `name` is "Face-down", `known` false, and only what the
             rules make public: kind "creature", types, power,
             toughness, damage, sick/attacking/blocking, counters --
             the face-down 2/2's, never the real card's (P6-I).
exile        every player's exiled cards, described like any zone (a
             face-down exiled card stays "Face-down"). Where delve and
             Force of Will's payments go, and where an Adventure
             creature waits to be cast.
otherHands   OTHER players' hand cards Forge lets this viewer see --
             under Mindslaver the controlled player's hand, with a
             "play with your hand revealed" effect an opponent's.
             `seat` says whose. Hidden cards are never sent, not even
             as blanks. Spec 0070, Amendment 1: also each card Forge
             REVEALED to this viewer from that hand (Duress, Thoughtseize,
             "reveal your hand", a reveal cost, a revealed draw --
             PlayerController.reveal), face up and `seen: true`, until it
             leaves that hand (any zone change, even back into it,
             forgets it: worker SeenHands). Never to a seat it was not
             shown to, never in the public (spectator) view
hand[].seen  spec 0070, Amendment 1: another seat has seen this card in
             your hand (the eye), until it leaves your hand
```

- `face`/`faces` are sent only for a card this viewer may identify;
  a hidden card carries neither.
- Art follows the face SHOWN: a transformed card carries its back
  face's own picture when the deck brought one (spec 0008), and no
  `art` rather than the front's when it did not.
- Forge restarts in place and keeps card id numbers, so `card:45` in
  game 2 may be the same physical card as in game 1. Decision ids
  keep rising across a restart, so no answer from game 1 is
  accepted in game 2; `gameEpoch` is what tells a client the board
  it holds is from a game that no longer exists.

## Costs and modes (Phase 6, P6-AN)

Questions added 2026-10-20, each one at a time like every other:

```text
chooseTargetsFor          also offers spells ON THE STACK, as
                          "target:stack:N" -- the snapshot's own id
                          for that stack entry (counterspells)
divideAsYouChoose         once every target of a divided spell is chosen
                          (Phase 9 Amendment 14; was after each target):
                          one share per target but the last, "divide:N",
                          1 up to what leaves 1 for each target after it;
                          a share with one possible amount is not asked
applyManaToCost           also "mana:life:phyrexian" -- pay 2 life for
                          a Phyrexian symbol; the life is paid only
                          when the whole cost is
chooseCardsForConvokeOrImprovise   a creature or artifact to tap, or
                          pass when done; Forge decides what it pays
chooseOptionalCosts       entwine, kicker, spree...: any number, pass
                          when done
chooseSingleStaticAbility which of several effects applies first
CostDiscard               the card(s) to discard as a cost (escalate)
```

Delve and discarding from a hand by an effect use the existing
`chooseEntitiesForEffect` ("up to N", pass when done).

## Questions during resolution (Phase 6, the last required lab cards)

Added 2026-10-20, each a port of Forge's own human controller:

```text
chooseNumber              a number Forge allows, "number:N" (Harnessed
                          Lightning's "pay any amount of energy")
chooseSingleCardFace      one face from Forge's list (which dungeon);
                          one face alone is not asked
chooseSingleSpellForEffect   one of several abilities (which room of
                          a dungeon next)
chooseSpellAbilitiesForEffect   N different abilities, one at a time
                          (Mind Bend: a colour word or a land type)
chooseTargetsFor          also NEW targets for a copy (Krark): the
                          prompt starts "New target for"; passing
                          keeps the targets it has
arrangeForScry            scry N: both steps are kind arrangeForScry,
                          shown in the card tray (W-08): first the
                          cards for the BOTTOM ("... then Done"), then
                          "Which goes on top of your library?" one at
                          a time
willPutCardOnTop          one card: "Top" or "Bottom"
```

A cost paid while something resolves ("unless you pay", paying
energy) and choosing several cards for an effect go through the
existing confirm, mana and `chooseEntitiesForEffect` questions.

Snapshot additions:

```text
player.ringTempted        how many times the Ring has tempted the
                          player; absent for never
player.dungeonsCompleted  one dungeon name per completion
player.command            a dungeon carries its room:
                          "Undercity (room: Lost Well)"; "The Ring"
                          once the Ring has tempted the player
moves                     Phase 10 A-00: the cards moved since the last
                          round, as Forge moved them: [{card?, from {zone,
                          seat?}, to {zone, seat?}, why?, into?, where?}]; zone is
                          battlefield|hand|library|graveyard|exile|stack|
                          command|merged|other|nowhere (a new token); why is
                          "destroyed" or "sacrificed" for a card leaving the
                          battlefield. `card` only when the card is not now
                          in a zone hidden from this viewer (the other
                          player's hand, any library -- 2026-11-08: never the
                          other player's draw, nor a Bolt bounced back to its
                          caster's hand; the page pairs such a move with the
                          card gone from the board it drew); absent when
                          nothing moved. Phase 10 A-10:
                          into "card:N" -- the permanent this card merged
                          into (a meld partner to exile, a mutating spell
                          to merged), from Forge's state; only with `card`.
                          Phase 10 A-14: where "top"|"bottom"|"shuffled" --
                          on a move into a library, where Forge put it (its
                          index in Forge's library as the move is reported;
                          "shuffled" when Forge shuffled that library later
                          in the same round, replacing any place); absent
                          when it went elsewhere in it. Public, so sent with
                          or without `card`. Spec 0061, item 4: a move to a
                          graveyard also says why -- why "cycled" (hand),
                          "discarded" (hand; Forge's discard record),
                          "countered" (the stack, while another card's
                          spell or ability resolves), "died" (a creature
                          neither destroyed nor sacrificed); said: the tag
                          the board shows on its way ("Cycled",
                          "Discarded: too many cards", "Discarded",
                          "Countered by Counterspell"); only with `card`.
                          Spec 0066: a card leaving the battlefield
                          ("died", "destroyed", "sacrificed") has a why
                          but no said, and no notice. Each round with a
                          said is also told to both players as a notice
                          ("Cycled: Forgotten Cave (Bob's)") -- except a
                          discard or a counter (spec 0074, Amendment 1:
                          no notice, and the page shows no tag; the
                          `action` report explains it)
noticesTotal              spec 0061: how many notices this seat was told in
                          all (`notices` keeps the last six), so a page can
                          tell new ones once the list is full
rolls                     Phase 9 W-17: the dice rolled lately, public, the
                          last six: {n (only grows), seat, source "card:N",
                          name, sides, results [final]}
payments                  spec 0062: what each payment step paid, the last
                          24, every seat: {n (only grows), seat (who paid),
                          payment (shared by one payment's steps), for
                          "card:N" (the card paid for), kind
                          cast|spell|ability|trigger, cost? "{2}{B}{B}" (when
                          it began), owing? (after this step), mana [{colour
                          W|U|B|R|G|C, shard? "1"|"B"|"B/G"|"B/P" (the symbol
                          it paid), from "card:N"|"pool"|"life"}]}. A spell
                          still being cast (and a face-down card's ability)
                          keeps cost, owing and shard to its payer.
                          `for` and a mana's card `from` follow the rule
                          below: a card now in a hidden zone has no `for`,
                          and its mana says from "unseen".
playLog                   spec 0064: this round's play log lines for THIS
                          seat, written by the worker from Forge's events
                          with only what this seat may identify (both
                          visibility questions, at the moment it happened),
                          never from Forge's game log: [{n (per seat, only
                          grows), rev (this snapshot's revision), turn,
                          active (whose turn), step ("Beginning", "Main 1",
                          "Combat", "Main 2", "End", "Before the game"),
                          kind turn|draw|land|spell|ability|trigger|combat|
                          damage|death|life|move|reveal|other, parts [words
                          | {player} | {name, known, id, owner, seat, label?,
                          token?, faceDown?, printing?, art?}], life?
                          [{seat, total}], private? (only this seat was told
                          this much)}]. Absent when the round has none, and
                          never in the public (seat 0) view. The server keeps
                          each seat's lines for the match (last 2,000) and
                          puts the whole log in the board it sends a
                          connection that just arrived
(every key)               2026-11-08: no snapshot carries the id of a card
                          now in a zone hidden from its viewer -- every
                          library, every hand but the viewer's own (less
                          what Forge shows in otherHands) -- under any key:
                          moves, payments, rolls, action, damage, the play
                          log. The name and the place stay (they were
                          public); the id, a handle on the card wherever it
                          goes, does not (worker HiddenIds;
                          scripts/check-hidden-hands.py)
decision.arrange.dice     Phase 9 W-17, on the roll questions: {how
                          (reroll|nudge|swap|swapValue|ignore), sides,
                          rolls, by [{id, name}], price?, power?,
                          toughness?}
decision.arrange.binary   chooseBinary: Forge's BinaryChoiceType
decision.arrange.crankNext chooseSprocket: the sprocket cranked next turn
decision.arrange.modes     Phase 9 Amendment 21, chooseModeForAbility: {num,
                          min, repeat, budget?, spent?, chosen [labels],
                          paws [per option], escalate?}
WATCHING.names            spec 0067: who is watching, by display name, each
                          person once, sorted; to the players only
MATCH_ENDED               spec 0067: the game is over, to spectators only:
                          matchId, status, failureCode?, outcome,
                          winningSeat, endedOnTurn, reason?, concededSeat?,
                          lossReason? (the lobby MATCH's result fields, by
                          seat); the socket is closed next (1000 "game over")
state.playLog (seat 0)    spec 0067: the public view's play log -- the lines
                          every player may read alike ("Bob drew a card"),
                          never one Forge showed one seat; never `private`;
                          the first public view brings the game's log from
                          line 1 (kept by the worker while nobody watched)
MATCH_ASKING.doing        Phase 9 Amendment 21: a fixed word for what the
                          asked seat is doing ("Splitting the cards"...;
                          "Choosing"; absent for priority), never the
                          question itself; sent to spectators too
player.commandWords       Phase 9 W-21: one entry per `command` entry, in
                          its order -- {name, says} for an emblem (Forge's
                          card text, markup removed), {name, rooms: [{name,
                          says, next: [room names], here?}]} for a dungeon,
                          {name} alone for the Ring; public, as `command` is
decision.notNow           on a priority question: each of the asked player's
                          permanents' abilities NOT offered now, as
                          {objectId: [{label, why}]} ("Needs 7 loyalty");
                          words only, to the asked seat only (Phase 9 W-16)
                          Spec 0061, item 1: and a hand card whose every
                          option throws it away (cycling, landcycling,
                          channel): the play it can't make, first, with
                          use "land"|"spell" ({label "Play it as your
                          land", why "You've already played a land this
                          turn", use "land"}). A page never answers such a
                          card on one click
decision.picking          spec 0070, on a cost paid by picking cards one at
                          a time (CostTapType, CostUntapType, CostSacrifice,
                          CostExile, CostCollectEvidence, CostForage,
                          CostReturn, CostPutCardToLib, CostReveal,
                          CostBehold, CostDiscard, CostExiledMoveToGrave,
                          CostUnattach, chooseCardsForCost,
                          chooseCardsForConvokeOrImprovise): {word (the
                          Ribbon: TAP, UNTAP, SACRIFICE, EXILE, TO HAND, TO
                          LIBRARY, TO GRAVEYARD, REVEAL, BEHOLD, DISCARD,
                          UNATTACH, GIVE; PAY for a cost not named), tone
                          (tap|untap|sacrifice|exile|hand|library|reveal|
                          discard|other), lean? (true: picked to tap -- the
                          card leans as a tapped card does), picked
                          [{objectId, actionId, label}] in the order
                          picked}. Each `actionId` ("unpick:card:N") is an
                          answer the question accepts that takes that card
                          back -- never listed in `options` (worker
                          CostPicks; the server's LiveMatch accepts it).
                          To the asking seat only, as the whole question
                          goes: the other player and spectators are told
                          nothing until the cost is paid (Forge pays it at
                          the end, as before). Convoke's mana balls (spec
                          0062) are sent once the picking is over, for the
                          same reason (scripts/check-pay-picks.py).
                          Spec 0071: also on chooseEntitiesForEffect when
                          two or more CARDS may be picked one at a time
                          (Escape's "exile five other cards from your
                          graveyard", Delve, a search's "up to two", ...):
                          word/tone by where the cards go -- EXILE/exile,
                          TO HAND/hand, TO LIBRARY/library, TO GRAVEYARD or
                          PICK/other (a plain dot). Not on a single pick,
                          when a player is among the options, Fact or
                          Fiction's split, or Brainstorm's "to the top"
                          (those windows lay picks out themselves). The
                          page keeps each picked card in the window,
                          dimmed, with its sign; a click sends its
                          `actionId`
decision.arrange.discard  spec 0061, item 3, on
                          chooseCardsToDiscardToMaximumHandSize: how many
                          cards are still to go (the game asks one at a
                          time; the page lets the player pick them all)
decision.about.pay,       spec 0061, item 5, on a payment for an activated
decision.about.then       ability (applyManaToCost): what it is for, after
                          "Pay {R}" ("to cycle Forgotten Cave"), and the
                          line under it ("Then Forgotten Cave goes to your
                          graveyard and you draw a card.")
decision.owing            on a payment question (applyManaToCost): the mana
                          still due, "{1}{R}"; the buttons no longer repeat
                          it (Phase 9 Amendment 13, item 9)
arrange.number            on a number question (announceRequirements,
                          chooseNumberForKeywordCost, chooseNumber): values
                          (each option's number, in the options' order),
                          canMake (mana that can be made; absent when no
                          mana is asked), keyword and each (multikicker,
                          "{2}"), says (the card's sentence). Each option's
                          cost and payable say what it costs and whether it
                          can be paid (Phase 9 Amendment 14)
arrange.name              on the name-a-card question (chooseCardName,
                          searchable): title ("Name a nonland card"), says
                          (the card's sentence), objects (the cards this
                          player can see whose names are allowed). Each
                          search result carries cost and types ("Creature
                          — Goblin Scout") (Phase 9 Amendment 16)
arrange.divide            on each share of a split (divideAsYouChoose),
                          asked once every target is chosen: total, what
                          ("damage"), targets [{object, lethal}] in the
                          order chosen, at (this share's target), values
                          (each option's amount). The last target takes
                          the rest unasked; a share with one possible
                          amount is not asked (Amendment 14)
arrange.targets           on every target question (chooseTargetsFor):
                          chosen (the snapshot's ids of the targets chosen
                          so far, in order), enough (a pass now goes on
                          with them: "no more"), more (how many more may
                          be chosen), cancel (the answer that backs out,
                          "target:cancel", always the LAST option; it is
                          not a target). Before, a pass was the only "no",
                          and with enough chosen it could not cancel
                          (Phase 9 Amendment 17)
snapshot.action           who did what to a library or hand, in this
                          reader's words, with only the cards it may know;
                          never to the seat that chose (Amendment 12, 13).
                          Spec 0074, Amendment 1: also a spell countered
                          ("Bob countered your Giant Growth.") and cards
                          out of a graveyard or exile ("Bob returned
                          Grizzly Bears to their hand.", "You exiled ...
                          from Bob's graveyard."); a mill says "Bob milled
                          10 cards."; these three go to both seats unless
                          the reader did it to themselves alone. A card
                          out of a graveyard or face-up exile is shown as
                          it was there (public), never by its id
player.mulligans          how many times the player has mulliganed, for every
                          viewer (public, as in paper Magic; Phase 9 W-15)
card.ringBearer           true on the Ring-bearer, for every viewer
card.basePower,           a creature's power and toughness before counters
card.baseToughness        and effects (Phase 9 W-19: "printed 2/3, now 4/5")
card.exiledBy             in exile: the name of the card that exiled it, for
                          every viewer who may identify the card (W-18)
card.playable             in exile: true when THIS viewer may play it from
                          there (Light Up the Stage); only in their snapshot
card.sector               Un-sets: a creature's sector (Alpha, Beta, Gamma), for
                          every viewer -- set while a "space sculptor" is out
card.sprocket             Un-sets: the sprocket (1-3) a Contraption is on, for
                          every viewer
card.costNow,             spec 0058, item 2: on a card in the viewer's OWN
card.costWhy              hand, on every snapshot, when casting it costs
                          something other than printed right now -- Forge's
                          own test-mode reckoning ("{1}{R}") and why
                          ("Costs {1} less: Goblin Warchief"; the cards are
                          those whose cost changes Forge applies; unnamed
                          if that cannot be asked). Not for an X cost
card.merged               spec 0058, item 8: a mutated creature's cards, top
                          first: [{id, name (its own), known, seat, owner,
                          printing?, token?, art?}] -- public; each wears
                          its own picture
decision.arrange.sources  spec 0058, item 8, on orderSimultaneousAbilities
                          for a mutated creature: by option id, {card (one
                          of its `merged`), name, place "top"|"underneath",
                          says (the ability's effect)}
```

Value notices use Forge's own wording, per viewer: "Krark, the
Thumbless: You win the flip" to the flipper, "...: Alice wins the
flip" to the opponent.

## What the board is told (Phase 7, §7.61)

Added 2026-10-21, each read from Forge, per viewer, checked by
`scripts/check-board-data.py` (Mechanics Lab):

```text
prioritySeat        B1  the seat holding priority now (Forge's priority
                        player); on your own turn often not activeSeat
player.manaPool     B6  floating mana by colour, {"R": 1}; absent when
                        the pool is empty. Public.
stack[]             B2  per entry, besides id and description:
                        source      "card:N", the card it came from
                        name        as this viewer may know it ("Face-down"
                                    for a face-down spell it may not identify)
                        controller  seat that cast or activated it
                        kind        "spell" | "ability" | "trigger"
                    B3  targets     [{object: "card:N"} | {object: "stack:N"} |
                                    {player: seat}], through every part of
                                    the spell; a spell targeted on the stack
                                    is named as its stack entry
                        description is "Face-down spell" when its source
                                    is a face-down card this viewer may not
                                    identify (it began with the card's name)
combat              B4  while there is one: attackers [{id, target:
                        {player: seat} | {object: "card:N"}}],
                        blocks [{blocker, attacker}] -- Forge's record
damage              B13 damage dealt since the last round, ONE combat
                        damage step or one spell: {key, hits: [{source,
                        target, amount}]}; a new key is a new wave. A
                        combat step sends the board even when nobody is
                        asked anything, so first strike and regular
                        damage are always separate waves.
                        Phase 10 A-13 (2026-11-06): a hit carries
                        `deathtouch: true` when Forge marked it so; the
                        wave a combat damage step dealt adds
                          combat  "first-strike" | "regular"
                          fights  [{attacker, defender: {player} |
                                  {object}, blockers: [...]}] -- Forge's
                                  combat as the step began, the dead
                                  included, blockers in damage order
                          gains   [{player, amount, source?}] -- life
                                  gained as it was dealt (lifelink); the
                                  source only when the gain is exactly
                                  what that source dealt
                        Combat damage to a planeswalker or battle that is
                        not a creature is read from Forge's damage
                        history (Forge sends no event for it). All public.
card.enteredAt      B11 Forge's game timestamp: arrival order
card.token          B12 true on a token
```

On every question's options (DECISION_REQUEST):

```text
option.objectId     B5  what the option is about: "card:N", "stack:N"
                        or "player:SEAT" -- so a board answers by
                        clicking the object. The worker derives it from
                        its own option ids; a client never parses an
                        actionId. Players by SEAT: Forge's number in
                        "target:player:0" is not a seat. Several options
                        may share an object (a card's abilities).
option.payable      B8  false when Forge says the option cannot be paid
                        right now (its mana solver in test mode, plus
                        every other cost part); absent otherwise. Shown
                        dimmed, still choosable (§7.54): Forge refuses
                        an unpayable choice, as before.
```


## Test-only: the Lab's deal (worker START_GAME, 2026-11-08)

**Never in a real game.** The Mechanics Lab (`scripts/lab.py`) may give
a START_GAME seat a `labDeal`, so a scenario reaches its moment on the
first game instead of waiting on the shuffle (it was INCONCLUSIVE, or
WRONG, when the deal differed):

```text
players[i].labDeal   {"hand": [names], "top": [names]}, both optional.
                     After Forge shuffles the library and before it
                     draws the opening hand, the hand gets `hand` (the
                     rest of it from the top of the shuffle) and the
                     draws after the opening hand are `top`, in order.
                     Everything else stays as Forge shuffled it. Names
                     are the deck's own, each copy named once.
```

Why a player cannot use it:

- The worker accepts it only when started with `--lab-deal`. Only
  `scripts/lab.py` passes that; the server starts the worker as
  `java -jar <jar> <res>` (`MatchWorker`). Without the switch, a seat
  carrying it is refused: `ERROR LAB_DEAL_REFUSED`, no game.
- The server never forwards it: `WorkerFrames.startGameFrame` builds
  each seat field by field (`displayName`, `seatNumber`, `cards`,
  `stops`), so nothing a player sends reaches the worker as a field
  (`WorkerFramesTest` "the start frame never carries the Lab's deal").
- A seat without it is dealt exactly as before: no listener is even
  subscribed (`LabDealTest`). A deal the deck cannot make (a name it
  lacks, more than seven for the hand) is refused before the game.
