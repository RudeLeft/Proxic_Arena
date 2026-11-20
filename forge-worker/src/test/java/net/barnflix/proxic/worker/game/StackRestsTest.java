package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0105 -- the stack always shows: which pass rests, and for how long.
 * The rule as plain state; driven against Forge by the Mechanics Lab
 * (scripts/check-stack-rests.py).
 */
class StackRestsTest {

    private static StackRests ruled() {
        // Both seats follow the stops rule (PriorityStops#active).
        return new StackRests(() -> true);
    }

    @Test
    void theOwnersNumbers() {
        assertEquals(2500, StackRests.REST_MS);
        assertEquals(800, StackRests.REST_NEXT_MS);
        assertEquals(3100, StackRests.ARRIVE_SPELL_MS);
        assertEquals(700, StackRests.ARRIVE_ABILITY_MS);
    }

    @Test
    void theSecondPassRestsASpellNobodyWasAskedAbout() {
        StackRests rests = ruled();
        assertNull(rests.passing(1, 7, 2, true), "the caster's own pass: the other seat has not passed yet");
        StackRests.Rest rest = rests.passing(2, 7, 2, true);
        assertNotNull(rest);
        assertEquals(new StackRests.Rest(7, 5600, 3100), rest);
        assertNull(rests.passing(1, 7, 2, true), "it rests once");
    }

    @Test
    void anAbilityOrTriggerRestsItsOwnAllowance() {
        StackRests rests = ruled();
        rests.passing(1, 3, 2, false);
        assertEquals(new StackRests.Rest(3, 3200, 700), rests.passing(2, 3, 2, false));
    }

    @Test
    void anyQuestionWhileItIsOnTopMeansNoRest() {
        StackRests rests = ruled();
        rests.passing(1, 7, 2, true);
        rests.asked(7);
        assertNull(rests.passing(2, 7, 2, true));
    }

    @Test
    void aQuestionAboutAnEarlierTopDoesNotCountForTheNext() {
        StackRests rests = ruled();
        rests.asked(5);
        rests.see(-1);
        rests.passing(1, 6, 2, true);
        assertNotNull(rests.passing(2, 6, 2, true));
    }

    @Test
    void severalInARowRestTheFullTimeFirstThenEightTenths() {
        StackRests rests = ruled();
        rests.passing(1, 9, 2, false);
        assertEquals(3200, rests.passing(2, 9, 2, false).ms());
        rests.passing(1, 8, 2, false);
        StackRests.Rest second = rests.passing(2, 8, 2, false);
        assertEquals(new StackRests.Rest(8, 800, 0), second);
        rests.passing(1, 7, 2, false);
        assertEquals(800, rests.passing(2, 7, 2, false).ms());
    }

    @Test
    void aQuestionOrAnEmptyStackEndsTheRun() {
        StackRests rests = ruled();
        rests.passing(1, 9, 2, false);
        rests.passing(2, 9, 2, false);
        rests.asked(-1);
        rests.passing(1, 8, 2, false);
        assertEquals(3200, rests.passing(2, 8, 2, false).ms(), "a question between: the full rest");
        rests.see(-1);
        rests.passing(1, 4, 2, true);
        assertEquals(5600, rests.passing(2, 4, 2, true).ms(), "the stack emptied between: the full rest");
    }

    @Test
    void playingSomethingStartsTheCountAgain() {
        StackRests rests = ruled();
        rests.passing(1, 7, 2, true);
        rests.acted(7); // seat 2 tapped a land for mana: Forge resets who has passed
        assertNull(rests.passing(2, 7, 2, true));
        assertNotNull(rests.passing(1, 7, 2, true));
    }

    @Test
    void noRestWithoutTheStopsRuleOrWithAnEmptyStack() {
        StackRests off = new StackRests(() -> false);
        off.passing(1, 7, 2, true);
        assertNull(off.passing(2, 7, 2, true), "a Lab game with no stops never rests");
        StackRests rests = ruled();
        assertNull(rests.passing(1, -1, 2, false));
        assertNull(rests.passing(2, -1, 2, false));
    }

    @Test
    void theBoardSaysOnlyHowLong() {
        StackRests rests = ruled();
        JsonObject board = new JsonObject();
        JsonArray stack = new JsonArray();
        JsonObject top = new JsonObject();
        top.addProperty("id", "stack:7");
        JsonObject under = new JsonObject();
        under.addProperty("id", "stack:6");
        stack.add(top);
        stack.add(under);
        board.add("stack", stack);
        rests.mark(board);
        assertFalse(top.has("rest"), "nothing resting: nothing said");
        rests.show(new StackRests.Rest(7, 5600, 3100));
        rests.mark(board);
        JsonObject rest = top.getAsJsonObject("rest");
        assertEquals(5600, rest.get("ms").getAsLong());
        assertEquals(3100, rest.get("arriveMs").getAsLong());
        assertEquals(2, rest.size(), "no reason, no seat, no card");
        assertFalse(under.has("rest"));
    }

    @Test
    void wakingEndsTheRestAtOnce() throws InterruptedException {
        StackRests rests = ruled();
        Thread waker = new Thread(() -> {
            try {
                Thread.sleep(100);
            } catch (InterruptedException e) {
                return;
            }
            rests.wake();
        });
        long start = System.nanoTime();
        waker.start();
        rests.sleep(5000, () -> { }, () -> false);
        long took = (System.nanoTime() - start) / 1_000_000L;
        waker.join();
        assertTrue(took < 2000, "woken after 100 ms, it took " + took + " ms");
    }

    @Test
    void theGameEndingEndsTheRest() {
        StackRests rests = ruled();
        boolean[] conceded = {false};
        long start = System.nanoTime();
        rests.sleep(5000, () -> conceded[0] = true, () -> conceded[0]);
        assertTrue((System.nanoTime() - start) / 1_000_000L < 1000);
    }
}
