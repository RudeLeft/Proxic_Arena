package net.barnflix.proxic.worker.game;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0070 -- a cost paid card by card says what is picked so far, and a
 * picked card can be taken back (F-0070-B, F-0070-C). The game itself is
 * proven by scripts/check-pay-picks.py.
 */
class CostPicksTest {

    /** F-0070-C -- every card-by-card cost kind has its word, and only a tap leans. */
    @Test
    void everyCostKindHasItsWord() {
        Map<String, String> words = new LinkedHashMap<>();
        words.put("CostTapType", "TAP");
        words.put("CostUntapType", "UNTAP");
        words.put("CostSacrifice", "SACRIFICE");
        words.put("CostExile", "EXILE");
        words.put("CostCollectEvidence", "EXILE");
        words.put("CostForage", "EXILE");
        words.put("CostReturn", "TO HAND");
        words.put("CostPutCardToLib", "TO LIBRARY");
        words.put("CostExiledMoveToGrave", "TO GRAVEYARD");
        words.put("CostReveal", "REVEAL");
        words.put("CostBehold", "BEHOLD");
        words.put("CostDiscard", "DISCARD");
        words.put("CostUnattach", "UNATTACH");
        words.forEach((cost, word) -> {
            CostPicks.Pay pay = CostPicks.of(cost);
            assertEquals(word, pay.word(), cost);
            assertEquals("CostTapType".equals(cost), pay.lean(), cost + " leans only when it taps");
        });
        // Anything Forge adds later still gets a mark, never a blank one.
        assertEquals("PAY", CostPicks.of("CostSomethingNew").word());
        assertEquals("PAY", CostPicks.of(null).word());
        assertEquals("sacrifice", CostPicks.SACRIFICE.tone());
        assertEquals("discard", CostPicks.DISCARD.tone());
    }

    /** What the question carries: the Pay, and each pick so far in the order picked. */
    @Test
    void thePickingSaysWhatIsPickedInOrder() {
        Map<String, String> picked = new LinkedHashMap<>();
        picked.put("card:12", "Llanowar Elves");
        picked.put("card:9", "Elvish Mystic");
        JsonObject out = CostPicks.picking(CostPicks.TAP, picked);
        assertEquals("TAP", out.get("word").getAsString());
        assertEquals("tap", out.get("tone").getAsString());
        assertTrue(out.get("lean").getAsBoolean());
        assertEquals(2, out.getAsJsonArray("picked").size());
        JsonObject first = out.getAsJsonArray("picked").get(0).getAsJsonObject();
        assertEquals("card:12", first.get("objectId").getAsString());
        assertEquals("unpick:card:12", first.get("actionId").getAsString());
        assertEquals("Llanowar Elves", first.get("label").getAsString());
        assertEquals("card:9",
                out.getAsJsonArray("picked").get(1).getAsJsonObject().get("objectId").getAsString());
        // A cost that does not tap says nothing of leaning.
        assertFalse(CostPicks.picking(CostPicks.SACRIFICE, Map.of()).has("lean"));
        assertEquals(0, CostPicks.picking(CostPicks.SACRIFICE, Map.of()).getAsJsonArray("picked").size());
    }

    /** F-0070-B -- the gate accepts a take-back of each pick, and it names the card it gives back. */
    @Test
    void aTakeBackIsAnAnswerForEachPick() {
        List<String> answers = CostPicks.answers(List.of("cost:card:4", "cost:card:5"), List.of("card:12"));
        assertEquals(List.of("cost:card:4", "cost:card:5", "unpick:card:12"), answers);
        assertEquals("card:12", CostPicks.unpicked("unpick:card:12"));
        assertNull(CostPicks.unpicked("cost:card:4"));
        assertNull(CostPicks.unpicked(null));
        assertNull(CostPicks.unpicked(DecisionGate.PASS));
        assertTrue(CostPicks.isUnpick("unpick:card:12"));
        assertFalse(CostPicks.isUnpick("cost:card:12"));
        // With nothing picked there is nothing to take back.
        assertEquals(List.of("cost:card:4"), CostPicks.answers(List.of("cost:card:4"), List.of()));
    }

    /** The gate itself takes a take-back that was offered, and refuses one that was not. */
    @Test
    void theGateTakesOnlyATakeBackItOffered() throws Exception {
        DecisionGate gate = new DecisionGate();
        java.util.concurrent.atomic.AtomicReference<DecisionGate.Pending> asked =
                new java.util.concurrent.atomic.AtomicReference<>();
        java.util.concurrent.CompletableFuture<String> answer = java.util.concurrent.CompletableFuture.supplyAsync(
                () -> {
                    try {
                        return gate.ask(1, 1, "CostTapType",
                                CostPicks.answers(List.of("cost:card:4"), List.of("card:12")), false, "Tap",
                                asked::set);
                    } catch (InterruptedException e) {
                        throw new IllegalStateException(e);
                    }
                });
        while (asked.get() == null) {
            Thread.sleep(5);
        }
        DecisionGate.Pending q = asked.get();
        assertEquals(DecisionGate.Reject.STALE_DECISION,
                gate.submit(new DecisionGate.Response(q.decisionId(), 1, q.stateVersion(), "unpick:card:4")));
        assertNull(gate.submit(new DecisionGate.Response(q.decisionId(), 1, q.stateVersion(), "unpick:card:12")));
        assertEquals("unpick:card:12", answer.get());
    }
}
