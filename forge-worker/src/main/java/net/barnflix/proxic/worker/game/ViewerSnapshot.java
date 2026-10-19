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
            java.util.List<String> notices) {
        PlayerView viewing = viewer.getView();

        JsonObject snapshot = new JsonObject();
        snapshot.addProperty("stateRevision", revision);

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
        for (Player player : game.getPlayers()) {
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
            players.add(entry);
        }
        snapshot.add("players", players);

        JsonArray battlefield = new JsonArray();
        for (Player player : game.getPlayers()) {
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

        JsonArray graveyard = new JsonArray();
        for (Player player : game.getPlayers()) {
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
