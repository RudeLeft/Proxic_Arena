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
            int gameEpoch) {
        PlayerView viewing = viewer.getView();

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
        snapshot.addProperty("seat", seatOf.getOrDefault(viewer, 0));

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
            }
            if (command.size() > 0) {
                entry.add("command", command);
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
            for (Card card : player.getCardsIn(ZoneType.Battlefield)) {
                battlefield.add(describe(card, viewing, seatOf));
            }
        }
        snapshot.add("battlefield", battlefield);

        // The viewer's OWN hand. Not filtered in the browser:
        // nobody else's cards are put on the wire at all.
        JsonArray hand = new JsonArray();
        for (Card card : viewer.getCardsIn(ZoneType.Hand)) {
            hand.add(describe(card, viewing, seatOf));
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
                if (view.canBeShownTo(viewing) && view.canFaceDownBeShownTo(viewing)) {
                    JsonObject entry = describe(card, viewing, seatOf);
                    // `seat` above is the CONTROLLER; for a hand card
                    // say whose hand it is.
                    entry.addProperty("owner", seatOf.getOrDefault(player, 0));
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
                exile.add(describe(card, viewing, seatOf));
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
            entry.addProperty("description", hidden ? "Face-down spell" : String.valueOf(instance));
            // §7.61 B2 -- the stack as cards: what it is, whose it is, and
            // where it came from, the name as this viewer may know it.
            if (source != null) {
                entry.addProperty("source", "card:" + source.getId());
                entry.addProperty("name", nameFor(source, viewing));
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
            stack.add(entry);
        });
        snapshot.add("stack", stack);

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

    /** A player's floating mana by colour, or null when the pool is empty. */
    private static JsonObject manaPool(Player player) {
        forge.game.mana.ManaPool pool = player.getManaPool();
        if (pool == null || pool.totalMana() == 0) {
            return null;
        }
        JsonObject out = new JsonObject();
        byte[] colours = {forge.card.MagicColor.WHITE, forge.card.MagicColor.BLUE,
                forge.card.MagicColor.BLACK, forge.card.MagicColor.RED,
                forge.card.MagicColor.GREEN, forge.card.MagicColor.COLORLESS};
        String[] letters = {"W", "U", "B", "R", "G", "C"};
        for (int i = 0; i < colours.length; i++) {
            int n = pool.getAmountOfColor(colours[i]);
            if (n > 0) {
                out.addProperty(letters[i], n);
            }
        }
        return out;
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

    private static JsonObject describe(Card card, PlayerView viewer, Map<Player, Integer> seatOf) {
        CardView view = card.getView();
        JsonObject entry = new JsonObject();

        // §6.46, §6.47 — the SAME id a decision candidate uses, so
        // the browser never has to match things up by name.
        entry.addProperty("id", "card:" + card.getId());
        entry.addProperty("seat", seatOf.getOrDefault(card.getController(), 0));
        // §7.61 B11 -- when it arrived where it is, Forge's own game
        // timestamp: a row keeps arrival order (§7.52a L6).
        entry.addProperty("enteredAt", card.getGameTimestamp());
        // §7.61 B12 -- identical tokens pile (§7.52a L5).
        if (card.isToken()) {
            entry.addProperty("token", true);
        }
        entry.addProperty("tapped", view.isTapped());
        entry.addProperty("faceDown", view.isFaceDown());

        boolean maySee = view.canBeShownTo(viewer) && view.canFaceDownBeShownTo(viewer);
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

        // Public, and the Ring's abilities belong to this creature
        // alone (legendary, can't be blocked by greater power...).
        if (card.isRingBearer()) {
            entry.addProperty("ringBearer", true);
        }

        // Auras and equipment are drawn WITH what they modify,
        // which is the only arrangement that reads correctly: an
        // equipment in its own row tells you nothing about which
        // creature is now a 5/5.
        CardView attachedTo = view.getAttachedTo();
        if (attachedTo != null) {
            entry.addProperty("attachedTo", "card:" + attachedTo.getId());
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
}
