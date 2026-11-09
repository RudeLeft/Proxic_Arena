package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0064 -- the play log's lines, from BOTH seats (HID-003): a card a
 * seat may not identify (an item of null, as PlayLog builds it from Forge's
 * two visibility questions) never reaches that seat's line by name or id,
 * and the seat that may see it is told. The real game, with Forge deciding
 * the visibility, is scripts/check-play-log.py and check-hidden-log.py.
 */
class PlayLogTest {

    private static JsonObject card(String name, int id, int owner) {
        JsonObject part = new JsonObject();
        part.addProperty("name", name);
        part.addProperty("known", true);
        part.addProperty("id", "card:" + id);
        part.addProperty("owner", owner);
        part.addProperty("seat", owner);
        return part;
    }

    /** "Bob drew ..." for both seats: Bob may see the card, Alice may not. */
    private static PlayLog.Fact draw(int drawer, Map<Integer, JsonElement> seen) {
        PlayLog.Fact fact = new PlayLog.Fact("draw", 3, drawer, "Beginning");
        seen.forEach((seat, item) -> fact.itemsFor(seat).add(item));
        fact.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            out.add(PlayLog.player(drawer));
            PlayLog.text(out, " drew ");
            PlayLog.list(out, items, "a card", "cards");
            return out;
        };
        return fact;
    }

    private static String words(JsonObject line) {
        StringBuilder out = new StringBuilder();
        for (JsonElement part : line.getAsJsonArray("parts")) {
            if (part.isJsonPrimitive()) {
                out.append(part.getAsString());
            } else if (part.getAsJsonObject().has("player")) {
                out.append(part.getAsJsonObject().get("player").getAsInt() == 1 ? "Alice" : "Bob");
            } else {
                out.append(part.getAsJsonObject().get("name").getAsString());
            }
        }
        return out.toString();
    }

    @Test
    void aDrawIsNamedToTheDrawerAndToNobodyElse() {
        Map<Integer, JsonElement> seen = new HashMap<>();
        seen.put(2, card("Giant Growth", 41, 2));
        seen.put(1, null);
        Map<Integer, JsonArray> out = PlayLog.lines(List.of(draw(2, seen)), List.of(1, 2), 17, new HashMap<>());

        JsonObject bobs = out.get(2).get(0).getAsJsonObject();
        assertEquals("Bob drew Giant Growth", words(bobs));
        assertTrue(bobs.get("private").getAsBoolean(), "only Bob was told the name");

        JsonObject alices = out.get(1).get(0).getAsJsonObject();
        assertEquals("Bob drew a card", words(alices));
        assertFalse(alices.toString().contains("Giant Growth"), "Alice's line must not name it");
        assertFalse(alices.toString().contains("card:41"), "nor carry its id, which could be followed");
        assertNull(alices.get("private"));
        // Both delivered with the round that shows the draw.
        assertEquals(17, alices.get("rev").getAsLong());
        assertEquals(17, bobs.get("rev").getAsLong());
    }

    @Test
    void aRunOfDrawsCountsTheHiddenOnesAndNamesTheRest() {
        PlayLog.Fact fact = new PlayLog.Fact("draw", 0, 0, "Before the game");
        for (int i = 0; i < 7; i++) {
            fact.itemsFor(1).add(card("Island", 10 + i, 1));
            fact.itemsFor(2).add(null);
        }
        fact.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            out.add(PlayLog.player(1));
            PlayLog.text(out, " drew ");
            PlayLog.list(out, items, "a card", "cards");
            return out;
        };
        Map<Integer, JsonArray> out = PlayLog.lines(List.of(fact), List.of(1, 2), 3, new HashMap<>());
        assertEquals("Alice drew 7 cards", words(out.get(2).get(0).getAsJsonObject()));
        assertEquals("Alice drew Island, Island, Island, Island, Island, Island and Island",
                words(out.get(1).get(0).getAsJsonObject()));
    }

    @Test
    void aPublicLineIsTheSameForBothAndPrivateForNeither() {
        PlayLog.Fact fact = new PlayLog.Fact("death", 5, 1, "Main 1");
        fact.itemsFor(1).add(card("Grizzly Bears", 9, 2));
        fact.itemsFor(2).add(card("Grizzly Bears", 9, 2));
        fact.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            PlayLog.part(out, items.get(0), "a card");
            PlayLog.text(out, " died");
            return out;
        };
        Map<Integer, JsonArray> out = PlayLog.lines(List.of(fact), List.of(1, 2), 9, new HashMap<>());
        for (int seat : new int[] {1, 2}) {
            JsonObject line = out.get(seat).get(0).getAsJsonObject();
            assertEquals("Grizzly Bears died", words(line));
            assertNull(line.get("private"));
        }
    }

    @Test
    void aFaceDownCardIsNamedToItsControllerOnlyAndSaysSo() {
        JsonObject willbender = card("Willbender", 20, 1);
        willbender.addProperty("faceDown", true);
        PlayLog.Fact fact = new PlayLog.Fact("spell", 6, 1, "Main 1");
        fact.itemsFor(1).add(willbender);
        fact.itemsFor(2).add(null);
        fact.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            out.add(PlayLog.player(1));
            PlayLog.text(out, " cast ");
            PlayLog.part(out, items.get(0), "a face-down spell");
            return out;
        };
        Map<Integer, JsonArray> out = PlayLog.lines(List.of(fact), List.of(1, 2), 30, new HashMap<>());
        assertEquals("Alice cast Willbender (face down)", words(out.get(1).get(0).getAsJsonObject()));
        JsonObject bobs = out.get(2).get(0).getAsJsonObject();
        assertEquals("Alice cast a face-down spell", words(bobs));
        assertFalse(bobs.toString().contains("Willbender"));
        assertFalse(bobs.toString().contains("card:20"));
    }

    @Test
    void aLineToldToOneSeatReachesNoOtherAndIsNumberedPerSeat() {
        PlayLog.Fact shown = new PlayLog.Fact("reveal", 4, 2, "Main 1");
        shown.only = 1;
        shown.itemsFor(1).add(card("Shivan Dragon", 77, 2));
        shown.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            PlayLog.text(out, "Looking at Bob's hand: ");
            PlayLog.list(out, items, "a card", "cards");
            return out;
        };
        PlayLog.Fact turn = new PlayLog.Fact("turn", 5, 1, "Beginning");
        Map<Integer, Integer> numbered = new HashMap<>();
        numbered.put(1, 10);
        numbered.put(2, 4);
        Map<Integer, JsonArray> out = PlayLog.lines(List.of(shown, turn), List.of(1, 2), 40, numbered);
        assertEquals(2, out.get(1).size());
        assertEquals(1, out.get(2).size(), "Bob is told only the turn");
        assertFalse(out.get(2).toString().contains("Shivan"));
        assertTrue(out.get(1).get(0).getAsJsonObject().get("private").getAsBoolean());
        assertEquals(11, out.get(1).get(0).getAsJsonObject().get("n").getAsInt());
        assertEquals(12, out.get(1).get(1).getAsJsonObject().get("n").getAsInt());
        assertEquals(5, out.get(2).get(0).getAsJsonObject().get("n").getAsInt());
    }

    /**
     * Spec 0067 (F-0067-E) -- the public log, read by spectators: a draw
     * says "Bob drew a card" with no name and no id, a line Forge told one
     * seat alone never reaches it, and the players' "private" marks are
     * measured between the players as before.
     */
    @Test
    void thePublicLogNamesOnlyWhatEveryoneMaySee() {
        int pub = PlayLog.PUBLIC_SEAT;
        Map<Integer, JsonElement> seen = new HashMap<>();
        seen.put(2, card("Giant Growth", 41, 2));
        seen.put(1, null);
        seen.put(pub, null);
        PlayLog.Fact shown = new PlayLog.Fact("reveal", 3, 2, "Main 1");
        shown.only = 1;
        shown.itemsFor(1).add(card("Shivan Dragon", 77, 2));
        shown.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            PlayLog.text(out, "Looking at Bob's hand: ");
            PlayLog.list(out, items, "a card", "cards");
            return out;
        };
        PlayLog.Fact death = new PlayLog.Fact("death", 3, 2, "Main 1");
        for (int seat : new int[] {1, 2, pub}) {
            death.itemsFor(seat).add(card("Grizzly Bears", 9, 2));
        }
        death.phrase = (seat, items) -> {
            JsonArray out = new JsonArray();
            PlayLog.part(out, items.get(0), "a card");
            PlayLog.text(out, " died");
            return out;
        };
        Map<Integer, JsonArray> out =
                PlayLog.lines(List.of(draw(2, seen), shown, death), List.of(1, 2, pub), 17, new HashMap<>());

        JsonArray spectators = out.get(pub);
        assertEquals(2, spectators.size(), "the draw and the death; never the reveal to Alice");
        JsonObject drew = spectators.get(0).getAsJsonObject();
        assertEquals("Bob drew a card", words(drew));
        assertFalse(spectators.toString().contains("Giant Growth"));
        assertFalse(spectators.toString().contains("card:41"));
        assertFalse(spectators.toString().contains("Shivan"));
        assertFalse(spectators.toString().contains("card:77"));
        assertNull(drew.get("private"));
        assertEquals("Grizzly Bears died", words(spectators.get(1).getAsJsonObject()));
        // The players' lines are as they were: Bob's draw is his alone.
        assertTrue(out.get(2).get(0).getAsJsonObject().get("private").getAsBoolean());
        assertNull(out.get(1).get(0).getAsJsonObject().get("private"));
    }

    @Test
    void listsReadAsEnglish() {
        JsonArray out = new JsonArray();
        List<JsonElement> items = new ArrayList<>();
        items.add(card("A", 1, 1));
        items.add(card("B", 2, 1));
        items.add(null);
        items.add(null);
        PlayLog.list(out, items, "a card", "cards");
        assertEquals(", ", out.get(1).getAsString());
        assertEquals(" and 2 cards", out.get(3).getAsString());
        assertEquals("Hello", PlayLog.capital(jsonOf("hello")).get(0).getAsString());
    }

    @Test
    void aLineKeepsACardsIdOnlyWhileTheBoardItTravelsWithShowsIt() {
        // Krark, the Thumbless: Alice's Lightning Bolt left the stack for her
        // hand. Bob's line keeps the name (it was public) but not the id.
        JsonArray lines = new JsonArray();
        JsonObject line = new JsonObject();
        JsonArray parts = new JsonArray();
        parts.add(card("Lightning Bolt", 7, 1));
        parts.add(" returned to ");
        parts.add(card("Mountain", 39, 1));
        line.add("parts", parts);
        lines.add(line);
        JsonObject board = new JsonObject();
        JsonArray battlefield = new JsonArray();
        JsonObject mountain = new JsonObject();
        mountain.addProperty("id", "card:39");
        battlefield.add(mountain);
        board.add("battlefield", battlefield);
        board.add("playLog", lines.deepCopy()); // the log itself shows nothing
        PlayLog.keepShownIds(lines, PlayLog.cardIds(board));
        JsonObject bolt = parts.get(0).getAsJsonObject();
        assertEquals("Lightning Bolt", bolt.get("name").getAsString());
        assertNull(bolt.get("id"), "an id the board does not show is a handle on a hidden card");
        assertEquals("card:39", parts.get(2).getAsJsonObject().get("id").getAsString());
    }

    private static JsonArray jsonOf(String text) {
        JsonArray out = new JsonArray();
        out.add(text);
        return out;
    }
}
