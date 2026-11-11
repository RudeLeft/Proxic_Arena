package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0070, Amendment 1 -- the "seen" eye (F-0070-G, F-0070-H). Bob (seat
 * 2) revealed card:20 and card:21 from his hand to Alice (seat 1), as
 * Duress does. The game itself is proven by scripts/check-seen-hands.py.
 */
class SeenHandsTest {

    private static JsonArray hand(String json) {
        return JsonParser.parseString(json).getAsJsonArray();
    }

    @Test
    void theRevealerSeesTheEyeOnTheCardsTheOtherPlayerSaw() {
        SeenHands seen = new SeenHands();
        seen.saw(1, List.of(20, 21));
        JsonArray bobs = hand("[{\"id\":\"card:20\"},{\"id\":\"card:21\"},{\"id\":\"card:22\"}]");
        seen.markOwnHand(bobs, 2);
        assertTrue(bobs.get(0).getAsJsonObject().get("seen").getAsBoolean());
        assertTrue(bobs.get(1).getAsJsonObject().get("seen").getAsBoolean());
        // A card drawn after the reveal was never seen.
        assertFalse(bobs.get(2).getAsJsonObject().has("seen"));
    }

    @Test
    void onlyTheSeatThatSawItKnowsIt() {
        SeenHands seen = new SeenHands();
        seen.saw(1, List.of(20));
        assertTrue(seen.seenBy(20, 1));
        // Not the owner (a seat seeing its own card is no eye), not a third
        // seat, not the public view (seat 0).
        assertFalse(seen.seenBy(20, 2));
        assertFalse(seen.seenBy(20, 3));
        assertFalse(seen.seenBy(20, GameHost.PUBLIC_SEAT));
        JsonArray alices = hand("[{\"id\":\"card:20\"}]");
        seen.markOwnHand(alices, 1);
        assertFalse(alices.get(0).getAsJsonObject().has("seen"), "seen by its own seat only: no eye");
    }

    @Test
    void forgottenWhenTheCardChangesZone() {
        SeenHands seen = new SeenHands();
        seen.saw(1, List.of(20, 21));
        seen.forget(20); // played, or discarded -- and drawn again later
        assertFalse(seen.seenBy(20, 1));
        assertFalse(seen.seenByOther(20, 2));
        assertTrue(seen.seenBy(21, 1));
        JsonArray bobs = hand("[{\"id\":\"card:20\"}]");
        seen.markOwnHand(bobs, 2);
        assertFalse(bobs.get(0).getAsJsonObject().has("seen"));
    }

    @Test
    void anIdIsReadOnlyFromACardId() {
        assertEquals(12, SeenHands.idOf(obj("{\"id\":\"card:12\"}")));
        assertNull(SeenHands.idOf(obj("{\"id\":\"stack:12\"}")));
        assertNull(SeenHands.idOf(obj("{}")));
    }

    private static JsonObject obj(String json) {
        return JsonParser.parseString(json).getAsJsonObject();
    }
}
