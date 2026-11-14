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
            Integer into, String where, String said, String name, Integer power, Integer toughness, Integer via) {

        Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why) {
            this(card, from, fromSeat, to, toSeat, faceDown, why, null, null, null, null, null, null, null);
        }

        Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why,
                Integer into) {
            this(card, from, fromSeat, to, toSeat, faceDown, why, into, null, null, null, null, null, null);
        }

        Move(int card, String from, Integer fromSeat, String to, Integer toSeat, boolean faceDown, String why,
                Integer into, String where, String said, String name, Integer power, Integer toughness) {
            this(card, from, fromSeat, to, toSeat, faceDown, why, into, where, said, name, power, toughness, null);
        }

        Move withWhere(String place) {
            return new Move(card, from, fromSeat, to, toSeat, faceDown, why, into, place, said, name, power,
                    toughness);
        }

        /**
         * Spec 0078, item 4 -- a creature leaving the battlefield: its power
         * and toughness as it last was there (Forge's last-known information
         * for it), so the page can shrink a creature killed by -4/-4 to 0/0
         * before it shatters. The board already showed both numbers while it
         * was on the table, so this is public; it travels only with the card.
         */
        Move withLast(Integer lastPower, Integer lastToughness) {
            return new Move(card, from, fromSeat, to, toSeat, faceDown, why, into, where, said, name, lastPower,
                    lastToughness);
        }

        /**
         * Spec 0061, item 4 -- why it went to a graveyard (`why`: "cycled",
         * "discarded", "countered", "died"...), the tag the page shows on
         * the card on its way ("Countered by Counterspell"), and the card's
         * name for what the game tells the players. The name is never sent
         * with the move itself: the board names cards by id.
         */
        Move withSaid(String reason, String words, String cardName) {
            return new Move(card, from, fromSeat, to, toSeat, faceDown, reason, into, where, words, cardName, power,
                    toughness);
        }
    }

    /** Spec 0061, item 4 -- Forge's facts about one card going to a graveyard, as MoveLog reads them. */
    record GraveFacts(String from, boolean discarded, boolean cycled, boolean cleanup, String counteredBy,
            boolean sacrificed, boolean destroyed, boolean creature) {
    }

    /**
     * Spec 0061, item 4 -- why a card went to a graveyard, from Forge's facts:
     * {why, tag}. From the hand: discarded for its cycling cost ("Cycled"),
     * discarded down to hand size in the cleanup step ("Discarded: too many
     * cards"), any other discard ("Discarded"). From the stack, while another
     * card's spell or ability resolves: countered ("Countered by
     * Counterspell"). From the battlefield: sacrificed, a creature that died
     * (why "destroyed" kept when Forge destroyed it, as Phase 10 A-00 has
     * it), any other destroyed permanent -- each with no words (null tag:
     * spec 0066 item 6, the shatter shows it). Null when none of these is
     * known (a spell that resolved, a mill).
     */
    static String[] graveReason(GraveFacts f) {
        switch (f.from()) {
            case "hand" -> {
                if (!f.discarded()) {
                    return null;
                }
                if (f.cycled()) {
                    return new String[] {"cycled", "Cycled"};
                }
                return new String[] {"discarded", f.cleanup() ? "Discarded: too many cards" : "Discarded"};
            }
            case "stack" -> {
                return f.counteredBy() == null ? null
                        : new String[] {"countered", "Countered by " + f.counteredBy()};
            }
            case "battlefield" -> {
                // Spec 0066, item 6 -- no words from the battlefield: the
                // shatter (Phase 10 A-04) already shows a card dying, so no
                // "Died", "Destroyed" or "Sacrificed" tag and no message.
                // The why stays (A-00 and A-04 play from it).
                if (f.sacrificed()) {
                    return new String[] {"sacrificed", null};
                }
                if (f.creature()) {
                    return new String[] {f.destroyed() ? "destroyed" : "died", null};
                }
                return f.destroyed() ? new String[] {"destroyed", null} : null;
            }
            default -> {
                return null;
            }
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
                            move.faceDown(), move.why(), host, move.where(), move.said(), move.name(),
                            move.power(), move.toughness())
                    : move);
        }
        return out;
    }

    /**
     * Spec 0080, item 2 (Q1 A) -- a flicker: a permanent exiled and returned
     * to the battlefield in one go (Ephemerate, Cloudshift). Forge keeps the
     * card's id through both moves (GameAction#changeZone copies the card
     * with the same id), so the page saw the same card still on the table
     * and nothing showed it had left. Told as ONE move instead: from the
     * battlefield to the battlefield, why "flickered", by way of its exile
     * (`via`, that exile's seat). Only a battlefield -> exile -> battlefield
     * pair of the same card in the same round; a card returned in a later
     * round (Flickerwisp's end-of-turn return) keeps its two moves.
     */
    static List<Move> flickers(List<Move> moves) {
        List<Move> out = new ArrayList<>(moves.size());
        java.util.Map<Integer, Integer> exiledAt = new java.util.HashMap<>();
        for (Move move : moves) {
            if ("battlefield".equals(move.from()) && "exile".equals(move.to())) {
                exiledAt.put(move.card(), out.size());
                out.add(move);
                continue;
            }
            Integer at = exiledAt.remove(move.card());
            if (at != null && "exile".equals(move.from()) && "battlefield".equals(move.to())) {
                Move left = out.get(at);
                out.set(at, new Move(move.card(), "battlefield", left.fromSeat(), "battlefield", move.toSeat(),
                        move.faceDown(), "flickered", null, null, null, null, null, null, left.toSeat()));
                continue;
            }
            out.add(move);
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

    /**
     * Spec 0082 -- a token spell (a prepared spell, a "cast a copy") put into
     * a graveyard as it leaves the stack ceases to exist there at once (CR
     * 704.5d): it goes nowhere, as a copied spell does.
     */
    static boolean ceasesOffStack(String from, String to, boolean token) {
        return token && "stack".equals(from) && "graveyard".equals(to);
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
        return forViewer(moves, viewer, java.util.Set.of());
    }

    /**
     * The moves as `viewer` may know them. Spec 0084 -- `spent`: the cards
     * sacrificed this round that were spent (Spent.isSpent: a cost, their
     * own ability, a Saga's end): their move off the battlefield says
     * `spent: true`, with the card only, so the page folds them away
     * instead of showing them killed.
     */
    static JsonArray forViewer(List<Move> moves, Integer viewer, java.util.Set<Integer> spent) {
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
            if (named && "sacrificed".equals(move.why()) && "battlefield".equals(move.from())
                    && spent.contains(move.card())) {
                entry.addProperty("spent", true);
            }
            // Spec 0061, item 4 -- the tag the card carries to the graveyard.
            if (named && move.said() != null) {
                entry.addProperty("said", move.said());
            }
            if (named && move.into() != null) {
                entry.addProperty("into", "card:" + move.into());
            }
            // Spec 0080 -- a flicker went by way of this exile (public: the
            // card was on the table at both ends).
            if ("flickered".equals(move.why()) && move.via() != null) {
                entry.add("via", place("exile", move.via()));
            }
            // Spec 0078, item 4 -- a creature's last power and toughness on
            // the battlefield, with the card only (the board showed them).
            if (named && "battlefield".equals(move.from()) && move.power() != null && move.toughness() != null) {
                JsonObject last = new JsonObject();
                last.addProperty("power", move.power());
                last.addProperty("toughness", move.toughness());
                entry.add("last", last);
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
