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
        snapshot.addProperty("seat", seatOf.getOrDefault(viewer, 0));

        JsonArray players = new JsonArray();
        for (Player player : game.getRegisteredPlayers()) {
            JsonObject entry = new JsonObject();
            entry.addProperty("seat", seatOf.getOrDefault(player, 0));
            entry.addProperty("name", player.getName());
            entry.addProperty("life", player.getLife());
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
                if (card.isImmutable() && !card.isEmblem() && !card.getType().isDungeon()) {
                    continue;
                }
                command.add(card.getName());
            }
            if (command.size() > 0) {
                entry.add("command", command);
            }
            players.add(entry);
        }
        snapshot.add("players", players);

        // §6.96 — global state: day or night, once a daybound card has
        // made it one (Forge's null means neither yet).
        Boolean day = game.getDayTime();
        if (day != null) {
            snapshot.addProperty("dayTime", day ? "day" : "night");
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

        JsonArray stack = new JsonArray();
        game.getStack().forEach(instance -> {
            JsonObject entry = new JsonObject();
            // §6.46 — TYPED, and typed for a measured reason: a
            // stack instance's id counts from 1 independently of
            // Card.getId(), entirely inside the card range. One
            // Phase 0A run caught a stack instance whose id
            // equalled its own source card's.
            entry.addProperty("id", "stack:" + instance.getId());
            entry.addProperty("description", String.valueOf(instance));
            stack.add(entry);
        });
        snapshot.add("stack", stack);

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
    private static JsonObject describe(Card card, PlayerView viewer, Map<Player, Integer> seatOf) {
        CardView view = card.getView();
        JsonObject entry = new JsonObject();

        // §6.46, §6.47 — the SAME id a decision candidate uses, so
        // the browser never has to match things up by name.
        entry.addProperty("id", "card:" + card.getId());
        entry.addProperty("seat", seatOf.getOrDefault(card.getController(), 0));
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
            entry.addProperty("kind", "unknown");
            return entry;
        }

        CardView.CardStateView state = view.getCurrentState();
        String name = state.getName();
        // §6.44's second measured failure: a face-down card's
        // name comes back EMPTY, and code that treated an empty
        // name as "hidden" blanked cards for their OWN
        // controller 650 times. The visibility answer above
        // decides; the name is only read afterwards.
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
