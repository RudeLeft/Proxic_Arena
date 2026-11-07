package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
 *
 * Phase 10 A-10 (Amendment 13): a card that MERGED into another this round
 * -- melded (Graf Rats with Midnight Scavengers: the Scavengers exiled, the
 * Rats back as Chittering Host) or mutated (Gemrazer from the stack into
 * the merged zone, over or under Grizzly Bears) -- carries `into`, the
 * permanent it is now part of, as Forge's own state has it (the host's
 * melded-with card, or its merged cards). The page plays one fusion
 * instead of guessing from a rename and a card going to exile. The host is
 * a permanent on the battlefield, which every viewer sees, and `into`
 * travels only with a named card, so it tells nobody anything the board
 * does not already show.
 */
final class Moves {

    private Moves() {
    }

    /** One zone change. Seats are Arena seats; null when unknown or no zone. */
    record Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why,
            Integer into, String where) {

        Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why) {
            this(card, from, fromSeat, to, toSeat, faceDown, why, null, null);
        }

        Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why,
                Integer into) {
            this(card, from, fromSeat, to, toSeat, faceDown, why, into, null);
        }

        Move withWhere(String place) {
            return new Move(card, from, fromSeat, to, toSeat, faceDown, why, into, place);
        }
    }

    /**
     * Phase 10 A-14 (Amendment 17) -- where in a library a card landed, as
     * Forge put it there: "top" (index 0 of Forge's library list, which is
     * its top) or "bottom" (the last index), read from Forge's own library
     * at the moment Forge reports the move (the event bus is synchronous,
     * after the card was added). Anywhere else ("third from the top") is
     * null: said as nothing rather than as a wrong place.
     */
    static String libraryPlace(int index, int size) {
        if (index < 0 || size <= 0) {
            return null;
        }
        if (index == 0) {
            return "top";
        }
        return index == size - 1 ? "bottom" : null;
    }

    /**
     * Phase 10 A-14 -- Forge shuffled `seat`'s library: every card that went
     * into that library this round is now "shuffled" in (Chaos Warp's
     * card, a tutor's shuffle after a card was put back). Its place is no
     * longer known to anyone, so a top or bottom said earlier is replaced.
     */
    static void shuffled(List<Move> moves, Integer seat) {
        if (seat == null) {
            return;
        }
        synchronized (moves) {
            for (int i = 0; i < moves.size(); i++) {
                Move move = moves.get(i);
                if ("library".equals(move.to()) && seat.equals(move.toSeat())) {
                    moves.set(i, move.withWhere("shuffled"));
                }
            }
        }
    }

    /**
     * Phase 10 A-10 -- each move that merged its card into a permanent,
     * given `into`. `hostOf` maps a card id to the permanent it is part of
     * now (Forge's state as the round is sent). Only a move INTO a merge
     * qualifies -- mutating (to the merged zone), or a meld partner leaving
     * the battlefield for exile -- so a partner moving on later (the melded
     * permanent leaving play) is never taken for a new merge.
     */
    static List<Move> withInto(List<Move> moves, Map<Integer, Integer> hostOf) {
        if (hostOf.isEmpty()) {
            return moves;
        }
        List<Move> out = new ArrayList<>(moves.size());
        for (Move move : moves) {
            Integer host = hostOf.get(move.card());
            boolean merging = "merged".equals(move.to())
                    || ("battlefield".equals(move.from()) && "exile".equals(move.to()));
            out.add(host != null && merging && host != move.card()
                    ? new Move(move.card(), move.from(), move.fromSeat(), move.to(), move.toSeat(),
                            move.faceDown(), move.why(), host, move.where())
                    : move);
        }
        return out;
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
            if (named && move.into() != null) {
                entry.addProperty("into", "card:" + move.into());
            }
            // Phase 10 A-14: where in the library it went. Public, as the
            // move into a library is (Griptide puts it on top for both
            // players to see; the other player's Brainstorm puts two cards
            // on top, which both players see too): sent with or without
            // the card. "shuffled" says only that -- never a position.
            if ("library".equals(move.to()) && move.where() != null) {
                entry.addProperty("where", move.where());
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
