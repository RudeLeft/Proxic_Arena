package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

/**
 * TEST ONLY -- the Mechanics Lab's deal (protocol/README.md, "Test-only:
 * the Lab's deal").
 *
 * A Lab scenario needs its moment, and a shuffle that never deals it
 * makes the scenario prove nothing (INCONCLUSIVE). So the Lab may name,
 * per seat, cards for the opening hand and the cards drawn after it, in
 * order. They are taken from the library AFTER Forge's own shuffle and
 * BEFORE the opening hand is drawn; everything else stays as Forge
 * shuffled it.
 *
 * Two locks keep it out of real games. The worker accepts the field only
 * when it was started with {@link #FLAG}, which the server's command line
 * never carries (MatchWorker builds it: java -jar jar res); and the
 * server builds START_GAME field by field (WorkerFrames.startGameFrame),
 * so nothing a player sends can put the field in front of the worker.
 * A START_GAME that carries it without the flag is refused, loudly.
 */
public final class LabDeal {

    /** The worker's command-line switch; only scripts/lab.py passes it. */
    public static final String FLAG = "--lab-deal";

    /** The START_GAME player field. */
    public static final String FIELD = "labDeal";

    /** Cards for the opening hand, by name. */
    public final List<String> hand;

    /** The cards drawn after the opening hand, in order, by name. */
    public final List<String> top;

    public LabDeal(List<String> hand, List<String> top) {
        this.hand = List.copyOf(hand);
        this.top = List.copyOf(top);
    }

    /** Whether the worker's arguments switch the Lab's deal on. */
    public static boolean allowed(String[] args) {
        for (String arg : args) {
            if (FLAG.equals(arg)) {
                return true;
            }
        }
        return false;
    }

    /** The seat's deal, or null when the seat carries none (every real game). */
    public static LabDeal read(JsonObject seat) {
        if (!seat.has(FIELD) || seat.get(FIELD).isJsonNull()) {
            return null;
        }
        JsonObject deal = seat.getAsJsonObject(FIELD);
        return new LabDeal(names(deal, "hand"), names(deal, "top"));
    }

    private static List<String> names(JsonObject deal, String key) {
        List<String> out = new ArrayList<>();
        if (deal.has(key) && !deal.get(key).isJsonNull()) {
            JsonArray array = deal.getAsJsonArray(key);
            for (JsonElement e : array) {
                out.add(e.getAsString());
            }
        }
        return out;
    }

    /**
     * Why this deal cannot be dealt from a deck holding these counts by
     * name, or null when it can.
     */
    public String problem(Map<String, Integer> countsByName, int handSize) {
        if (hand.size() > handSize) {
            return "labDeal names " + hand.size() + " cards for a " + handSize + "-card hand";
        }
        Map<String, Integer> wanted = new HashMap<>();
        for (String name : hand) {
            wanted.merge(name, 1, Integer::sum);
        }
        for (String name : top) {
            wanted.merge(name, 1, Integer::sum);
        }
        for (Map.Entry<String, Integer> e : wanted.entrySet()) {
            int have = countsByName.getOrDefault(e.getKey(), 0);
            if (have < e.getValue()) {
                return "labDeal wants " + e.getValue() + " " + e.getKey() + ", the deck has " + have;
            }
        }
        return null;
    }

    /**
     * The library in its dealt order, top first: the named hand cards,
     * the rest of the hand from the top of Forge's shuffle, then the
     * named next draws, then the rest as Forge shuffled it.
     *
     * @throws IllegalArgumentException when a named card is not there
     */
    public <T> List<T> arrange(List<T> library, Function<T, String> nameOf, int handSize) {
        List<T> rest = new ArrayList<>(library);
        List<T> handCards = take(rest, hand, nameOf);
        List<T> topCards = take(rest, top, nameOf);
        int fill = Math.min(Math.max(0, handSize - handCards.size()), rest.size());
        List<T> out = new ArrayList<>(library.size());
        out.addAll(handCards);
        List<T> fillers = rest.subList(0, fill);
        out.addAll(fillers);
        fillers.clear();
        out.addAll(topCards);
        out.addAll(rest);
        return Collections.unmodifiableList(out);
    }

    private static <T> List<T> take(List<T> from, List<String> names, Function<T, String> nameOf) {
        List<T> out = new ArrayList<>();
        for (String name : names) {
            T found = null;
            for (T card : from) {
                if (name.equals(nameOf.apply(card))) {
                    found = card;
                    break;
                }
            }
            if (found == null) {
                throw new IllegalArgumentException("labDeal: no " + name + " left in the library");
            }
            from.remove(found);
            out.add(found);
        }
        return out;
    }
}
