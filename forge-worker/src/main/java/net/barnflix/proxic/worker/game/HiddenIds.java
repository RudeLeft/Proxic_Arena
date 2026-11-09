package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * No seat is ever sent a live id for a card in a zone hidden from it
 * (AGENTS HID-001, HID-005; found 2026-11-08 by check-hidden-hands on
 * Krark, the Thumbless: a lost flip returned Alice's Lightning Bolt from
 * the stack to her hand, and Bob's snapshot of that round still pointed at
 * it -- in its move, in the payment made for it, in a play log line).
 *
 * A card's id is stable for the whole match, across zones (Phase 0A
 * "Object identity strategy"), so an id is a handle on the card wherever it
 * goes. The board's own lists already hold only what the viewer may see
 * (Forge's visibility, ViewerSnapshot); the history that travels with them
 * -- the round's moves, the last payments, the dice rolled, the latest
 * action report, the damage wave, the play log -- was written while the
 * card was public, and the card may be in a hand or a library by the time
 * the round is sent. Its name, its reason and its place stay (they were
 * public); its id goes.
 *
 * Hidden here means what the board cannot show this viewer: every library,
 * and every hand but the viewer's own -- less any card the snapshot's own
 * lists do show it (`otherHands`: Forge's own permission, Mindslaver or a
 * revealed hand). A card that no longer exists (a token gone from the
 * battlefield) is in no hidden zone, and keeps its id: the page still flies
 * it to the graveyard (its why, "died", for the shatter).
 */
final class HiddenIds {

    private HiddenIds() {
    }

    private static final Pattern CARD = Pattern.compile("card:\\d+");

    /** The snapshot lists that ARE the board: what is in them, the viewer sees. */
    private static final List<String> BOARD = List.of(
            "battlefield", "hand", "otherHands", "casting", "graveyard", "exile", "command", "stack");

    /** A move's fields that travel only with its card (Moves.forViewer). */
    private static final List<String> WITH_CARD = List.of("why", "said", "into");

    /**
     * The ids of the cards in zones [viewer] (null: a spectator) cannot see:
     * every player's library, every hand but the viewer's own. [players]
     * maps each player's cards by zone: {hand, library} -> card ids.
     */
    static Set<String> hiddenZones(Map<Integer, Map<String, List<Integer>>> players, Integer viewer) {
        Set<String> out = new HashSet<>();
        for (Map.Entry<Integer, Map<String, List<Integer>>> player : players.entrySet()) {
            for (Map.Entry<String, List<Integer>> zone : player.getValue().entrySet()) {
                boolean hidden = "library".equals(zone.getKey())
                        || ("hand".equals(zone.getKey()) && !player.getKey().equals(viewer));
                if (hidden) {
                    zone.getValue().forEach(id -> out.add("card:" + id));
                }
            }
        }
        return out;
    }

    /** Forge's hands and libraries, by seat, for [hiddenZones]. */
    static Map<Integer, Map<String, List<Integer>>> zonesOf(forge.game.Game game,
            Map<forge.game.player.Player, Integer> seats) {
        Map<Integer, Map<String, List<Integer>>> out = new java.util.LinkedHashMap<>();
        for (forge.game.player.Player player : game.getRegisteredPlayers()) {
            Integer seat = seats.get(player);
            Map<String, List<Integer>> zones = new java.util.LinkedHashMap<>();
            zones.put("hand", ids(player.getCardsIn(forge.game.zone.ZoneType.Hand)));
            zones.put("library", ids(player.getCardsIn(forge.game.zone.ZoneType.Library)));
            // A player with no seat (none today) is nobody's own hand: hidden from all.
            out.put(seat == null ? -1 - out.size() : seat, zones);
        }
        return out;
    }

    private static List<Integer> ids(Iterable<forge.game.card.Card> cards) {
        List<Integer> out = new ArrayList<>();
        cards.forEach(c -> out.add(c.getId()));
        return out;
    }

    /** Every card id the snapshot's board lists carry (any `id` or `source` inside them). */
    static Set<String> shown(JsonObject snapshot) {
        Set<String> out = new HashSet<>();
        for (String list : BOARD) {
            JsonElement zone = snapshot.get(list);
            if (zone != null) {
                out.addAll(PlayLog.cardIds(zone));
            }
        }
        return out;
    }

    /**
     * Removes from [snapshot], wherever it sits, every card id in [hidden]
     * that its board does not show. A move that loses its card loses what
     * travels only with a card (why, said, into); a mana that loses its
     * source says "unseen" (the page flies no ball from it); an id in a list
     * is dropped from the list. Returns how many were removed.
     */
    static int strip(JsonObject snapshot, Set<String> hidden) {
        Set<String> drop = new HashSet<>(hidden);
        drop.removeAll(shown(snapshot));
        if (drop.isEmpty()) {
            return 0;
        }
        return standIns(snapshot, drop) + walk(snapshot, null, drop);
    }

    /**
     * The cards Forge showed this viewer (`reveal`, spec 0045: Goblin
     * Ringleader's four) stay in the tray when they have gone on to a hand
     * or a library -- that is the reveal's point -- but under a stand-in id,
     * "reveal:KEY:I", never the card's own: the way Phase 9 Amendment 12's
     * `action` cards are already sent ("action:N:I"). Their names and
     * pictures (by name and printing, MatchArt) stay. Found by CI's
     * match-what-happened, 2026-11-08: with the id removed the page dropped
     * every card and the tray with them.
     */
    private static int standIns(JsonObject snapshot, Set<String> drop) {
        JsonElement reveal = snapshot.get("reveal");
        if (reveal == null || !reveal.isJsonObject()) {
            return 0;
        }
        JsonElement cards = reveal.getAsJsonObject().get("cards");
        JsonElement key = reveal.getAsJsonObject().get("key");
        if (cards == null || !cards.isJsonArray()) {
            return 0;
        }
        String prefix = "reveal:" + (key != null && key.isJsonPrimitive() ? key.getAsString() : "") + ":";
        int replaced = 0;
        JsonArray list = cards.getAsJsonArray();
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).isJsonObject() && dropped(list.get(i).getAsJsonObject().get("id"), drop)) {
                list.get(i).getAsJsonObject().addProperty("id", prefix + i);
                replaced++;
            }
        }
        return replaced;
    }

    private static boolean dropped(JsonElement value, Set<String> drop) {
        return value != null && value.isJsonPrimitive() && value.getAsJsonPrimitive().isString()
                && CARD.matcher(value.getAsString()).matches() && drop.contains(value.getAsString());
    }

    private static int walk(JsonElement node, String key, Set<String> drop) {
        int removed = 0;
        if (node == null || node.isJsonNull() || node.isJsonPrimitive()) {
            return 0;
        }
        if (node.isJsonArray()) {
            JsonArray array = node.getAsJsonArray();
            for (int i = array.size() - 1; i >= 0; i--) {
                if (dropped(array.get(i), drop)) {
                    array.remove(i);
                    removed++;
                } else {
                    removed += walk(array.get(i), key, drop);
                }
            }
            return removed;
        }
        JsonObject object = node.getAsJsonObject();
        for (String name : new ArrayList<>(object.keySet())) {
            JsonElement value = object.get(name);
            if (dropped(value, drop)) {
                object.remove(name);
                removed++;
                if ("moves".equals(key) && "card".equals(name)) {
                    WITH_CARD.forEach(object::remove);
                }
                if ("mana".equals(key) && "from".equals(name)) {
                    object.addProperty("from", "unseen");
                }
            } else {
                removed += walk(value, name, drop);
            }
        }
        return removed;
    }
}
