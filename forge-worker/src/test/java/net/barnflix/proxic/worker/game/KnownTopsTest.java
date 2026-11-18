package net.barnflix.proxic.worker.game;

import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0103, item 4 (F-0103-D, F-0103-D2 (1)-(4)) -- the cards a player put
 * on top of its own library in its own order. Alice is seat 1, Bob seat 2.
 * Alice's Brainstorm put back Forest (card:30) and then Lightning Bolt
 * (card:31): Bolt on top. The game itself is scripts/check-known-top.py.
 */
class KnownTopsTest {

    private static final int BOLT = 31;
    private static final int FOREST = 30;

    private static JsonObject named(int id) {
        JsonObject card = new JsonObject();
        card.addProperty("id", "card:" + id);
        card.addProperty("name", id == BOLT ? "Lightning Bolt" : id == FOREST ? "Forest" : "Island");
        card.addProperty("known", true);
        return card;
    }

    /** Brainstorm: chosen, then the two cards arrive on top. */
    private static KnownTops brainstormed() {
        KnownTops tops = new KnownTops();
        tops.chose(1, List.of(BOLT, FOREST));
        tops.movedIn(1, FOREST);
        tops.movedIn(1, BOLT);
        return tops;
    }

    @Test
    void brainstormPutBackIsKnownTopFirstToItsOwnerOnly() {
        KnownTops tops = brainstormed();
        JsonObject alice = new JsonObject();
        assertEquals(2, tops.addTo(alice, 1, List.of(BOLT, FOREST, 40, 41), KnownTopsTest::named));
        assertEquals("Lightning Bolt", alice.getAsJsonArray("knownTop").get(0).getAsJsonObject().get("name").getAsString());
        assertEquals("Forest", alice.getAsJsonArray("knownTop").get(1).getAsJsonObject().get("name").getAsString());
        // Never the card's own id: a library card's id is a live handle.
        String sent = alice.toString();
        assertFalse(sent.contains("card:" + BOLT) || sent.contains("card:" + FOREST), sent);
        assertEquals("known:1:0", alice.getAsJsonArray("knownTop").get(0).getAsJsonObject().get("id").getAsString());
        // Bob knows nothing of Alice's library: his own list is empty.
        JsonObject bob = new JsonObject();
        assertEquals(0, tops.addTo(bob, 2, List.of(50, 51), KnownTopsTest::named));
        assertFalse(bob.has("knownTop"));
    }

    @Test
    void aDrawPopsOneAndAShuffleClearsIt() {
        KnownTops tops = brainstormed();
        assertEquals(List.of(BOLT, FOREST), tops.knownFor(1, List.of(BOLT, FOREST, 40)));
        tops.movedOut(1, BOLT); // drawn
        assertEquals(List.of(FOREST), tops.knownFor(1, List.of(FOREST, 40)));
        tops.shuffled(1);
        assertEquals(List.of(), tops.knownFor(1, List.of(FOREST, 40)));
    }

    @Test
    void anotherCardPutIntoTheLibraryForgetsIt() {
        KnownTops tops = brainstormed();
        assertEquals(2, tops.knownFor(1, List.of(BOLT, FOREST, 40)).size());
        // The other player's effect puts a card on top (not chosen by Alice).
        tops.movedIn(1, 99);
        assertEquals(List.of(), tops.knownFor(1, List.of(99, BOLT, FOREST, 40)));
    }

    @Test
    void aScryToTheBottomAddsNothing() {
        KnownTops tops = new KnownTops();
        tops.movedIn(1, 40); // moved within: to the bottom, not chosen for the top
        assertEquals(List.of(), tops.knownFor(1, List.of(41, 42, 40)));
    }

    @Test
    void neverSentWhenItIsNotTheLibraryTopAnyMore() {
        KnownTops tops = brainstormed();
        // A move this book never heard of (the order changed): nothing stale.
        assertEquals(List.of(), tops.knownFor(1, List.of(FOREST, BOLT, 40)));
    }

    @Test
    void aKnownCardMilledLeavesNoStaleEntry() {
        KnownTops tops = brainstormed();
        tops.knownFor(1, List.of(BOLT, FOREST, 40));
        tops.movedOut(1, BOLT);
        tops.movedOut(1, FOREST);
        assertTrue(tops.knownFor(1, List.of(40)).isEmpty());
    }

    @Test
    void pendingUntilTheCardsAreThere() {
        KnownTops tops = new KnownTops();
        tops.chose(1, List.of(BOLT, FOREST));
        tops.movedIn(1, FOREST);
        // Mid-move: Forest on top, Bolt not yet -- nothing is claimed.
        assertEquals(List.of(), tops.knownFor(1, List.of(FOREST, 40)));
        tops.movedIn(1, BOLT);
        assertEquals(List.of(BOLT, FOREST), tops.knownFor(1, List.of(BOLT, FOREST, 40)));
    }

    @Test
    void aDrawBeforeAnyBoardStillPops() {
        // Brainstorm at the end of the other player's turn, then the draw step:
        // no board is sent between (the real-click game, 2026-11-18).
        KnownTops tops = new KnownTops();
        tops.chose(1, List.of(BOLT, FOREST));
        tops.movedIn(1, FOREST);
        tops.movedIn(1, BOLT);
        tops.movedOut(1, BOLT); // drawn
        assertEquals(List.of(FOREST), tops.knownFor(1, List.of(FOREST, 40)));
    }

    @Test
    void thisTurnCountsAreForgesNumbers() {
        // Opt, Bolt and Healing Salve; +3 life; Fatal Push killed the Elves.
        JsonObject counts = ViewerSnapshot.thisTurn(3, 3, true);
        assertEquals(3, counts.get("spells").getAsInt());
        assertEquals(3, counts.get("lifeGained").getAsInt());
        assertTrue(counts.get("leftBattlefield").getAsBoolean());
        assertFalse(counts.has("manaSpent"), "mana spent is dropped (Decided 3)");
    }
}
