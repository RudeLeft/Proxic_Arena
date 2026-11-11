package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Spec 0070, Amendment 1 -- the "seen" eye: which seats have seen each card
 * while it is in a hand.
 *
 * Forge shows a hand card to a player through PlayerController.reveal,
 * called on the controller of EACH player it is shown to and only those
 * (GameAction.reveal / revealTo): Duress and Thoughtseize ("reveal your
 * hand, you choose"), "reveal your hand", a card revealed to pay a cost
 * (CostReveal, behold), a revealed draw. MatchController.reveal records each
 * card of a hand shown to a seat other than its owner's here. Forge's
 * own permission to see a hand for good (Telepathy, Mindslaver) is not
 * this: that is otherHands, as before.
 *
 * Remembered until the card changes zone (GameEventCardChangeZone, any
 * move): a card played, discarded, put back and drawn again is a new
 * card to everyone who has not seen it since. The id is stable across
 * zones (Phase 0A), which is why forgetting on a move matters -- the same
 * id back in the hand must not carry an old sighting.
 *
 * What it gives each seat (ViewerSnapshot): its OWN hand cards another
 * seat has seen carry `seen` (the eye stays on them); another player's
 * hand card THIS seat has seen is in its otherHands, face up, with
 * `seen`. Nobody else is told anything: not the other seats, not the
 * public (spectator) view. Pure, so it is tested without a game.
 */
final class SeenHands {

    private final Map<Integer, Set<Integer>> seenBy = new HashMap<>();

    /** [seat] was shown these cards while they are in a hand not its own. */
    synchronized void saw(int seat, Collection<Integer> cardIds) {
        for (int id : cardIds) {
            seenBy.computeIfAbsent(id, k -> new HashSet<>()).add(seat);
        }
    }

    /** The card changed zone: nobody has seen it where it is now. */
    synchronized void forget(int cardId) {
        seenBy.remove(cardId);
    }

    /** True when [seat] has seen this card in the hand it is in now. */
    synchronized boolean seenBy(int cardId, int seat) {
        Set<Integer> seats = seenBy.get(cardId);
        return seats != null && seats.contains(seat);
    }

    /** True when a seat other than [owner] has seen this card in its hand. */
    synchronized boolean seenByOther(int cardId, int owner) {
        Set<Integer> seats = seenBy.get(cardId);
        if (seats == null) {
            return false;
        }
        for (int seat : seats) {
            if (seat != owner) {
                return true;
            }
        }
        return false;
    }

    /** The viewer's own hand: `seen` on each card another seat has seen. */
    void markOwnHand(JsonArray hand, int viewerSeat) {
        for (JsonElement element : hand) {
            JsonObject card = element.getAsJsonObject();
            Integer id = idOf(card);
            if (id != null && seenByOther(id, viewerSeat)) {
                card.addProperty("seen", true);
            }
        }
    }

    /** "card:12" -> 12, or null. */
    static Integer idOf(JsonObject card) {
        if (!card.has("id")) {
            return null;
        }
        String id = card.get("id").getAsString();
        if (!id.startsWith("card:")) {
            return null;
        }
        try {
            return Integer.parseInt(id.substring("card:".length()));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
