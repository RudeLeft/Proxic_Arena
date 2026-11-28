package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * Spec 0125, item 1 (F-0125-A) -- a lone block refused because the attacker
 * has menace is told to every board, once; any other refusal is not. The
 * game itself (both seats, the board after the refusal) is
 * scripts/check-blocks.py's menace scenario.
 */
class BlockRefusalsTest {

    private static final String BRUTE_ONE = "Boggart Brute (38) cannot be blocked with 1 creatures you've assigned";

    @Test
    void onlyAMenaceAttackersTooFewBlockersIsTold() {
        assertEquals(38, BlockRefusals.menaceAttacker(BRUTE_ONE, id -> id == 38));
        assertEquals(38, BlockRefusals.menaceAttacker(BRUTE_ONE + ".", id -> id == 38));
        // The same words for an attacker without menace (a "can't be blocked
        // except by three or more" creature): the defender's note alone.
        assertNull(BlockRefusals.menaceAttacker(BRUTE_ONE, id -> false));
        assertNull(BlockRefusals.menaceAttacker("Grizzly Bears (12) can't block alone.", id -> true));
        assertNull(BlockRefusals.menaceAttacker(null, id -> true));
        // A name with brackets of its own keeps the id Forge added last.
        assertEquals(51, BlockRefusals.menaceAttacker(
                "Hazmat Suit (Used) (51) cannot be blocked with 1 creatures you've assigned", id -> id == 51));
    }

    @Test
    void eachRefusalIsToldOnceWithItsBlockers() {
        List<BlockRefusals.Refused> now = new ArrayList<>();
        now.add(new BlockRefusals.Refused(38, List.of(75)));
        now.add(new BlockRefusals.Refused(38, List.of(75)));
        JsonArray told = BlockRefusals.drain(now);
        assertEquals(1, told.size());
        JsonObject entry = told.get(0).getAsJsonObject();
        assertEquals("card:38", entry.get("attacker").getAsString());
        assertEquals("card:75", entry.getAsJsonArray("blockers").get(0).getAsString());
        assertEquals("menace", entry.get("why").getAsString());
        // Once: the next round's boards carry none.
        assertEquals(0, now.size());
        assertEquals(0, BlockRefusals.drain(now).size());
    }
}
