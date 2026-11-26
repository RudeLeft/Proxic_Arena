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

On the wire, every socket may be compressed (permessage-deflate, RFC
7692, since Phase 11 P11-D2, `server/.../SocketCompression.kt`) when
the browser offers it, which every browser does; one that doesn't gets
the same messages uncompressed. The messages themselves don't change.
A board's history lists (`payments`, `rolls`, `notices`) are sent once
per connection since P11-D3 (`kept`, under "What the board is told"),
and since P11-D4 a page that asks (`?deltas=1`) is sent only what
changed (`MATCH_DELTA`, under "Only what changed"). One message sent to
several connections keeps one `messageId`, even when each connection is
sent a different delta of it.

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
                          a time. Scry 1 is not arrangeForScry: it asks
                          willPutCardOnTop (corrected 2026-11-18;
                          MatchController.java, arrangeForScry)
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
                          seat?}, to {zone, seat?}, why?, into?, where?, last?}]; zone is
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
                          neither destroyed nor sacrificed). Spec 0097,
                          item 9: the word tag a move once carried
                          (`said`: "Cycled", "Countered by Counterspell")
                          is gone -- no page showed it since 0074/0075; the
                          why stays, and the `action` report explains it.
                          Spec 0078, item 4: a creature leaving the
                          battlefield carries last {power, toughness}, its
                          size as it last stood there (Forge's last-known
                          information: Grasp of Darkness on a 4/4 says
                          {0, 0}, though the card in the graveyard is a
                          4/4 again); only with `card`, and only from the
                          battlefield (the board showed both numbers, so
                          it is public). Spec 0079: why "fizzled" on a
                          spell's move off the stack when it did nothing
                          (Forge's hasFizzled: every target gone or no
                          longer legal), wherever it goes, with no said; a
                          COPY of a spell ending on the stack (resolved,
                          or fizzled) is a move to "nowhere" -- it ceases
                          to exist, never into a graveyard. Spec 0080: a
                          flicker -- a permanent exiled and returned to the
                          battlefield in the same round (Ephemerate,
                          Cloudshift; Forge keeps its id) -- is ONE move,
                          from "battlefield" to "battlefield", why
                          "flickered", via {zone: "exile", seat} (the exile
                          it went by); a return in a later round
                          (Flickerwisp's end step) keeps its two moves.
                          Spec 0084: spent true on a card's move off the
                          battlefield with why "sacrificed" when it was
                          spent, not killed: sacrificed while Forge was
                          paying a cost (Game#costPaymentStack not empty --
                          a Treasure, a Clue, a fetch land, Village Rites'
                          creature), by its own resolving ability (Ball
                          Lightning), or by the rules ending a Saga. An
                          edict (Diabolic Edict, Innocent Blood: another
                          card's effect) is never spent. Only with `card`
shuffles                  spec 0084: the seats whose library Forge shuffled
                          this round (GameEventShuffle: a fetch land, a
                          tutor, Rampant Growth, a card shuffled in); the
                          game's own opening shuffles come with the first
                          boards. Absent when none. Public
crewed                    spec 0084: the vehicles crewed this round: [{card
                          "card:N", by ["card:N", ...]}] -- the creatures
                          tapped to pay the crew ability (Forge's paid list
                          "Tapped", what Card#becomesCrewed records).
                          Absent when none. Public
phased                    spec 0080: this round's phase changes, as Forge
                          made them (GameEventCardPhased): [{card "card:N",
                          out}] -- out true when it phased out, false when
                          it phased in; absent when none. Public
survived                  spec 0080: this round's survivors: [{card
                          "card:N", how}] -- how "regenerated" (a
                          regeneration shield was used instead: Forge's
                          GameEventCardRegenerated) or "indestructible"
                          (a Destroy or DestroyAll that resolved aimed at
                          it, or it holds lethal damage, and Forge left it
                          on the battlefield; Forge itself says nothing,
                          the worker asks its state after the effect),
                          or, spec 0089, "umbra" with `by` "card:N": the
                          Aura whose umbra armor was destroyed instead (the
                          replacement Forge chose: its keyword record,
                          never a name), or, spec 0101, "shield": a shield
                          counter was removed instead of the card being
                          destroyed (the destroy replacement Forge chose,
                          its ShieldCounter parameter); absent when none.
                          Public
left                      spec 0101: this round's stack entries that left
                          without resolving: [{stack "stack:N", why
                          "countered" | "ended", by? "card:N"}] -- noted as
                          Forge fires GameEventSpellRemovedFromStack while
                          a Counter part (a counterspell, Stifle, a ward
                          trigger) or an end-the-turn part (Time Stop)
                          resolves; `by` the card whose effect did it. Only
                          entries an earlier board showed. A countered
                          spell keeps its card move too. Absent when none.
                          Public
blockerCandidates         spec 0101: from the attack until the blocks, the
                          creatures the game offers the defending player as
                          blockers (and those blocking): ["card:N", ...],
                          the declare-blockers decision's own test
                          (CombatChoices#offered), to every viewer; absent
                          otherwise. Public
action (RETARGET)         spec 0100, item 8: a change-targets effect
                          (Forge's ApiType.ChangeTargets: Spellskite,
                          Deflecting Swat, Redirect) resolved and a stack
                          entry's targets differ from before: "Bob changed
                          your Lightning Bolt's target to Spellskite." ("...
                          to you." for a player), told to that spell's
                          controller only, never to the one who changed it
                          (so nobody, for your own spell); its cards: the
                          spell, then its new target when that is a card,
                          each under the report's own ids. Public
action (COUNTER_ABILITY)  spec 0101, item 2: an ability countered (Stifle;
                          no card moves for it): "Bob countered Prodigal
                          Pyromancer's ability with Stifle.", told to the
                          ability's controller only, never to the one who
                          countered it; its card: the ability's source card
                          where it is now. Public
action (CONTROL)          spec 0102, item 2: a player's turn began (or
                          control came during it) and another player
                          controls them (Mindslaver; Forge's
                          Player#isControlled): "Bob is playing your turn.",
                          told to the controlled player only, once per
                          controlled turn; its card: the card that did it
                          as it was. Public
action (END_TURN)         spec 0102, item 3: an end-the-turn effect resolved
                          (ApiType.EndTurn: Time Stop, Sundial of the
                          Infinite): "Bob ended the turn: the spells on the
                          stack were exiled." ("Bob ended the turn." when
                          nothing else was on the stack), told at once to
                          every seat but its controller; its cards: every
                          spell exiled off the stack, Time Stop too, each
                          `to: "exile"`. Public
action (SKIP)             spec 0102, item 3: a skip effect resolved (Forge
                          puts a BeginTurn or BeginPhase replacement into the
                          skipping player's command zone: Meditate,
                          Fatespinner, Moment of Silence): "Bob's spell: you
                          skip your next turn." / "... you skip your combat."
                          ("Bob's spell: Bob skips their next turn." to
                          another reader), told when the effect resolves --
                          Forge fires nothing when the turn or step is later
                          skipped -- to every seat but its controller; its
                          card: the card that did it. Public
action (HAND_EXILE)       spec 0104: a card taken out of a player's hand by
                          an effect another player chooses for (`Chooser$ You`
                          with `DefinedPlayer$`: Appetite for Brains, Castigate,
                          Brain Maggot): "Alice exiled your Hill Giant.", told
                          to the hand's owner only, never to the one who
                          chose; its card: the card taken, with `to`
                          ("exile"). No fields beyond a report's
action (TRAMPLE_KEPT)     spec 0107 (owner Q5c A): a blocked attacker with
                          trample could trample over and its player kept the
                          extra on the blockers (a changed split): "Bob put
                          all five on your Grizzly Bears; none trampled
                          over." / "Bob put four on your Grizzly Bears; one
                          trampled over.", told once that damage step is
                          over to the defending player only, never to the
                          one who chose; its cards: the attacker, then each
                          blocker (`to` "graveyard" for one that died). No
                          fields beyond a report's
action (RESTART)          spec 0102, item 1: at the restart every open report
                          is forgotten for every seat before the RESTART
                          report is made, so game 1's reports never gather
                          into its window
card.attachedToPlayer     spec 0100, item 6: an Aura on a player (a Curse):
                          the seat it enchants (Card#getEntityAttachedTo);
                          `attachedTo` stays a card's id only. Public
action (PHASE)            spec 0080: the other player's permanents phased out
                          (or yours, by them): "Bob's permanents phased out
                          until Bob's next turn." (named cards when not all);
                          plus "Bob's life can't change." ("Your ..." to that
                          player) when an effect the same spell made holds a
                          CantChangeLife static ability that applies to them
                          (Forge's own test), e.g. Teferi's Protection; Slip
                          Out the Back adds nothing
noticesTotal              spec 0061: how many notices this seat was told in
                          all (`notices` keeps the last six), so a page can
                          tell new ones once the list is full. Spec 0097:
                          the page counts what a board it first sees after
                          mounting holds as already seen (turn 0 excepted)
passing                   spec 0097, item 2: this seat's own turn is being
                          passed for it, nothing it can play: {turn, why
                          ("2 lands, no land in hand")}, in that seat's
                          boards during that turn only; the act button
                          says "Passing" / "Nothing to play · {why}". The
                          grey "Nothing you can play this turn" notice is
                          no longer sent
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
kept                      P11-D3 (2026-11-22), server -> browser only: the
                          history lists `payments`, `rolls` and `notices` are
                          sent once. The worker still builds each whole ("the
                          last N", per seat, ids stripped, as above), and the
                          server stores the whole board; but each connection
                          remembers the lists its page holds, and a board sent
                          on it carries only the entries the page lacks, with
                          kept {payments?: m, rolls?: m, notices?: m}: "keep
                          the last m of the list you hold, then add this
                          board's" (the key absent: nothing new). A list not
                          named in `kept` is whole, as before (absent: none).
                          `kept` names m only when the last m entries the page
                          holds ARE the first m of the new list, so the rebuild
                          is the worker's list exactly; a changed entry (an id
                          stripped as its card goes into a hand) or a list that
                          started again (Karn's restart) goes whole. A
                          connection's first board has nothing to keep: on
                          join, reconnect, a second tab and for a spectator
                          (the public view, the same way) every list comes
                          whole. A board older than one already sent on the
                          connection (the page drops it: the revision check)
                          goes whole and is not remembered. The page rebuilds
                          the whole board before reading it (frontend
                          `history.ts` `withHistory`; server
                          `BoardHistory.kt`); browser tests that re-send a
                          board use `WholeBoards` (`delta.ts` since P11-D4). Lab traces (the worker's
                          output) carry the lists whole, as always
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
                          never in the public (seat 0) view, which carries
                          only the public lines (state.playLog (seat 0),
                          below; corrected 2026-11-18). The server keeps
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
decision.arrange.owner    spec 0104, on a choice from another player's hand
                          (zone "hand"): whose hand (their seat). The server
                          reads it with `zone` for that seat's waiting line,
                          "Choosing from your hand" (AskingWords)
decision.arrange.why      spec 0104, on the same: per card shown with the
                          question (in `looking`) but not offered, the
                          worker's reason in plain words ("mana value 1",
                          "a land", else "can't be chosen"; NotChosen). Only
                          cards Forge showed the chooser; with the question,
                          to that seat alone (never in a snapshot)
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
                          matchId, status, failureCode?, outcome?,
                          winningSeat?, endedOnTurn?, reason?, concededSeat?,
                          lossReason? (the result fields only when there is
                          a result -- none on a failure or an abandon; no
                          winningSeat on a draw; the lobby MATCH's result fields, by
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
                          Spec 0112: "Choosing what to sacrifice" on
                          choosePermanentsToSacrifice; for a reader whose
                          seat is in the question's `nextSeats`, "Choosing
                          what to sacrifice · you choose next" (a no-break
                          space before the dot, so a wrap falls after it; the same
                          words however many creatures that reader has).
                          Spectators and the reconnect path (askingFor, no
                          reader) get the plain words
decision.nextSeats        spec 0112, worker -> server only, on
                          choosePermanentsToSacrifice while an "each
                          player" Sacrifice effect resolves (Barter in
                          Blood, Innocent Blood): the seats the game asks
                          after this one, in Forge's own order for the
                          effect (SpellAbilityEffect.getTargetPlayers, read
                          through SacrificeTurns), each with at least one
                          card Forge's own filter offers it (SacValid,
                          canBeSacrificedBy), as the seat authorised to
                          answer. Absent when nobody is next. The server
                          reads it for MATCH_ASKING.doing and never
                          forwards it (DecisionLayout putLayout)
decision.earlier          spec 0112, on the same question: [{seat, cards
                          [{id, name}]}], each player asked before this one
                          and the cards of their choice that are now in a
                          graveyard (public), in the order chosen, named as
                          the asker may know them; a player who sacrificed
                          nothing has no row; absent when there is none. To
                          the asked seat, in its question; the page's
                          sacrifice window opens with it ("RudeLeft
                          sacrificed Abattoir Ghoul and Makeshift Mauler.",
                          QuestionWindows EarlierLines; parsed by match.ts
                          asEarlier)
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
decision.refused          spec 0097, items 5-6: why the game refused the
                          answer just given, on the question asked again,
                          to that seat only: an attack or a block a rule
                          forbids ("That attack breaks a rule: ...", "Not
                          allowed: ..."; the combat button's note), a name
                          the card won't take ("Forest can't be named
                          here. Try another card."; red in the naming
                          window). These are no longer grey notices
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
                          Spec 0109, item 5: mode true when the target is
                          for one mode of a modal spell (Forge's Charm
                          root: a charm, escalate); absent otherwise. The
                          page keeps that mode's line beside the big card
                          (its short window otherwise drops the card's
                          sentence)
snapshot.action           who did what to a library or hand, in this
                          reader's words, with only the cards it may know;
                          never to the seat that chose (Amendment 12, 13).
                          Spec 0074, Amendment 1: also a spell countered
                          ("Bob countered your Giant Growth.") and cards
                          out of a graveyard or exile ("Bob returned
                          Grizzly Bears to their hand.", "You exiled ...
                          from Bob's graveyard."); a mill says "Bob milled
                          10 cards."; these three go to every seat but the
                          one who did it (spec 0097, item 7; they went to
                          both when the subject was the other player). A card
                          out of a graveyard or face-up exile is shown as
                          it was there (public), never by its id.
                          Spec 0075: also cards from the table or the
                          stack back to a hand or into a library ("Bob
                          returned your Grizzly Bears to your hand.",
                          "... put your Serra Angel on top of your
                          library.", "... shuffled ... into your
                          library."; card `to` "hand", "top", "bottom",
                          "library" or "shuffled"), only to the owner of
                          a card the OTHER player sent back; a card
                          cycled ("Bob cycled Forgotten Cave and drew a
                          card.", the cycled card shown, the card drawn
                          never named), only to the other seat; the other
                          player's choices and coin flips ("Bob chose
                          white.", "Bob flipped a coin and lost.", "Bob
                          named Lightning Bolt.", else Forge's own words)
                          -- never your own choice; a coin flip goes to
                          both seats, the flipper too ("You flipped a coin
                          and won.": luck, not a choice; owner
                          2026-11-12); and a look at a hand or a
                          library with no cards ("You looked at Bob's
                          hand. It has no cards."), to the one shown it
                          (Duress on an empty hand: both seats, there was
                          nothing to choose). `cards` may then be empty.
                          Spec 0109, item 7: a bounce, a return or a
                          counter is sent to nobody when the animation
                          told it all: its spell or ability on the stack
                          aimed at every card shown, each went to a hand,
                          a graveyard, face-up exile or the battlefield,
                          all to one place, nothing shown, looked at,
                          shuffled or chosen while it resolved, and
                          nothing else moved but a draw and the source
                          (ActionReports#quiet); the play log keeps its
                          line. A library (Griptide), no arrow
                          (Evacuation) or another result (Psychic
                          Strike's mill) keeps the report.
                          Spec 0097: a trigger its controller could not
                          pay for is a fizzle, to both seats ("Bob's
                          Lightning Rift did nothing: they couldn't pay
                          {1}." / "Your ... you couldn't pay {1}.", the
                          card where it is); a game restart goes to the
                          other seat only ("Bob restarted the game. This
                          is game 2.", the card that did it shown as it
                          was, under the report's id). Neither is a grey
                          notice any more. A phasing done to the other
                          player is, like a mill, not told to the one who
                          did it. A plain reveal of a seat's own cards
                          that another seat was shown too is in the other
                          seat's `reveal` only, not the revealer's, unless
                          a card went back into the library
action.cards[i].table     spec 0103, items 1-2 (owner option A, 2026-11-18):
                          the id of that card on the table ("card:N"), so
                          pointing at a row lights it -- sent ONLY while this
                          reader's own snapshot shows that card in a board
                          list (battlefield, hand, otherHands, casting,
                          graveyard, exile, command, libraryTop): never a
                          card only on the stack, never one in a hidden zone,
                          never on a card hidden from the reader, and
                          only on a card this reader may identify
                          (`known`: a face-down card on view stays a back)
                          (HiddenIds.keepTableLinks, then HiddenIds.strip);
                          absent otherwise. In `gathered` reports too
action.marks              spec 0075: pictures that are not cards, in
                          order: {kind "color", color "white"|"blue"|
                          "black"|"red"|"green"} for a colour chosen,
                          {kind "coin", won} for a coin flip
action.gathered           spec 0088 (Q2 A, Q3 C): a report is no longer
                          cleared when a turn begins. `action` is the
                          newest report this reader has not closed; the
                          older ones are `gathered` with it, oldest first,
                          at most three (Amendment 1: older ones drop off),
                          each a whole report of its own (key, stamp, by,
                          source, said, cards, marks -- never `gathered`),
                          its cards under its own ids ("action:N:I"), a card
                          hidden from the reader a nameless back. Kept per
                          reader (ReportBook, at most 40) until the server
                          sends the worker REPORTS_CLOSED {seat, upTo}: the
                          reader closed the window, which showed reports up
                          to `upTo`; those are gone for that seat only. Spec 0104: the same message closes
                          the seat's plain reveal (`snapshot.reveal`, which
                          shares the stamps) when its stamp is not newer;
                          a plain reveal is no longer dropped at the next
                          turn (a newer reveal still replaces it)
snapshot.libraryTop       spec 0088 (Q4 C): the top card of each library
                          this viewer may see, as Forge says --
                          CardView#canBeShownTo, which reads the card's
                          MayLookAt: every player for Courser of Kruphix's
                          and Future Sight's "play with the top card of
                          your library revealed", its owner alone for Bolas's
                          Citadel's and Vizier of the Menagerie's "you may
                          look at". Described as any card (its `seat` is its
                          owner's), with `public` when every player may see
                          it and `uses` [{seat, how "cast"}] for each player
                          Forge's Card#mayPlay lets play it from there
                          (Courser: a land only). Absent when there is none
                          to show; a viewer not allowed to see a top card is
                          sent nothing of it, and its id is in no other key
                          (HiddenIds counts the list as part of the board)
snapshot.knownTop         spec 0103, item 4: the cards THIS viewer put on top
                          of its own library in an order it chose (Brainstorm's
                          put back, a scry or surveil kept on top, a look-and-
                          reorder), top first, still exactly its library's top
                          cards. Kept by the worker from the player's own
                          answers (KnownTops, like SeenHands: Forge does not
                          remember it), so it is the HID-002 exception
                          (MATCH_STATE_VISIBILITY.md). Sent in the owner's own
                          snapshot only -- never another seat's, never the
                          public view's. Each card described as shown to its
                          owner, under a stand-in id "known:SEAT:I" (never the
                          card's own; HiddenIds). The top known card leaving
                          (a draw, a mill) pops it; another known card
                          leaving, any other card moved into or within that
                          library, or a shuffle, clears it. Absent when nothing is known
players[i].thisTurn       spec 0103, item 5: {spells, lifeGained,
                          leftBattlefield}: spells this player cast this
                          turn, life it gained this turn, and whether a
                          permanent it controlled left the battlefield this
                          turn -- Forge's Player#getSpellsCastThisTurn,
                          #getLifeGainedThisTurn, #hasRevolt. Public, to
                          every viewer. No mana spent (Forge keeps none per
                          player; spec 0103 Decided 3)
player.mulligans          how many times the player has mulliganed, for every
                          viewer (public, as in paper Magic; Phase 9 W-15)
card.ringBearer           true on the Ring-bearer, for every viewer
card.pairedWith           spec 0111: on a soulbond-paired permanent, its
                          partner's id ("card:N", the snapshot's own id,
                          PROTO-001), from Forge's current pair
                          (Card#getPairedWith; ViewerSnapshot#pairedWith),
                          only while both cards are on the battlefield and
                          phased in; both cards carry it, each naming the
                          other. Absent when unpaired. Public, the same for
                          both seats and the public view, face down or not
                          (an id is not an identity: the page names the
                          partner as the viewer may know it)
card.phasedOut            spec 0080: true on a phased-out permanent, which is
                          now sent (Forge's plain battlefield list leaves it
                          out, and the page drew it exiled); it stays in its
                          place, treated as though it doesn't exist. Public
card.shields              spec 0080: the regeneration shields waiting on a
                          permanent (Forge's Card#getShieldCount: made by a
                          Regenerate ability, used by a destroy, gone at
                          cleanup); absent when none. Public
card.indestructible       spec 0080: true while the permanent has
                          indestructible (Forge's keyword, as it applies
                          now). Public
card.preventNext          spec 0101: "prevent the next N damage" waiting on
                          the permanent (Forge's total,
                          GameEntityView#getPreventNextDamage); absent when
                          none. Also on players[i]. Public
players[i].controlledBy   spec 0102, item 2: another player controls this one
                          now (Mindslaver; Forge's
                          Player#getControllingPlayer): that seat; absent
                          otherwise. Public
players[i].controlledFrom spec 0102, item 2: with controlledBy, the card that
                          made it so ("card:N", where it lies now); stripped
                          like any id of a card the viewer cannot see now
                          (HiddenIds). Public
card.gained               spec 0085: on the battlefield, the keywords it has
                          that its face does not print (Forge's titles, as
                          `keywords` sends them: Run Amok's "Trample", Heroic
                          Intervention's "Hexproof", Mother of Runes'
                          "Protection from red"); absent when none. Only for a
                          card the viewer may identify. Public
card.unblockable          spec 0085: true while a "can't be blocked" it was
                          given applies to it (a CantBlockBy static naming no
                          blocker, not the card's own printed ability:
                          Distortion Strike, Rogue's Passage). Public
card.lostAbilities        spec 0085: on a creature, true while Forge has
                          removed all its abilities (Humility, Turn to Frog:
                          a "remove all" keyword change). Public
card.holds                spec 0085: the exiled cards this permanent holds,
                          ["card:N"], each in `exile` (named there as the
                          viewer may know it: a Hideaway card is face down to
                          the other player), as the game links them: exiled
                          until it leaves (Banishing Light), imprinted (Chrome
                          Mox), or moved there by its own ability from
                          anywhere but a graveyard (Oblivion Ring, Fiend
                          Hunter, Hideaway). Bojuka Bog's graveyard and a
                          spell's delve are not held. Public
card.copy                 spec 0079: true on a permanent that is a copy (a
                          Clone, a token copy: Cackling Counterpart), for
                          every viewer who may identify it (copiable values
                          are public)
card.copyOf               spec 0079: the card it copied, "card:N" -- Forge's
                          clone state's origin, or a token copy's making
                          ability's target as it entered; stripped (HiddenIds)
                          while that card is in a zone this viewer cannot see
card.artOwner             spec 0079: a copy's seat whose deck has the copied
                          card's picture, when not its own owner (the server
                          looks the picture up there; a token copy wears the
                          copied card's picture before any token picture)
card.prepared             spec 0082: on a creature that is prepared, its
                          prepared spell, "card:N" (Forge's
                          Card#getPreparedSpell); the spell waits face up in
                          its owner's exile, `copy` with `copyOf` the
                          creature, and stays a copy of it while it is cast
                          (`casting`) -- the link is kept by the worker, as
                          Forge unlinks it the moment the copy is cast.
                          Public. A cast copy (a prepared spell, a "cast a
                          copy") is a token spell: off the stack into a
                          graveyard it ceases to exist, a move to "nowhere"
action.cards[].toSaid     spec 0079: in a fizzle report, where a card the
                          spell aimed at is now, in the reader's words ("in
                          Bob's hand"); only while the reader may see it
card.locked               spec 0083 (15 A): on a Room on the battlefield, the
                          names of its doors still locked (Forge's
                          Card#getLockedRoomNames); absent when both are
                          open. Public. Its `faces` name the whole card, then
                          each door
card.basePower,           a creature's power and toughness before counters
card.baseToughness        and effects (Phase 9 W-19: "printed 2/3, now 4/5")
card.exiledBy             in exile: the name of the card that exiled it, for
                          every viewer who may identify the card (W-18)
card.playable             in exile: true when THIS viewer may play it from
                          there (Light Up the Stage); only in their snapshot
card.uses                 spec 0087: in a graveyard or an exile, who may
                          still use it from there and how: [{seat, how}],
                          `how` "cast" (a spell or a land: flashback,
                          escape, jump-start, an adventure, foretell, plot,
                          any "you may play it" -- Light Up the Stage,
                          Gonti's or Hostage Taker's card in the other
                          player's pile), "ability" (only an ability from
                          there: Unearth, Scavenge, Embalm, Encore)
                          or "suspended" (counting down, not playable; also
                          at 0 while its "cast it" trigger waits). From
                          Forge's Player#getCardsActivatableInExternalZones,
                          kept where Forge's zone check lets a spell or
                          ability be used from there or an effect lets that
                          player play it (a card that may only be looked at,
                          a Hideaway card, has none), plus suspended and
                          plotted cards. Timing and mana are not asked.
                          Every viewer is told (public); for a card the
                          viewer may NOT identify, only the public reasons
                          count (an effect lets that player play it, it is
                          foretold or plotted), whatever the card is, and
                          `how` is "cast" (or "suspended": a suspended card
                          is face up) -- so whether it stands in
                          a fan never says what it is. Absent: no one may
card.foretold             spec 0087: in exile, foretold (public; Forge's
                          CardView carries it to every client). The card is
                          face down to the other player
card.plotted              spec 0087: in exile, plotted (public)
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

Spec 0086 adds two `action` reports. At the start of an extra turn (Forge's
Player#isExtraTurn; the card that gave it is the one whose AddTurn effect
resolved for that player, newest first), to every player but the one who
played that card (its activating player; 0086 Amendment 4): "Extra turn: this
is Alice's turn again." to Bob, `source` the card
(Time Warp) and the card in `cards` where it is now. When a player completes
a dungeon (Player#getCompletedDungeons grew), to the other player only:
"Alice completed Tomb of Annihilation.", `source` the dungeon, no cards, and
`marks` [{kind: "dungeon", dungeon: "Tomb of Annihilation"}] (its map is the
picture).

Spec 0089 adds one more. When a combat phase begins and the turn has had one
already (Forge's PhaseHandler#getNumCombat), to every player but the one who
played the card that gave it (0089 Amendment 1): "Extra combat: Alice attacks
again." to Bob (a player given a combat or turn by someone else reads "you
attack again." / "your turn again."), `source`
the card whose AddPhase effect adding a combat resolved for that player,
newest first (Aurelia, the Warleader; Relentless Assault), that card in
`cards` where it is now. An Aura's umbra armor destroyed instead of its
creature is told as `survived` "umbra" only, with no report (its spec 0089
report was removed 2026-11-18, owner: no survive look gets a report window).

Values Forge tells a player (its notifyOfValue) are no notice since spec
0075: a die roll is `rolls` (its tumbling window, on both boards), a
choice the other player's `action` report, a coin flip both players'
("Alice flipped a coin and won." / "You flipped a coin and won.", a coin in
`marks`); the player who chose is told nothing.
A reveal shown in the report window (`reveal`, `action`) is no "Looking
at ..." notice either; since spec 0097 (item 9) a reveal with no window
(before a game has begun) is only logged by the worker, never a notice
(corrected 2026-11-18; MatchController.java, `tellRevealed`).
Spec 0083 (17): a card revealed from an opening hand before the game
began (Chancellor of the Annex) is the other player's `reveal`, with `by`,
`source` (the card) and `said` ("Bob revealed Chancellor of the Annex from
their opening hand"); it lasts through the first turn. Identical
replacement effects applied without a question (two Leylines of the Void)
are no notice ("they do the same thing here...") but `pulse`: {key
"pulse:N", cards ["card:N", ...]}, their permanents face up on the
battlefield, which the page pulses gold once per key. Public.

## What the board is told (Phase 7, §7.61)

Added 2026-10-21, each read from Forge, per viewer, checked by
`scripts/check-board-data.py` (Mechanics Lab):

```text
prioritySeat        B1  the seat holding priority now (Forge's priority
                        player); on your own turn often not activeSeat
player.manaPool     B6  floating mana by colour, {"R": 1}; absent when
                        the pool is empty. Public.
player.manaFrom         spec 0086 (Amendment 1): the same mana by colour
                        AND the card that made it, in the pool's order,
                        [{colour, from: "card:N", n}] -- Forge's own record
                        (Mana#getSourceCard): a Swamp's black is one run of
                        1, Dark Ritual's three one run of 3. `from` absent
                        when Forge names no card, or stripped (HiddenIds)
                        when that card is in a zone this viewer cannot see.
                        Present only with manaPool. Public
player.commandIds       spec 0086: one "card:N" per `command` entry, in
                        order -- a dungeon's room trigger and an emblem's
                        trigger name that id as their stack `source`, so
                        each rises from its map card or tile. Public
emblems                 spec 0086 (8): every emblem in a command zone, with
                        the card that made it (Forge's
                        Card#getEffectSource): [{id (the emblem, as in
                        commandIds), seat, from "card:N", name, owner,
                        printing?, known}] -- the maker's name, owner and
                        printing so the server puts that card's picture
                        (and art crop) on the entry, as on any card
                        (MatchArt). `known: false` and no from, name,
                        owner or printing (only {id, seat, known}) when
                        Forge does not know the maker or it is face down.
                        Absent
                        when there are none. Public
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
                        copy        spec 0079: true on a copy of a spell (Fork's,
                                    a storm copy); copyOf "stack:N", the entry
                                    it copies while that is on the stack;
                                    artOwner as for a card (Fork of Bob's Bolt).
                                    Spec 0082: also on a copy of an ability
                                    (Strionic Resonator's copy of a trigger;
                                    copyOf by Forge's CR 707.10b link) and on
                                    a copy that was cast (a prepared spell:
                                    no copyOf)
                        group       spec 0082: on a copy put onto the stack,
                                    the batch it was made in ("copies:N":
                                    storm's four, Fork's one), stable while
                                    it lasts; copyingId "copying:N", the id
                                    it had in `copying` on its way
                        splitSecond spec 0083 (18 B): true on a spell with
                                    split second (the keyword Forge's
                                    isSplitSecondOnStack reads)
                        from        spec 0086 (Amendment 1): "monarch" or
                                    "initiative" on a trigger that is that
                                    designation's own (the effect card Forge
                                    keeps for it: the monarch's end-step
                                    draw, the initiative's venture); the
                                    page raises it from the crown or token
                        ward        spec 0101: true on a ward trigger
                                    (Forge's keyword origin, Keyword.WARD)
                        rest        spec 0105: {ms, arriveMs} on the TOP entry
                                    alone, while the game holds the pass that
                                    lets it resolve because nobody was asked
                                    about it (StackRests): the worker waits
                                    `ms` after this board (`arriveMs` of it is
                                    the allowance for the card to reach the
                                    stack on the slowest screen: 3400 a cast
                                    spell, 700 an ability, trigger or copy, 0
                                    in a run; `ms` 5900 / 3200 / 800). The
                                    same on every seat's board and the public
                                    view; no card, reason or seat. Presentation
                                    only (PROTO-007): the page draws its ring;
                                    the entry leaves with the next board
                        cantBeCountered spec 0083: true on a spell Forge's
                                    Spell#isCounterableBy says no counterspell
                                    can counter (Abrupt Decay). splitSecond and
                                    cantBeCountered only for a spell this
                                    viewer may identify
                        description is "Face-down spell" when its source
                                    is a face-down card this viewer may not
                                    identify (it began with the card's name)
                        Spec 0100 -- what its caster chose, announced as
                        it was cast (CR 601.2b-c), so public; only on a
                        spell (copies too, in `copying`), and never for one
                        this viewer may not identify (a face-down spell):
                        x           the X paid (SpellAbility#getXManaCostPaid),
                                    when its cost has X
                        modes       [{text, chosen}], every mode of a modal
                                    spell in printed order (its "Choices"),
                                    chosen = chained onto it as Forge's
                                    CharmEffect#chainAbilities does
                        extra       ["kicked" | "overloaded" | "evoked" |
                                    "entwined" | "escalated", ...]; escalated
                                    = the keyword Escalate and more than one
                                    mode chosen (Forge has no isEscalate)
                        kicks       multikicker's count, when kicked
                        hits        an overloaded spell: ["card:N", ...], the
                                    permanents its overloaded effect's own
                                    `Defined` filter affects now, asked each
                                    snapshot (none when the filter has X)
                        targets[].amount  divided damage: the share the
                                    caster chose for that target
                                    (TargetChoices#getDividedValue), only for
                                    a spell divided as its caster chooses (Arc
                                    Lightning, not Fireball's even split)
                        All optional: an older worker sends none.
copying             spec 0082: the copies on their way onto the stack
                        (storm's, Fork's, a Resonator's), shaped as stack
                        entries, top first: id "copying:N", source, name,
                        controller, kind, copy, copyOf, group, targets (none
                        while they are being chosen), and `aiming: true` on
                        the one being asked "new target?". Each is listed
                        while it is asked and while Forge holds it (its
                        frozen stack) until its maker has resolved; then it
                        is on the stack with the same group. A copy put
                        onto the stack is never in `casting` (it is not
                        cast). Absent when there are none. Public
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
                        Spec 0077 (2026-11-12): a hit on a player carries
                        `infect: true` when Forge marked it infect -- it
                        gave poison counters, not life (CR 120.3b); before
                        0077 the flag was dropped and the page took it for
                        life damage.
                        Spec 0080 (2026-11-12): damage a prevention effect
                        stopped (Fog, Holy Day, protection from a colour,
                        "prevent the next N") is a hit of its own, {source,
                        target, amount: 0, prevented: N} -- its would-be
                        amount less what got through, where it would have
                        landed in the wave; a wave is sent even when ALL
                        of it was prevented (before 0080, none was, and no
                        fight played). Read as Forge asks a controller
                        which damage replacement to apply (reflective:
                        Survivors.DAMAGE_LIST, VEND-004).
                        Spec 0101: such a hit carries `by` "shield" when a
                        shield counter stopped it, "prevent-next" when a
                        "prevent the next N" shield did.
                        Spec 0084 (2026-11-13): the damage of a fight or
                        bite spell or ability (Prey Upon: Forge's Fight
                        effect; Ram Through: a DealDamage whose damage
                        source is another creature) adds `fight: true`
                        and `fights` in the combat step's shape -- a
                        fight {attacker, defender: {object}, blockers:
                        [defender]} (both strike), a bite with blockers []
                        (only the biter strikes). Never with `combat`.
life                    spec 0077: every change to a player's life or
                        poison since the last round, in the order Forge
                        made them: {key: "life:REV", changes: [{player,
                        kind, amount, source?, combat?}]}; a new key is a
                        new round
                          kind    "damage" (Forge reported the hit before
                                  the life it took), "loss" (any other life
                                  lost: Sign in Blood, Gray Merchant, paying
                                  life), "gain", "poison" (counters given:
                                  infect, toxic; a removal is not told).
                                  An infect hit is never "damage"
                          amount  above 0
                          source  "card:N": the damage's source; a
                                  lifelink gain's source; a combat step's
                                  poison when one card gave it all (Forge
                                  gives it in one go, after the hits);
                                  otherwise the card whose spell or ability
                                  was resolving. Absent when not known, and
                                  removed per seat when the card is by then
                                  in a zone that seat cannot see
                                  (HiddenIds, HID-001)
                          combat  true for a combat damage step's (the page
                                  plays those with the fights)
                        Sent to every seat and the public view (life and
                        poison are public).
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
option.fight        0107 a "Change split" option ("split:card:N", label
                        "Change split"): on the attacking player's own
                        priority question at declare blockers, one per
                        blocked attacker with trample whose damage beats
                        its blockers' total lethal. The fight it changes,
                        in the damage question's `arrange.damage` shape
                        ({damage, attacker, blockers [{card, lethal}],
                        trample}), plus `usual` {blockers [n...], player n}:
                        the split made for the player at damage when they
                        don't change it. No `objectId` (the board draws it
                        as its own button under `attacker`). Chosen, the
                        damage question is asked at once (as at damage,
                        one point at a time); the answer is kept by the
                        worker for damage and the same priority question
                        comes again. It reaches the asked seat only, like
                        every question, and never any board.
```


## Only what changed (Phase 11 P11-D4, spec 0117, 2026-11-23)

The match socket `/ws/matches/{id}?deltas=1`: the page says it takes deltas
(a format choice, nothing else; no `protocolVersion` bump). Without it (an
older page, a tool, a test), every board is a whole `MATCH_SNAPSHOT`, exactly
as after P11-D3. With it, each board after the connection's first is sent as
what changed since the board THIS connection was last sent:

```text
MATCH_DELTA   server -> browser, flat (envelope + these fields)
  gameEpoch   the game it belongs to (a new game is always a whole board)
  from        stateRevision of the board this connection was last sent (the base)
  to          stateRevision of the board it makes
  set?        {key: value}   top-level keys whose value changed (or appeared), whole
  unset?      [key]          top-level keys the new board no longer has
  lists?      {key: {put?: [item], drop?: [key], order?: [key]}}
              a top-level list whose entries, old and new, are all objects with a
              unique `id` (the zones, the stack) or, with no `id`, a unique `seat`
              (`players`), patched by item: `put` each item new or changed, whole,
              in the new order; `drop` the keys of items gone; `order` every key in
              the new order, only when it is not "the kept items in their old
              order, then the new ones in put's order". Any other list goes whole
              in `set`.
  kept? payments? rolls? notices?   P11-D3's history, exactly as on a board
  whole?      TEST ONLY (PROXIC_TEST_DELTA_CHECK): the full board, to compare

MATCH_RESYNC  browser -> server: {have?: {gameEpoch, stateRevision}}
```

- Nothing finer than one item: a changed card goes whole. Two values are equal
  when their JSON is equal, ignoring key order. The rule knows keys, lists and
  ids, never cards (ARCH-005): server `BoardDelta.kt`, page `delta.ts`, Lab
  gate `scripts/check-deltas.py`, held together by `fixtures/delta/`.
- The page applies a delta only when the base it holds (the last whole board
  it took, as sent; `MATCH_STEP` never changes it) has that `gameEpoch` and
  `stateRevision` = `from`. Revisions rise but are not consecutive for a seat,
  so "follows" means "builds on what I have", never "to = from + 1". Whatever
  the delta does not name is the base's own object.
- A whole `MATCH_SNAPSHOT` goes instead on a connection's first board (join,
  reconnect, reload, second tab, a spectator arriving), a new game
  (`gameEpoch`), every new turn (the checkpoint: its history lists whole too),
  a `MATCH_RESYNC`, a delta no shorter than the board, and whenever deltas are
  off. A board older than the base goes whole and is not remembered. The page
  takes a full board at any time.
- `MATCH_RESYNC`: a delta that does not fit (only ever a bug) makes the page
  ask once and drop deltas until a full board comes; with none in 3 s it
  closes the socket and the reconnect brings one. The server reads nothing
  from it but that it came on this connection (`have` is logged, as numbers,
  never acted on: §6.100), forgets the connection's memory and answers as to
  a new connection without the hello: the stored board whole with the whole
  play log, the pending question, `MATCH_ASKING`. At most one a second; each
  is logged ("asked for a full board (had e/r, sent e/r)").
- Hidden information (P11-R4): a delta is made from the connection's own last
  board and its new one only, so every id it names is in one of them.
- Switches: `PROXIC_MATCH_DELTAS` (default true) and `PROXIC_SPECTATOR_DELTAS`
  (default false, owner decision 2) are production settings; both off mean
  today's whole boards. `PROXIC_TEST_DELTA_CHECK=true` (TEST ONLY: the local
  and CI overrides; `scripts/check-test-switch.py` keeps it out of the
  production files) adds `whole` to every delta; the page compares it with
  what it rebuilt and logs `DELTA_MISMATCH` on a difference, which fails any
  browser test (`frontend/e2e/match-helpers.ts`).

## A connection that falls behind (Phase 11 P11-D6, spec 0119, 2026-11-26)

Each match connection (players' and spectators') has its own queue on the
server: whatever the game says is put in it at once, and the connection's own
coroutine sends it in order, each board through the connection's stream (the
D3/D4 memory above moves only as a board actually leaves). So no page's socket
ever holds up the game or another page.

```text
(close 4002 "behind")   server -> browser: this connection's oldest message
                        waited more than 10 s to go out (or 1,000 waited at
                        once); nothing more is sent on it
```

- Nothing else on the wire changes: no new message, no `protocolVersion` bump.
  The page treats 4002 as any lost connection (not 1008): it reconnects
  (`MATCH_RECONNECT_DELAYS`) and its new connection's first board is whole.
- If even the close cannot be written within 2 s (a page that stopped
  reading), the server ends the connection without it; the page sees a
  dropped connection (1006) and reconnects the same way.
- Logged as `match <id>: connection <c> fell behind (<n> waiting, the oldest
  for <ms> ms): closed`, and every connection's close line says how its queue
  went (`queue: most waiting <n>, longest wait <ms> ms`).

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

- The worker accepts it only when started with `--lab-deal`.
  `scripts/lab.py` passes that; the server starts the worker as
  `java -jar <jar> <res>` (`workerCommand`), adding `--lab-deal` only
  when spec 0098's test switch is on (below). Without the flag, a seat
  carrying it is refused: `ERROR LAB_DEAL_REFUSED`, no game.
- Nothing a player sends becomes the field: `WorkerFrames.startGameFrame`
  builds each seat field by field (`displayName`, `seatNumber`, `cards`,
  `stops`, and `labDeal` only from the server's own test-deal store)
  (`WorkerFramesTest` "the start frame never carries the Lab's deal").
- A seat without it is dealt exactly as before: no listener is even
  subscribed (`LabDealTest`). A deal the deck cannot make (a name it
  lacks, more than seven for the hand) is refused before the game.


## Test-only: exact test games (server, spec 0098, 2026-11-16)

**Never set in production.** `PROXIC_TEST_DEALS=true` lets a browser test
deal set cards, through the Lab's deal above. It is set only in
`docker-compose.local.yml` and `docker-compose.ci.yml`; CI's
`scripts/check-test-switch.py` fails if `docker-compose.yml`,
`docker-compose.unraid.yml` or the `Dockerfile` names it at all.

With the switch on (only then):

```text
POST /api/matches/test-deal        signed in + CSRF, like every /api/matches route
  {"players": [{"username": "RudeLeft", "hand": [names], "top": [names]},
               {"username": "Pat", ...}]}
  204   queued for the NEXT match between exactly these two accounts
        (taken once; forgotten after 10 minutes)
  400   not two different players, more than 7 for a hand, 60 for the top,
        or a blank or over-200-character card name
  403   NOT_YOUR_MATCH -- the caller is not one of the two
  422   NO_SUCH_PLAYER
```

When that match starts, each seat's deal becomes its START_GAME `labDeal`
and the worker is started with `--lab-deal`; a deal the deck cannot make
fails the start (`LAB_DEAL_REFUSED`). The e2e helper is `startAMatch(...,
{ deal: { host, guest } })` (`queueDeal` in `frontend/e2e/match-helpers.ts`;
path corrected 2026-11-18).

With the switch off (production): the route is not mounted (404, nothing
queued), the runtime has no store, and the worker has no `--lab-deal`
(`MatchRoutesTest` "a test deal is refused with the switch off",
`TestDealLaunchTest`, `TestDealsTest`).

Why an endpoint and not a field on `POST /api/matches`: §6.10 says the
browser supplies only the setup id when it starts a match, never Forge
options. A field there would sit in the production request body, switch or
not; an unmounted route is no surface at all. Hidden information is
unchanged: the deal orders a library before the opening hand; what each
seat is sent is still Forge's per-viewer answer.
