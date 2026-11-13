package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.player.PlayerView;
import forge.game.zone.ZoneType;

import java.util.Map;

/**
 * What ONE player can see — PHASE_06 §6.40–§6.48.
 *
 * §6.40: every snapshot is built for a specific authorised
 * viewer, and two players in the same game receive different
 * ones. This class is called once per seat, and the seat it is
 * called for is the only thing that decides what it contains.
 *
 * §6.42 is the rule that shapes it: hidden information is
 * REMOVED HERE, not hidden in the browser. A client that receives
 * an opponent's hand and declines to draw it has already lost the
 * information — anybody can open a developer console.
 *
 * §6.43 forbids the simplified version everyone writes first
 * ("hand is hidden, battlefield is visible"). Forge's own
 * visibility is used instead, through the view layer its own
 * clients use.
 *
 * §6.44 IS THE DANGEROUS PART, and Phase 0A measured both ways of
 * getting it wrong:
 *
 *   canBeShownTo          zone-level, and returns TRUE
 *                         UNCONDITIONALLY for the battlefield
 *   canFaceDownBeShownTo  identity-level, and the only thing that
 *                         governs a face-down permanent
 *
 *   [RUN] zone check only       -> 5 face-down creatures leaked
 *                                  their identity
 *   [RUN] trusting getName()    -> 650 nameless sightings; the
 *                                  card was blanked for its OWN
 *                                  controller
 *
 * So both are asked, per card, per viewer, and the NAME is read
 * only after they both pass. A player may look at their own
 * face-down permanents (CR 713.4a), which the second check
 * already encodes — that is precisely why it is Forge's job and
 * not ours.
 */
final class ViewerSnapshot {

    private ViewerSnapshot() {
    }

    /**
     * Build the snapshot one seat is allowed to see.
     *
     * @param seatOf maps a Forge player to the Arena seat number,
     *               because §6.46 forbids identifying anything by
     *               name and a display name is not unique.
     */
    static JsonObject of(
            Game game,
            Player viewer,
            Map<Player, Integer> seatOf,
            long revision,
            java.util.List<String> notices,
            int gameEpoch,
            Causes causes) {
        return of(game, viewer, seatOf, revision, notices, gameEpoch, causes, null);
    }

    /** The same, with who has seen which hand card (spec 0070, Amendment 1); null: nobody. */
    static JsonObject of(
            Game game,
            Player viewer,
            Map<Player, Integer> seatOf,
            long revision,
            java.util.List<String> notices,
            int gameEpoch,
            Causes causes,
            SeenHands seen) {
        // Spec 0047 -- a null viewer is the PUBLIC view, for spectators:
        // nobody's hand, no library, nothing face down, no notices.
        PlayerView viewing = viewer == null ? null : viewer.getView();

        JsonObject snapshot = new JsonObject();
        snapshot.addProperty("stateRevision", revision);
        // §6.70 — which game of the match this board belongs to.
        snapshot.addProperty("gameEpoch", gameEpoch);

        // P6-AM — what Forge told THIS viewer, most recent last.
        // Only this seat's own, because a notice can be private.
        JsonArray told = new JsonArray();
        notices.forEach(told::add);
        snapshot.add("notices", told);
        snapshot.addProperty("turn", game.getPhaseHandler().getTurn());
        // EMPTY, not "null". There is no phase before the game
        // begins, and String.valueOf turns that into the four
        // letters n-u-l-l -- which the page then printed, because
        // the board now renders during the mulligans.
        forge.game.phase.PhaseType phase = game.getPhaseHandler().getPhase();
        snapshot.addProperty("phase", phase == null ? "" : phase.toString());
        Player active = game.getPhaseHandler().getPlayerTurn();
        snapshot.addProperty("activeSeat", active == null ? 0 : seatOf.getOrDefault(active, 0));
        // §7.61 B1 -- who may act now: the priority holder, Forge's own.
        // On your own turn the active player and the priority holder are
        // often different seats, and the board shows both (the canvas's
        // ring and dot).
        Player priority = game.getPhaseHandler().getPriorityPlayer();
        snapshot.addProperty("prioritySeat", priority == null ? 0 : seatOf.getOrDefault(priority, 0));
        if (viewer == null) {
            // Seat 0, nobody's; drawn from the first seat's side of the table.
            snapshot.addProperty("seat", GameHost.PUBLIC_SEAT);
            snapshot.addProperty("spectator", true);
            snapshot.addProperty("viewFrom", seatOf.values().stream().mapToInt(Integer::intValue).min().orElse(1));
        } else {
            snapshot.addProperty("seat", seatOf.getOrDefault(viewer, 0));
        }

        JsonArray players = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            JsonObject entry = new JsonObject();
            entry.addProperty("seat", seatOf.getOrDefault(player, 0));
            entry.addProperty("name", player.getName());
            entry.addProperty("life", player.getLife());
        // §7.61 B6 -- mana floating in the pool, by colour; absent when
        // the pool is empty. Public: mana in a pool is on the table.
        JsonObject pool = manaPool(player);
        if (pool != null) {
            entry.add("manaPool", pool);
        }
            // COUNTS, not contents. A library is hidden from
            // everyone including its owner, and a hand is hidden
            // from the opponent; how MANY is public in both cases
            // and is most of what a player needs to read a board.
            entry.addProperty("handCount", player.getCardsIn(ZoneType.Hand).size());
            entry.addProperty("libraryCount", player.getCardsIn(ZoneType.Library).size());
            entry.addProperty("graveyardCount", player.getCardsIn(ZoneType.Graveyard).size());
            // Phase 9 W-15 -- how many times this player has mulliganed:
            // public, as in paper Magic (owner 2026-11-03).
            entry.addProperty("mulligans", player.getStats().getMulliganCount());

            // §6.96, P6-AO — Forge's PLAYER state beyond the zones,
            // carried generically rather than one field per rule:
            // every counter Forge keeps on the player (poison, energy,
            // experience, rad, tickets...), the designations Forge
            // assigns (monarch, initiative, the city's blessing), and
            // what sits in the command zone (a dungeon, an emblem, the
            // Ring). All public information.
            JsonArray playerCounters = new JsonArray();
            player.getCounters().entrySet().forEach(counter -> {
                JsonObject kind = new JsonObject();
                kind.addProperty("name", String.valueOf(counter.getElement()));
                kind.addProperty("count", counter.getCount());
                playerCounters.add(kind);
            });
            if (playerCounters.size() > 0) {
                entry.add("counters", playerCounters);
            }
            JsonArray designations = new JsonArray();
            if (game.getMonarch() == player) {
                designations.add("monarch");
            }
            if (game.getHasInitiative() == player) {
                designations.add("initiative");
            }
            if (player.hasBlessing()) {
                designations.add("city's blessing");
            }
            if (designations.size() > 0) {
                entry.add("designations", designations);
            }
            JsonArray command = new JsonArray();
            JsonArray commandWords = new JsonArray();
            for (Card card : player.getCardsIn(ZoneType.Command)) {
                // Emblems, dungeons and real cards -- not Forge's own
                // EFFECT pieces, which are how it keeps "Blight Mamba's
                // Regeneration" or "The Monarch" (already a designation
                // above). Seen on the board as "command zone: Blight
                // Mamba (62)'s Regeneration", which no player put there.
                // The Ring is one of those pieces to Forge, but to the
                // rules it is an emblem the player has (701.54a), and
                // it is public (Call of the Ring, 2026-10-20).
                if (card.isImmutable() && !card.isEmblem() && !card.getType().isDungeon()
                        && card != player.getTheRing()) {
                    continue;
                }
                // A dungeon with the room its venture marker is in:
                // "Undercity" alone does not say what the next venture
                // does (found by the White Plume Adventurer scenario,
                // check-tracked-state.py, 2026-10-20).
                String room = card.getType().isDungeon() ? card.getCurrentRoom() : null;
                command.add(room == null || room.isBlank() ? card.getName() : card.getName() + " (room: " + room + ")");
                commandWords.add(commandWords(card, room));
            }
            if (command.size() > 0) {
                entry.add("command", command);
                // Phase 9 W-21 (Amendment 18): what each one does, in the
                // game's own words, one entry per `command` entry, in order.
                entry.add("commandWords", commandWords);
            }
            // The Ring: how many times it has tempted this player,
            // which decides what the Ring-bearer has (Call of the
            // Ring). The bearer itself is marked on its card.
            if (player.getNumRingTemptedYou() > 0) {
                entry.addProperty("ringTempted", player.getNumRingTemptedYou());
            }
            JsonArray completed = new JsonArray();
            for (Card dungeon : player.getCompletedDungeons()) {
                completed.add(dungeon.getName());
            }
            if (completed.size() > 0) {
                entry.add("dungeonsCompleted", completed);
            }
            players.add(entry);
        }
        snapshot.add("players", players);

        // §6.96 — global state: day or night, once a daybound card has
        // made it one (Forge's null means neither yet).
        //
        // Forge's own isDay()/isNight(), NOT getDayTime(): its field is
        // TRUE FOR NIGHT, and reading it as "true = day" showed every
        // player day at night and night by day (found by the daybound
        // scenario, check-shapes.py, 2026-10-20).
        if (!game.isNeitherDayNorNight()) {
            snapshot.addProperty("dayTime", game.isDay() ? "day" : "night");
        }

        JsonArray battlefield = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            // Spec 0080 -- phased-out permanents too (Forge's plain
            // getCardsIn leaves them out, and the page drew them exiled),
            // each flagged `phasedOut` by describe(). Public: they stay on
            // the battlefield, treated as though they don't exist.
            for (Card card : player.getCardsIn(ZoneType.Battlefield, false)) {
                JsonObject described = describe(card, viewing, seatOf);
                // Spec 0045 -- where its counters came from (public).
                JsonArray origins = causes == null || !described.has("counters")
                        ? null : causes.counterOrigins(card);
                if (origins != null) {
                    described.add("counterFrom", origins);
                }
                // Spec 0046 -- what a land makes, from its mana abilities
                // as they are now (public: the card is on the table).
                if ("land".equals(described.has("kind") ? described.get("kind").getAsString() : null)) {
                    JsonArray makes = manaMade(card);
                    if (makes.size() > 0) {
                        described.add("makes", makes);
                    }
                }
                // Spec 0082 -- a creature that is prepared names its prepared
                // spell (Forge's own link; public: the spell waits in exile,
                // face up), and the link is kept for when the spell is cast.
                Card preparedSpell = card.getPreparedSpell();
                if (preparedSpell != null) {
                    Copies.of(game).notePrepared(card);
                    described.addProperty("prepared", "card:" + preparedSpell.getId());
                }
                battlefield.add(described);
            }
        }
        snapshot.add("battlefield", battlefield);

        // The viewer's OWN hand. Not filtered in the browser:
        // nobody else's cards are put on the wire at all.
        JsonArray hand = new JsonArray();
        for (Card card : viewer == null ? java.util.List.<Card>of() : viewer.getCardsIn(ZoneType.Hand)) {
            hand.add(describe(card, viewing, seatOf));
        }
        // Spec 0070, Amendment 1 -- the eye on each of the viewer's own hand
        // cards another seat has seen, until it leaves the hand.
        int viewerSeat = viewer == null ? 0 : seatOf.getOrDefault(viewer, 0);
        if (seen != null && viewer != null) {
            seen.markOwnHand(hand, viewerSeat);
        }
        snapshot.add("hand", hand);

        // §6.37, §6.38 — OTHER players' hand cards, only those Forge
        // says this viewer may see. Under Mindslaver the controller
        // "sees all cards that player could see and makes all
        // decisions for the player"; with only the viewer's own hand
        // here, the controller answered every question about the
        // controlled player's turn without seeing their hand. Also
        // Telepathy-style "play with your hand revealed".
        //
        // Hidden cards are NOT sent as unknowns: a hidden card's id
        // is stable across zones, and an id on the wire is a card
        // that can be followed. The count is already public.
        JsonArray otherHands = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            if (player == viewer) {
                continue;
            }
            for (Card card : player.getCardsIn(ZoneType.Hand)) {
                CardView view = card.getView();
                // Spec 0070, Amendment 1 -- a card Forge revealed to THIS
                // viewer from that hand, still in it: shown to them alone,
                // face up, with the eye, until it leaves the hand.
                boolean sawIt = seen != null && viewer != null && seen.seenBy(card.getId(), viewerSeat);
                if (view.canBeShownTo(viewing) && view.canFaceDownBeShownTo(viewing)) {
                    // describe() says whose hand it is: a hand card's
                    // `owner`, which `seat` (the controller) need not be.
                    JsonObject entry = describe(card, viewing, seatOf);
                    if (sawIt) {
                        entry.addProperty("seen", true);
                    }
                    otherHands.add(entry);
                } else if (sawIt) {
                    JsonObject entry = describe(card, viewing, seatOf, true);
                    entry.addProperty("seen", true);
                    otherHands.add(entry);
                }
            }
        }
        snapshot.add("otherHands", otherHands);

        JsonArray graveyard = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            for (Card card : player.getCardsIn(ZoneType.Graveyard)) {
                graveyard.add(describe(card, viewing, seatOf));
            }
        }
        snapshot.add("graveyard", graveyard);

        // Exile is public, and it is where cards GO and WAIT: delve's
        // and Force of Will's payments, an Adventure creature to cast
        // later, a Karn-exiled card. It was missing from the snapshot,
        // so a player was never told (P6-AN, P6-AJ). Same rule as every
        // zone: describe() names only what this viewer may identify, so
        // a face-down exiled card (foretell) stays "Face-down".
        JsonArray exile = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            for (Card card : player.getCardsIn(ZoneType.Exile)) {
                JsonObject entry = describe(card, viewing, seatOf);
                // Phase 9 W-18 -- why it is here: the card that exiled it
                // (public, as that card was), and whether THIS viewer may
                // play it from exile (Light Up the Stage, an Adventure),
                // told only in this viewer's own snapshot.
                Card by = card.getExiledWith();
                if (entry.get("known").getAsBoolean() && by != null && !by.isFaceDown()
                        && by.getName() != null && !by.getName().isEmpty()) {
                    entry.addProperty("exiledBy", by.getName());
                }
                if (viewer != null && !card.mayPlay(viewer).isEmpty()) {
                    entry.addProperty("playable", true);
                }
                exile.add(entry);
            }
        }
        snapshot.add("exile", exile);

        JsonArray stack = new JsonArray();
        game.getStack().forEach(instance -> {
            JsonObject entry = new JsonObject();
            // §6.46 — TYPED, and typed for a measured reason: a
            // stack instance's id counts from 1 independently of
            // Card.getId(), entirely inside the card range. One
            // Phase 0A run caught a stack instance whose id
            // equalled its own source card's.
            entry.addProperty("id", "stack:" + instance.getId());
            Card source = instance.getSourceCard();
            boolean hidden = source != null && source.isFaceDown()
                    && !(source.getView().canBeShownTo(viewing) && source.getView().canFaceDownBeShownTo(viewing));
            // Forge's own wording -- unless it is about a face-down card
            // this viewer may not identify: it starts with the card's name.
            // Spec 0057, item 1: no script shorthand ("Card.Green") reaches a player.
            entry.addProperty("description", hidden ? "Face-down spell" : PlainWords.humanise(String.valueOf(instance)));
            // §7.61 B2 -- the stack as cards: what it is, whose it is, and
            // where it came from, the name as this viewer may know it.
            if (source != null) {
                entry.addProperty("source", "card:" + source.getId());
                entry.addProperty("name", nameFor(source, viewing));
                // The card's owner, whose deck its picture is in: a spell
                // cast from an opponent's library is the caster's spell
                // (`controller`) and still the opponent's card.
                entry.addProperty("owner", seatOf.getOrDefault(source.getOwner(), 0));
                // Spec 0079, item 1 -- a copied spell (Fork's copy, a storm
                // copy) is marked a copy, with the stack entry it copies
                // while that is still on the stack. Public: a copy is put on
                // the stack in front of everyone. Its picture is the copied
                // card's, in that card's owner's deck (`artOwner`).
                if (instance.isSpell() && source.isCopiedSpell()) {
                    entry.addProperty("copy", true);
                    forge.game.spellability.SpellAbilityStackInstance of = Copies.copiedEntry(game, source);
                    if (of != null) {
                        entry.addProperty("copyOf", "stack:" + of.getId());
                    }
                    Player artOwner = Copies.of(game).artOwner(game, source);
                    if (artOwner != null && !hidden) {
                        entry.addProperty("artOwner", seatOf.getOrDefault(artOwner, 0));
                    }
                } else if (!instance.isSpell() && instance.getSpellAbility() != null
                        && instance.getSpellAbility().isCopied()) {
                    // Spec 0082 -- a copy of an ability (Strionic Resonator
                    // copying a trigger) is marked too, naming the entry it
                    // copies (Forge's CR 707.10b link).
                    entry.addProperty("copy", true);
                    forge.game.spellability.SpellAbilityStackInstance of =
                            Copies.originalEntry(game, instance.getSpellAbility());
                    if (of != null) {
                        entry.addProperty("copyOf", "stack:" + of.getId());
                    }
                } else if (instance.isSpell() && Copies.of(game).isCastCopy(source)) {
                    // Spec 0082 -- a copy that was CAST (a prepared spell,
                    // "cast a copy"): a copy all the same, ending in motes.
                    entry.addProperty("copy", true);
                }
                // Spec 0082 -- the batch a copy was made in, so its "xN"
                // card keeps one identity while it ticks down.
                String group = Copies.of(game).groupOf(instance.getSpellAbility());
                if (group != null) {
                    entry.addProperty("group", group);
                    // And the id it had on its way (`copying`), so the board
                    // knows it is the same copy, now on the stack.
                    entry.addProperty("copyingId", "copying:" + instance.getSpellAbility().getId());
                }
                // A spell's printed cost, when this viewer may know the card.
                if (instance.isSpell() && !hidden) {
                    forge.card.mana.ManaCost printed = source.getManaCost();
                    if (printed != null && !printed.isNoCost()) {
                        entry.addProperty("manaCost", printed.toString());
                    }
                }
            }
            Player by = instance.getActivatingPlayer();
            entry.addProperty("controller", by == null ? 0 : seatOf.getOrDefault(by, 0));
            entry.addProperty("kind", instance.isSpell() ? "spell" : instance.isTrigger() ? "trigger" : "ability");
            // §7.61 B3 -- what it targets, every part of it (Electrolyze's
            // second half has targets of its own).
            entry.add("targets", targetsOf(game, instance.getSpellAbility(), seatOf));
            // Spec 0045 -- why a trigger triggered, from what Forge
            // stored on it. Public: the trigger's cause is on the table.
            String why = causes == null || hidden ? null : causes.why(instance.getSpellAbility());
            if (why != null) {
                entry.addProperty("why", why);
            }
            stack.add(entry);
        });
        snapshot.add("stack", stack);

        // Spec 0042 -- the spell being CAST: Forge puts the card on the
        // stack zone first (CR 601.2a) and the spell on the stack only
        // once its targets and costs are chosen. In between it was in
        // no list at all, so the player paying could not see what they
        // were paying for. Public from that first step; describe()
        // still names only what this viewer may identify (a face-down
        // spell stays "Face-down").
        java.util.Set<Integer> onStack = new java.util.HashSet<>();
        game.getStack().forEach(instance -> {
            if (instance.getSourceCard() != null) {
                onStack.add(instance.getSourceCard().getId());
            }
        });
        JsonArray casting = new JsonArray();
        for (Card card : game.getCardsIn(ZoneType.Stack)) {
            // Spec 0082 -- a copy put straight onto the stack (storm's, Fork's)
            // is never cast: Forge holds it in the stack zone while its
            // maker resolves, and it read as a spell being cast (a loose
            // Grapeshot in the middle; a card seeming to leave her hand).
            // It is in `copying` below instead.
            if (!onStack.contains(card.getId()) && !card.isCopiedSpell()) {
                casting.add(describe(card, viewing, seatOf));
            }
        }
        snapshot.add("casting", casting);

        // Spec 0082 -- the copies on their way onto the stack: each while
        // it is asked "new target?" (`aiming`) and while Forge holds it
        // until its maker has resolved, in the order they will be on the
        // stack, top first. Shaped as stack entries. Public: a copy is put
        // on the stack in front of everyone, and its targets are announced.
        JsonArray copying = new JsonArray();
        Copies copies = Copies.of(game);
        for (forge.game.spellability.SpellAbility sa : copies.waiting(game)) {
            copying.add(copyingEntry(game, sa, copies, viewing, seatOf));
        }
        if (copying.size() > 0) {
            snapshot.add("copying", copying);
        }

        // Spec 0045 -- the cards Forge last showed THIS viewer (Goblin
        // Ringleader's four), face up because Forge revealed them to
        // this seat, each with where it went once that is settled.
        if (causes != null && viewer != null) {
            JsonObject reveal = causes.revealFor(seatOf.getOrDefault(viewer, 0),
                    card -> describe(card, viewing, seatOf, true));
            if (reveal != null) {
                snapshot.add("reveal", reveal);
            }
            // Phase 9 Amendment 12 -- who did it and what they did, in this
            // reader's words, with only the cards this reader may know.
            int readerSeat = seatOf.getOrDefault(viewer, 0);
            JsonObject action = causes.actions().reportFor(viewer,
                    id -> causes.revealedTo(readerSeat, id),
                    card -> describe(card, viewing, seatOf, true),
                    who -> seatOf.getOrDefault(who, 0));
            if (action != null) {
                snapshot.add("action", action);
            }
        }

        // §7.61 B4 -- combat: who attacks what, who blocks whom. Public,
        // and Forge's own record of it, not inferred from the cards'
        // attacking/blocking flags.
        JsonObject fight = combatOf(game, seatOf);
        if (fight != null) {
            snapshot.add("combat", fight);
        }

        return snapshot;
    }

    /**
     * One card, as this viewer may see it.
     *
     * The two checks of §6.44, in order, and the name read only
     * if both pass. Everything else about the card — that it
     * exists, who controls it, whether it is tapped — is public
     * on the battlefield and is sent regardless, because hiding
     * it would misrepresent the board rather than protect
     * anything.
     */
    /**
     * A card's name as [viewer] may know it, for question labels --
     * P6-I. Face up, its name. Face down, its real name and how it
     * lies for a viewer Forge lets identify it (its controller), and
     * "Face-down" for anybody else: a label is as much on the wire as
     * a snapshot.
     */
    static String nameFor(Card card, PlayerView viewer) {
        if (!card.isFaceDown()) {
            return card.getName();
        }
        CardView view = card.getView();
        if (viewer == null || !(view.canBeShownTo(viewer) && view.canFaceDownBeShownTo(viewer))) {
            return "Face-down";
        }
        String real = card.getState(forge.card.CardStateName.Original).getName();
        return real == null || real.isEmpty() ? "Face-down" : real + " (face down)";
    }

    /**
     * Spec 0058, item 8 -- one card of a mutated pile by ITS OWN name. The
     * pile's permanent wears the top card's state (Forge's clone state), so
     * its current name is the top card's: the bottom Grizzly Bears read
     * "Gemrazer" (found by check-shapes.py). Its original state is its own.
     */
    static String ownName(Card part, PlayerView viewer) {
        if (part.isFaceDown()) {
            return nameFor(part, viewer);
        }
        forge.game.card.CardState own = part.getOriginalState(part.getCurrentStateName());
        if (own == null) {
            own = part.getState(forge.card.CardStateName.Original);
        }
        String name = own == null ? null : own.getName();
        return name == null || name.isEmpty() ? nameFor(part, viewer) : name;
    }

    /** The order a land's pill lists its mana in. */
    private static final java.util.List<String> MANA_ORDER = java.util.List.of("W", "U", "B", "R", "G", "C");

    /**
     * Spec 0046 -- the mana a card's own mana abilities make, as symbols in
     * WUBRG order then C: a Plains {W}, Hallowed Fountain {W}{U}, Command
     * Tower what Forge says it makes. Read from the abilities it has NOW, so
     * Blood Moon's Fountain makes {R}. Nothing for a land with no mana
     * ability (a fetch land), and nothing for mana Forge only works out
     * when it is made ("Special" mana): not a guess.
     */
    static JsonArray manaMade(Card card) {
        java.util.Set<String> made = new java.util.HashSet<>();
        for (forge.game.spellability.SpellAbility ability : card.getManaAbilities()) {
            forge.game.spellability.AbilityManaPart part = ability.getManaPart();
            if (part == null || part.isSpecialMana()) {
                continue;
            }
            try {
                String produced = part.isAnyMana() ? "W U B R G" : part.mana(ability);
                for (String symbol : String.valueOf(produced).split("\\s+")) {
                    if (MANA_ORDER.contains(symbol)) {
                        made.add(symbol);
                    }
                }
            } catch (RuntimeException e) {
                // A mana ability Forge can only describe while it is being
                // activated: say nothing for it.
            }
        }
        JsonArray out = new JsonArray();
        MANA_ORDER.stream().filter(made::contains).forEach(out::add);
        return out;
    }

    /** A player's floating mana by colour, or null when the pool is empty. */
    private static JsonObject manaPool(Player player) {
        forge.game.mana.ManaPool pool = player.getManaPool();
        if (pool == null || pool.totalMana() == 0) {
            return null;
        }
        JsonObject out = new JsonObject();
        // ManaAtom's codes, which are the pool's keys: MagicColor.COLORLESS
        // is 0, not the pool's colourless (32), and asking for it found
        // nothing -- Sol Ring's spare {C} floated unseen (2026-10-22).
        byte[] colours = forge.card.mana.ManaAtom.MANATYPES;
        String[] letters = {"W", "U", "B", "R", "G", "C"};
        for (int i = 0; i < colours.length; i++) {
            int n = pool.getAmountOfColor(colours[i]);
            if (n > 0) {
                out.addProperty(letters[i], n);
            }
        }
        return out;
    }

    /**
     * Spec 0082 -- one copy on its way onto the stack, as a stack entry would
     * say it: id "copying:N" (its spell ability's id; its stack entry's id is
     * Forge's to give when it arrives), its card (`source`: a spell copy's
     * own card, an ability copy's host), `copy` and `copyOf` (the stack
     * entry it copies), the batch (`group`), its targets as they stand
     * (none while they are being chosen), and `aiming` while it is asked.
     */
    static JsonObject copyingEntry(Game game, forge.game.spellability.SpellAbility sa, Copies copies,
                                   PlayerView viewing, Map<Player, Integer> seatOf) {
        JsonObject entry = new JsonObject();
        entry.addProperty("id", "copying:" + sa.getId());
        Card source = sa.getHostCard();
        if (source != null) {
            entry.addProperty("source", "card:" + source.getId());
            entry.addProperty("name", nameFor(source, viewing));
            entry.addProperty("owner", seatOf.getOrDefault(source.getOwner(), 0));
            if (sa.isSpell()) {
                forge.card.mana.ManaCost printed = source.getManaCost();
                if (printed != null && !printed.isNoCost()) {
                    entry.addProperty("manaCost", printed.toString());
                }
                Player artOwner = copies.artOwner(game, source);
                if (artOwner != null) {
                    entry.addProperty("artOwner", seatOf.getOrDefault(artOwner, 0));
                }
            }
        }
        Player by = sa.getActivatingPlayer();
        entry.addProperty("controller", by == null ? 0 : seatOf.getOrDefault(by, 0));
        entry.addProperty("kind", sa.isSpell() ? "spell" : sa.isTrigger() ? "trigger" : "ability");
        String said = sa.getStackDescription();
        entry.addProperty("description", PlainWords.humanise(said == null || said.isBlank() ? String.valueOf(sa) : said));
        entry.addProperty("copy", true);
        forge.game.spellability.SpellAbilityStackInstance of = Copies.originalEntry(game, sa);
        if (of != null) {
            entry.addProperty("copyOf", "stack:" + of.getId());
        }
        String group = copies.groupOf(sa);
        if (group != null) {
            entry.addProperty("group", group);
        }
        entry.add("targets", targetsOf(game, sa, seatOf));
        if (copies.isAiming(sa)) {
            entry.addProperty("aiming", true);
        }
        return entry;
    }

    /** Everything a spell or ability targets, through its sub-abilities:
     *  {object: "card:N"}, {object: "stack:N"} or {player: seat}. */
    static JsonArray targetsOf(Game game, forge.game.spellability.SpellAbility sa,
                               Map<Player, Integer> seatOf) {
        JsonArray out = new JsonArray();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (forge.game.spellability.SpellAbility part = sa; part != null; part = part.getSubAbility()) {
            forge.game.spellability.TargetChoices chosen = part.getTargets();
            if (chosen == null) {
                continue;
            }
            for (Card card : chosen.getTargetCards()) {
                // "Counter target spell" targets the CARD on the stack
                // (Forge's own model): name the stack entry it is, or the
                // line would point at a card id no board can find. Found
                // by check-board-data.py (Counterspell on a Bolt).
                forge.game.spellability.SpellAbilityStackInstance onStack = card.isInZone(ZoneType.Stack)
                        ? stackEntryOf(game, card) : null;
                add(out, seen, "object", onStack != null ? "stack:" + onStack.getId() : "card:" + card.getId());
            }
            for (Player player : chosen.getTargetPlayers()) {
                JsonObject t = new JsonObject();
                int seat = seatOf.getOrDefault(player, 0);
                if (seen.add("player:" + seat)) {
                    t.addProperty("player", seat);
                    out.add(t);
                }
            }
            for (forge.game.spellability.SpellAbility spell : chosen.getTargetSpells()) {
                forge.game.spellability.SpellAbilityStackInstance target =
                        game.getStack().getInstanceMatchingSpellAbilityID(spell);
                if (target != null) {
                    add(out, seen, "object", "stack:" + target.getId());
                }
            }
        }
        return out;
    }

    /** The stack entry a card on the stack is the source of (a spell). */
    private static forge.game.spellability.SpellAbilityStackInstance stackEntryOf(Game game, Card card) {
        for (forge.game.spellability.SpellAbilityStackInstance instance : game.getStack()) {
            if (instance.isSpell() && instance.getSourceCard() == card) {
                return instance;
            }
        }
        return null;
    }

    private static void add(JsonArray out, java.util.Set<String> seen, String key, String id) {
        if (seen.add(id)) {
            JsonObject t = new JsonObject();
            t.addProperty(key, id);
            out.add(t);
        }
    }

    /** Forge's combat, or null outside one. */
    private static JsonObject combatOf(Game game, Map<Player, Integer> seatOf) {
        forge.game.combat.Combat combat = game.getCombat();
        if (combat == null || combat.getAttackers().isEmpty()) {
            return null;
        }
        JsonArray attackers = new JsonArray();
        JsonArray blocks = new JsonArray();
        for (Card attacker : combat.getAttackers()) {
            JsonObject a = new JsonObject();
            a.addProperty("id", "card:" + attacker.getId());
            forge.game.GameEntity defender = combat.getDefenderByAttacker(attacker);
            JsonObject target = new JsonObject();
            if (defender instanceof Player player) {
                target.addProperty("player", seatOf.getOrDefault(player, 0));
            } else if (defender instanceof Card card) {
                target.addProperty("object", "card:" + card.getId());
            }
            a.add("target", target);
            attackers.add(a);
            for (Card blocker : combat.getBlockers(attacker)) {
                JsonObject b = new JsonObject();
                b.addProperty("blocker", "card:" + blocker.getId());
                b.addProperty("attacker", "card:" + attacker.getId());
                blocks.add(b);
            }
        }
        JsonObject out = new JsonObject();
        out.add("attackers", attackers);
        out.add("blocks", blocks);
        return out;
    }

    private static final String DOUBLED_FROM = "Protection from from ";

    /**
     * Spec 0047 -- may ANYBODY see this card: Forge says EVERY player may
     * (both questions, HID-002), so it is on the table for all. Forge
     * answers "no" for a viewer of nobody, so the public view asks it per
     * player: a hand card (its owner only) and a face-down creature (its
     * controller only) stay hidden.
     */
    private static boolean publicly(CardView view, java.util.Set<Player> players) {
        if (players.isEmpty()) {
            return false;
        }
        for (Player each : players) {
            PlayerView who = each.getView();
            if (!(view.canBeShownTo(who) && view.canFaceDownBeShownTo(who))) {
                return false;
            }
        }
        return true;
    }

    /** A card as [viewer] may know it -- a question's "looking at" cards (spec 0001 D3). */
    static JsonObject describeFor(Card card, PlayerView viewer, Map<Player, Integer> seatOf) {
        return describe(card, viewer, seatOf);
    }

    private static JsonObject describe(Card card, PlayerView viewer, Map<Player, Integer> seatOf) {
        return describe(card, viewer, seatOf, false);
    }

    /**
     * {@code shown}: Forge revealed this card to this viewer (spec 0045),
     * so it is known to them wherever it now lies.
     */
    private static JsonObject describe(Card card, PlayerView viewer, Map<Player, Integer> seatOf, boolean shown) {
        CardView view = card.getView();
        JsonObject entry = new JsonObject();

        // §6.46, §6.47 — the SAME id a decision candidate uses, so
        // the browser never has to match things up by name.
        entry.addProperty("id", "card:" + card.getId());
        entry.addProperty("seat", seatOf.getOrDefault(card.getController(), 0));
        // Whose card it IS, which `seat` is not once control changes: a
        // creature taken with Control Magic sits on the thief's side but
        // came out of its owner's deck, and its picture is in that deck.
        // Public, as ownership of a card on the table always is.
        entry.addProperty("owner", seatOf.getOrDefault(card.getOwner(), 0));
        // §7.61 B11 -- when it arrived where it is, Forge's own game
        // timestamp: a row keeps arrival order (§7.52a L6).
        entry.addProperty("enteredAt", card.getGameTimestamp());
        // §7.61 B12 -- identical tokens pile (§7.52a L5).
        if (card.isToken()) {
            entry.addProperty("token", true);
        }
        entry.addProperty("tapped", view.isTapped());
        entry.addProperty("faceDown", view.isFaceDown());
        // Spec 0080 -- public facts about a permanent, whatever it is:
        // phased out (Forge's own flag), its regeneration shields waiting
        // (Card#getShieldCount: made by a Regenerate ability, used by a
        // destroy, gone at cleanup), and indestructible (the keyword Forge
        // applies now). Only on the battlefield.
        if (card.isInPlay() || card.isPhasedOut()) {
            if (card.isPhasedOut()) {
                entry.addProperty("phasedOut", true);
            }
            if (card.getShieldCount() > 0) {
                entry.addProperty("shields", card.getShieldCount());
            }
            if (card.hasKeyword(forge.game.keyword.Keyword.INDESTRUCTIBLE)) {
                entry.addProperty("indestructible", true);
            }
        }

        boolean maySee = viewer == null
                ? publicly(view, seatOf.keySet())
                : (shown && !view.isFaceDown())
                        || (view.canBeShownTo(viewer) && view.canFaceDownBeShownTo(viewer));
        entry.addProperty("known", maySee);

        if (!maySee) {
            // No identity of ANY kind. Not sent and then hidden
            // (§6.42) — never serialised at all. That includes
            // the things a board would like to draw: a
            // face-down creature's real power and toughness are
            // as hidden as its name, and sending them would let
            // anybody work out what it is.
            entry.addProperty("name", "Face-down");
            // Owner decision 2026-10-20: a face-down CREATURE is shown
            // as what the rules make public -- a nameless 2/2 creature,
            // with whatever has visibly happened to it (pumps, damage,
            // counters, combat). Forge's CURRENT state of a face-down
            // card is exactly that face-down state, so nothing of the
            // real card is read here: no name, printing, keywords or
            // faces, and no real power or toughness.
            CardView.CardStateView down = view.getCurrentState();
            if (view.isFaceDown() && down != null && down.isCreature()) {
                entry.addProperty("kind", "creature");
                entry.addProperty("types", String.valueOf(down.getType()));
                entry.addProperty("power", down.getPower());
                entry.addProperty("toughness", down.getToughness());
                entry.addProperty("damage", view.getDamage());
                entry.addProperty("sick", view.isSick());
                entry.addProperty("attacking", view.isAttacking());
                entry.addProperty("blocking", view.isBlocking());
                JsonArray counters = new JsonArray();
                card.getCounters().entrySet().forEach(counter -> {
                    JsonObject kind = new JsonObject();
                    kind.addProperty("name", String.valueOf(counter.getElement()));
                    kind.addProperty("count", counter.getCount());
                    counters.add(kind);
                });
                if (counters.size() > 0) {
                    entry.add("counters", counters);
                }
            } else {
                entry.addProperty("kind", "unknown");
            }
            return entry;
        }

        CardView.CardStateView state = view.getCurrentState();
        String name = state.getName();
        // §6.44's second measured failure: a face-down card's
        // name comes back EMPTY, and code that treated an empty
        // name as "hidden" blanked cards for their OWN
        // controller 650 times. The visibility answer above
        // decides; the name is only read afterwards.
        //
        // P6-I, measured with a real morph: the CURRENT state of a
        // face-down card is the nameless 2/2, so its controller was
        // shown "Face-down" for its own Willbender. Someone allowed
        // to know (above) is told what it is; `faceDown` says how it
        // is lying, and power and toughness stay the 2/2's.
        if (view.isFaceDown()) {
            String real = card.getState(forge.card.CardStateName.Original).getName();
            if (real != null && !real.isEmpty()) {
                name = real;
            }
        }
        entry.addProperty("name", name == null || name.isEmpty() ? "Face-down" : name);

        // P6-BD, §6.33 — the PRINTING Forge built this card from: the
        // set and collector number the import resolved, carried as
        // Forge holds it ("M10/242"). Identity, like the name, so only
        // for a card this viewer may identify (above). A token has no
        // printing and gets none.
        forge.item.IPaperCard paper = card.getPaperCard();
        if (paper != null && paper.getEdition() != null && !paper.getEdition().isEmpty()) {
            entry.addProperty("printing", paper.getEdition() + "/" + paper.getCollectorNumber());
        }

        // §6.79, P6-BF — WHICH face is up, and which faces the card
        // has, for a card with more than one: a transforming card, a
        // split card, an adventurer, a Room. Forge's own state names
        // (Original, Backside, LeftSplit, Secondary...), so the
        // browser never works out a face from printed text, and
        // nothing about one object implies one picture. Only ever
        // reached for a card this viewer may identify (above); the
        // face-down state is not a face anybody is shown.
        java.util.List<String> faces = new java.util.ArrayList<>();
        for (forge.card.CardStateName each : card.getStates()) {
            if (each == forge.card.CardStateName.FaceDown) {
                continue;
            }
            String faceName = card.getState(each).getName();
            if (faceName != null && !faceName.isEmpty() && !faces.contains(faceName)) {
                faces.add(faceName);
            }
        }
        if (faces.size() > 1) {
            entry.addProperty("face", String.valueOf(state.getState()));
            JsonArray named = new JsonArray();
            faces.forEach(named::add);
            entry.add("faces", named);
        }

        // What SORT of thing it is, so a board can group lands
        // away from creatures instead of showing one long row.
        entry.addProperty("kind", kindOf(state));
        entry.addProperty("types", String.valueOf(state.getType()));
        // The printed mana cost of the face that is up, Forge's notation
        // ("{1}{R}"), for a card this viewer may identify (owner
        // 2026-10-21: costs on cards in hand, on the stack, close up).
        // A land has none.
        forge.card.mana.ManaCost printed = state.getManaCost();
        if (printed != null && !printed.isNoCost()) {
            entry.addProperty("manaCost", printed.toString());
        }

        if (state.isCreature()) {
            entry.addProperty("power", state.getPower());
            entry.addProperty("toughness", state.getToughness());
            // Phase 9 W-19 -- before counters and effects, for the
            // close-up's "printed 2/3, now 4/5".
            entry.addProperty("basePower", card.getBasePower());
            entry.addProperty("baseToughness", card.getBaseToughness());
            entry.addProperty("damage", view.getDamage());
            // A creature that cannot attack yet looks identical
            // to one that can, and the difference decides turns.
            entry.addProperty("sick", view.isSick());
            entry.addProperty("attacking", view.isAttacking());
            entry.addProperty("blocking", view.isBlocking());
        }

        // §6.85, P6-AL — the keywords it has NOW, from Forge, after
        // every continuous effect: Humility takes Serra Angel's flying
        // away, an equipment gives one. The board shows these rather
        // than reading printed text, which is wrong exactly when it
        // matters (§6.83). Forge's own titles ("Flying", "Protection
        // from red").
        JsonArray keywords = new JsonArray();
        for (forge.game.keyword.KeywordInterface keyword : card.getUnhiddenKeywords()) {
            String title = keyword.getTitle();
            // A printed "Protection from black" is titled "Protection from
            // from black" by Forge (KeywordWithType keeps the card's own
            // "from", Protection.getTitle adds another) -- found by Phase
            // 8's Mind Bend game. Words only: the rules read the keyword.
            if (title != null && title.startsWith(DOUBLED_FROM)) {
                title = "Protection from " + title.substring(DOUBLED_FROM.length());
            }
            if (title != null && !title.isBlank()) {
                keywords.add(title);
            }
        }
        if (keywords.size() > 0) {
            entry.add("keywords", keywords);
        }

        JsonArray counters = new JsonArray();
        card.getCounters().entrySet().forEach(counter -> {
            JsonObject kind = new JsonObject();
            kind.addProperty("name", String.valueOf(counter.getElement()));
            kind.addProperty("count", counter.getCount());
            counters.add(kind);
        });
        if (counters.size() > 0) {
            entry.add("counters", counters);
        }

        // Spec 0079, item 1 -- a copy (Clone, a token copy) says so, and
        // which card it copied (`copyOf`, its id: stripped by HiddenIds if
        // that card is now somewhere this viewer cannot see), and whose
        // deck has the copied card's picture (`artOwner`, when not its own
        // owner's). Public: a copy's copiable values are on the table.
        if (Copies.isCopy(card)) {
            entry.addProperty("copy", true);
            Card original = Copies.of(card.getGame()).originalOf(card.getGame(), card);
            if (original != null && original.getId() != card.getId()) {
                entry.addProperty("copyOf", "card:" + original.getId());
            }
            Player artOwner = Copies.of(card.getGame()).artOwner(card.getGame(), card);
            if (artOwner != null) {
                entry.addProperty("artOwner", seatOf.getOrDefault(artOwner, 0));
            }
        }

        // Public, and the Ring's abilities belong to this creature
        // alone (legendary, can't be blocked by greater power...).
        if (card.isRingBearer()) {
            entry.addProperty("ringBearer", true);
        }

        // Phase 8 Amendment 1, Un-sets (public): the sector a creature is
        // in (space sculptor) and the sprocket a Contraption is on.
        if (card.getSector() != null) {
            entry.addProperty("sector", card.getSector());
        }
        if (card.isContraption() && card.getSprocket() >= 1 && card.getSprocket() <= 3) {
            entry.addProperty("sprocket", card.getSprocket());
        }

        // Auras and equipment are drawn WITH what they modify,
        // which is the only arrangement that reads correctly: an
        // equipment in its own row tells you nothing about which
        // creature is now a 5/5.
        CardView attachedTo = view.getAttachedTo();
        if (attachedTo != null) {
            entry.addProperty("attachedTo", "card:" + attachedTo.getId());
        }

        // Spec 0058, item 8 -- the cards of a mutated creature, top first
        // (Forge's getMergedCards order). Public: a mutated pile's cards are
        // face up on the table. Only reached for a card this viewer may
        // identify (above). Each carries what a picture is found by.
        if (card.hasMergedCard() && card.getMergedCards().size() > 1) {
            JsonArray merged = new JsonArray();
            for (Card part : card.getMergedCards()) {
                JsonObject one = new JsonObject();
                one.addProperty("id", "card:" + part.getId());
                one.addProperty("name", ownName(part, viewer));
                one.addProperty("known", true);
                one.addProperty("seat", seatOf.getOrDefault(part.getController(), 0));
                one.addProperty("owner", seatOf.getOrDefault(part.getOwner(), 0));
                forge.item.IPaperCard partPaper = part.getPaperCard();
                if (partPaper != null && partPaper.getEdition() != null && !partPaper.getEdition().isEmpty()) {
                    one.addProperty("printing", partPaper.getEdition() + "/" + partPaper.getCollectorNumber());
                }
                if (part.isToken()) {
                    one.addProperty("token", true);
                }
                merged.add(one);
            }
            entry.add("merged", merged);
        }
        return entry;
    }

    /**
     * One word for how to draw it.
     *
     * Read off Forge's type line rather than guessed from the
     * name — the old project's client decided land-ness from
     * basic-land names and put every nonbasic in the wrong row.
     */
    private static String kindOf(CardView.CardStateView state) {
        if (state.isCreature()) {
            return "creature";
        }
        if (state.isLand()) {
            return "land";
        }
        return "other";
    }

    /**
     * Phase 9 W-21 (Amendment 18) -- what a command-zone piece does, in
     * Forge's own words, so the status tray's list can say it: an
     * emblem's abilities (Forge's card text, as its own clients show
     * it), or a dungeon's rooms -- each room's words and the rooms it
     * leads to, with the one the venture marker is in marked. Nothing is
     * typed here per card: a new set's emblem reads right without a
     * change. The Ring says nothing here; its four abilities are the
     * rules' (701.54c) and the page has them.
     */
    static JsonObject commandWords(Card card, String currentRoom) {
        JsonObject words = new JsonObject();
        words.addProperty("name", card.getName());
        if (card.getType().isDungeon()) {
            JsonArray rooms = new JsonArray();
            for (forge.game.trigger.Trigger trigger : card.getTriggers()) {
                forge.game.spellability.SpellAbility room = trigger.getOverridingAbility();
                if (room == null || !room.hasParam("RoomName")) {
                    continue;
                }
                JsonObject entry = new JsonObject();
                entry.addProperty("name", room.getParam("RoomName"));
                entry.addProperty("says", plain(room.getDescription()));
                JsonArray next = new JsonArray();
                if (room.hasParam("NextRoomName")) {
                    for (String name : room.getParam("NextRoomName").split(",")) {
                        next.add(name.trim());
                    }
                }
                entry.add("next", next);
                if (room.getParam("RoomName").equals(currentRoom)) {
                    entry.addProperty("here", true);
                }
                rooms.add(entry);
            }
            words.add("rooms", rooms);
        } else if (card != card.getController().getTheRing()) {
            words.addProperty("says", plain(card.getAbilityText()));
        }
        return words;
    }

    /** Forge's card text without its markup: grey reminder tags, line breaks, CARDNAME. */
    static String plain(String text) {
        if (text == null) {
            return "";
        }
        // CARDNAME is already the card's name in Forge's text.
        return text.replaceAll("<[^>]+>", "")
                .replace("\r\n", "\n")
                .replaceAll("\n{2,}", "\n")
                .trim();
    }
}
