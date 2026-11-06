package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Phase 10 A-00: each seat told only the moves it may see. */
class MovesTest {

    private static JsonObject only(JsonArray moves) {
        assertEquals(1, moves.size());
        return moves.get(0).getAsJsonObject();
    }

    @Test
    void aDestroyedCreatureIsNamedToEveryone() {
        List<Moves.Move> moves = List.of(new Moves.Move(12, "battlefield", 2, "graveyard", 2, false, "destroyed"));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonObject move = only(Moves.forViewer(moves, viewer));
            assertEquals("card:12", move.get("card").getAsString());
            assertEquals("destroyed", move.get("why").getAsString());
            assertEquals("battlefield", move.getAsJsonObject("from").get("zone").getAsString());
            assertEquals(2, move.getAsJsonObject("to").get("seat").getAsInt());
        }
    }

    @Test
    void theOtherPlayersDrawIsACardWithNoName() {
        List<Moves.Move> moves = List.of(new Moves.Move(40, "library", 2, "hand", 2, false, null));
        JsonObject theirs = only(Moves.forViewer(moves, 1));
        assertFalse(theirs.has("card"), "seat 1 must not learn which card seat 2 drew");
        assertEquals("library", theirs.getAsJsonObject("from").get("zone").getAsString());
        assertEquals("hand", theirs.getAsJsonObject("to").get("zone").getAsString());
        assertFalse(only(Moves.forViewer(moves, null)).has("card"), "nor may a spectator");
        assertEquals("card:40", only(Moves.forViewer(moves, 2)).get("card").getAsString());
    }

    @Test
    void aCardBouncedToAHandIsNamedBecauseItWasOnTheTable() {
        List<Moves.Move> moves = List.of(new Moves.Move(7, "battlefield", 1, "hand", 2, false, null));
        assertEquals("card:7", only(Moves.forViewer(moves, 1)).get("card").getAsString());
    }

    @Test
    void faceDownExileHidesTheCardButAFaceDownPermanentIsShown() {
        List<Moves.Move> exiled = List.of(new Moves.Move(9, "library", 1, "exile", 1, true, null));
        assertFalse(only(Moves.forViewer(exiled, 1)).has("card"));
        List<Moves.Move> morph = List.of(new Moves.Move(9, "stack", 1, "battlefield", 1, true, null));
        assertTrue(only(Moves.forViewer(morph, 2)).has("card"));
    }

    @Test
    void aWhyIsNeverSentWithoutTheCard() {
        // Not reachable today (only battlefield moves carry a why), but the
        // rule holds: a reason never travels without the card it is about.
        List<Moves.Move> moves = List.of(new Moves.Move(3, "library", 2, "other", 2, false, "destroyed"));
        assertFalse(only(Moves.forViewer(moves, 1)).has("why"));
    }

    @Test
    void zoneNames() {
        assertEquals("nowhere", Moves.zoneName(null));
        assertEquals("graveyard", Moves.zoneName(forge.game.zone.ZoneType.Graveyard));
        assertEquals("other", Moves.zoneName(forge.game.zone.ZoneType.Sideboard));
    }
}
