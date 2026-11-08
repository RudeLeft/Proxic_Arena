package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Spec 0062 -- a spark of mana for every payment: what each step of a
 * payment paid, as it happened, for every seat.
 *
 * The page used to learn what a mana paid only from the NEXT payment
 * question's "still owing", so the last mana of a payment (no question
 * after it) never had a ball and its symbol never lit, and the other
 * player -- who is asked nothing -- saw no ball at all. Now each step (a
 * permanent tapped, mana already made, 2 life for a Phyrexian symbol, a
 * creature tapped for convoke) is recorded here with, per mana: its colour
 * (W U B R G, C for colourless), the symbol of the cost it paid (Forge's own
 * ManaCostBeingPaid, read before and after that one mana), and where it came
 * from (the tapped card, "pool" for mana already made, "life").
 *
 * Each record has a number that only grows (as the dice rolls do), so a
 * page plays each once; a payment has its own number, so the symbols of
 * one payment light together. Bounded: only the latest are kept.
 *
 * Hidden information (AGENTS HID-001, HID-005): a spell still being cast
 * is drawn face down to everyone but its caster (spec 0044), so for any
 * other seat -- and spectators -- such a record carries no cost, no
 * "still owing" and no symbol paid: only the colour and the source, which
 * the board already shows (the land tapped, the mana display, the life
 * total). The same for an ability of a face-down permanent. An ability, a
 * trigger or a spell already on the stack is public: everyone is told all
 * of it.
 */
final class Payments {

    /** How many records are kept: enough for a long payment, a few at once. */
    static final int KEPT = 24;

    /** One mana: its colour, the cost's symbol it paid ("1" generic; null if unknown), and its source. */
    record Mana(String colour, String shard, String from) {
    }

    /** One payment: its number and the cost being paid when it began ("{2}{B}{B}"). */
    record Payment(int id, String cost) {
    }

    private record Paid(int n, int seat, int payment, String forId, String kind, boolean hidden, String cost,
            String owing, List<Mana> mana) {
    }

    private final Deque<Paid> kept = new ArrayDeque<>();
    private int seen = 0;
    private int payments = 0;
    /**
     * Convoke and improvise are paid before the mana (Forge's CostAdjustment),
     * through their own question: the mana payment of the same spell that
     * follows is the same payment, so its symbols stay lit.
     */
    private Object convokedFor = null;
    private Payment convoked = null;

    /**
     * The payment [paidFor] is starting: a new one -- or, for its mana after
     * convoke ([convoke] false), the one convoke began.
     */
    synchronized Payment open(Object paidFor, String cost, boolean convoke) {
        if (convoked != null && convokedFor == paidFor) {
            Payment same = convoked;
            if (!convoke) {
                convoked = null;
                convokedFor = null;
            }
            return same;
        }
        Payment fresh = new Payment(++payments, cost);
        if (convoke) {
            convoked = fresh;
            convokedFor = paidFor;
        } else {
            convoked = null;
            convokedFor = null;
        }
        return fresh;
    }

    /** One step of [payment] paid [mana]; [owing] is what is still due after it. */
    synchronized void paid(int seat, Payment payment, String forId, String kind, boolean hidden, String owing,
            List<Mana> mana) {
        if (mana == null || mana.isEmpty()) {
            return;
        }
        kept.addLast(new Paid(++seen, seat, payment.id(), forId, kind, hidden, payment.cost(), owing,
                List.copyOf(mana)));
        while (kept.size() > KEPT) {
            kept.removeFirst();
        }
    }

    /** What [viewer] (a seat; null for spectators) may be told, oldest first. */
    synchronized JsonArray forViewer(Integer viewer) {
        JsonArray out = new JsonArray();
        for (Paid p : kept) {
            boolean all = !p.hidden() || (viewer != null && viewer == p.seat());
            JsonObject o = new JsonObject();
            o.addProperty("n", p.n());
            o.addProperty("seat", p.seat());
            o.addProperty("payment", p.payment());
            if (p.forId() != null) {
                o.addProperty("for", p.forId());
            }
            o.addProperty("kind", p.kind());
            if (all) {
                if (p.cost() != null) {
                    o.addProperty("cost", p.cost());
                }
                if (p.owing() != null) {
                    o.addProperty("owing", p.owing());
                }
            }
            JsonArray mana = new JsonArray();
            for (Mana m : p.mana()) {
                JsonObject one = new JsonObject();
                one.addProperty("colour", m.colour());
                if (all && m.shard() != null) {
                    one.addProperty("shard", m.shard());
                }
                one.addProperty("from", m.from());
                mana.add(one);
            }
            o.add("mana", mana);
            out.add(o);
        }
        return out;
    }

    /** A mana's colour as players read it: one of W U B R G, otherwise colourless C. */
    static String colour(int mask) {
        return switch (mask) {
            case 1 -> "W";
            case 2 -> "U";
            case 4 -> "B";
            case 8 -> "R";
            case 16 -> "G";
            default -> "C";
        };
    }

    /** The colour of a cost symbol ("B/P" -> B, "2/W" -> W, "1" -> C): its first colour. */
    static String colourOfShard(String shard) {
        if (shard != null) {
            for (char c : shard.toCharArray()) {
                if ("WUBRG".indexOf(c) >= 0) {
                    return String.valueOf(c);
                }
            }
        }
        return "C";
    }

    /**
     * The symbol one mana paid: the one there is one fewer of after it
     * ([before], [after]: the unpaid symbols, Forge's own list, one entry per
     * mana). Null when none is fewer.
     */
    static String shardPaid(List<String> before, List<String> after) {
        Map<String, Integer> left = new HashMap<>();
        for (String s : after) {
            left.merge(s, 1, Integer::sum);
        }
        for (String s : before) {
            int n = left.getOrDefault(s, 0);
            if (n == 0) {
                return s;
            }
            left.put(s, n - 1);
        }
        return null;
    }

    /** Forge's unpaid symbols, short ("B", "1", "B/G"), one per mana still due. */
    static List<String> shards(forge.game.mana.ManaCostBeingPaid toPay) {
        List<String> out = new ArrayList<>();
        for (forge.card.mana.ManaCostShard shard : toPay.getUnpaidShards()) {
            out.add(shard.toShortString());
        }
        return out;
    }
}
