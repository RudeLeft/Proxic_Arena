package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * Phase 10 A-00 (Amendments 1 and 3) -- every card that changed zone since
 * the last snapshot round, as Forge moved it: where from, where to, and why
 * it left the battlefield (destroyed or sacrificed). The page animated by
 * comparing two boards and GUESSED where a card went: a card put into a
 * library, or into the other player's hand, was drawn going to exile.
 *
 * Hidden cards stay hidden (AGENTS hidden-information rules): a viewer is
 * told WHICH card moved only when they can see it at one end of the move
 * (the battlefield, the stack, a graveyard, face-up exile, the command zone,
 * their own hand). A move they can't see at either end -- the other player
 * drawing, a card shuffled from a hand into a library -- is sent without
 * the card: just "a card went from their library to their hand", enough to
 * draw a card back travelling. (A mill ends in a public graveyard, so it is
 * named.)
 */
final class Moves {

    private Moves() {
    }

    /** One zone change. Seats are Arena seats; null when unknown or no zone. */
    record Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why) {
    }

    /** Forge's zone type, as the protocol names it. */
    static String zoneName(forge.game.zone.ZoneType type) {
        if (type == null) {
            return "nowhere";
        }
        return switch (type) {
            case Battlefield -> "battlefield";
            case Hand -> "hand";
            case Library -> "library";
            case Graveyard -> "graveyard";
            case Exile -> "exile";
            case Stack -> "stack";
            case Command -> "command";
            case Merged -> "merged";
            default -> "other";
        };
    }

    /** Whether `viewer` (null: a spectator) can see a card in this zone. */
    static boolean visible(String zone, Integer seat, Integer viewer, boolean faceDown) {
        return switch (zone) {
            // A face-down permanent or spell is still shown, as "Face-down",
            // with its id: the board already names that object.
            case "battlefield", "stack", "merged" -> true;
            case "graveyard", "command" -> true;
            case "exile" -> !faceDown;
            case "hand" -> viewer != null && viewer.equals(seat);
            default -> false; // library, other, nowhere
        };
    }

    /** The moves as `viewer` may know them. */
    static JsonArray forViewer(List<Move> moves, Integer viewer) {
        JsonArray out = new JsonArray();
        for (Move move : moves) {
            JsonObject entry = new JsonObject();
            boolean named = visible(move.from(), move.fromSeat(), viewer, move.faceDown())
                    || visible(move.to(), move.toSeat(), viewer, move.faceDown());
            if (named) {
                entry.addProperty("card", "card:" + move.card());
            }
            entry.add("from", place(move.from(), move.fromSeat()));
            entry.add("to", place(move.to(), move.toSeat()));
            if (named && move.why() != null) {
                entry.addProperty("why", move.why());
            }
            out.add(entry);
        }
        return out;
    }

    private static JsonObject place(String zone, Integer seat) {
        JsonObject place = new JsonObject();
        place.addProperty("zone", zone);
        if (seat != null) {
            place.addProperty("seat", seat);
        }
        return place;
    }
}
