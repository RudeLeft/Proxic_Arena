package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Spec 0084 -- spent moves and the fights of fight and bite spells, as sent. */
class SpentTest {

    @Test
    void aSpentSacrificeSaysSoToEveryone() {
        List<Moves.Move> moves = List.of(
                new Moves.Move(7, "battlefield", 1, "graveyard", 1, false, "sacrificed"),
                new Moves.Move(8, "battlefield", 2, "graveyard", 2, false, "sacrificed"),
                new Moves.Move(9, "battlefield", 2, "graveyard", 2, false, "destroyed"));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonArray told = Moves.forViewer(moves, viewer, Set.of(7, 9));
            assertTrue(told.get(0).getAsJsonObject().get("spent").getAsBoolean(), "the Treasure was spent");
            assertFalse(told.get(1).getAsJsonObject().has("spent"), "an Edict's victim was not");
            assertFalse(told.get(2).getAsJsonObject().has("spent"), "only a sacrifice can be spent");
        }
        assertFalse(Moves.forViewer(moves, 1).get(0).getAsJsonObject().has("spent"),
                "nothing spent unless the round says so");
    }

    @Test
    void aFightIsOneFightBothStriking() {
        JsonArray fights = new JsonArray();
        Spent.addFight(fights, "fight", "card:1", "card:2");
        Spent.addFight(fights, "fight", "card:2", "card:1");
        assertEquals(1, fights.size(), "the hit back is the same fight");
        JsonObject f = fights.get(0).getAsJsonObject();
        assertEquals("card:1", f.get("attacker").getAsString());
        assertEquals("card:2", f.getAsJsonObject("defender").get("object").getAsString());
        assertEquals(1, f.getAsJsonArray("blockers").size(), "both strike: the defender blocks");
    }

    @Test
    void aBiteHasNoBlockers() {
        JsonArray fights = new JsonArray();
        Spent.addFight(fights, "bite", "card:1", "card:5");
        JsonObject f = fights.get(0).getAsJsonObject();
        assertEquals(0, f.getAsJsonArray("blockers").size(), "only the biter strikes");
    }

    @Test
    void nothingIsReadWithNoGame() {
        assertFalse(Spent.isSpent(null, 3));
        assertNull(Spent.fightKind(null, null));
        assertNull(Spent.crewed(null));
    }
}
