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
    void aMeldPartnerAndAMutatingCardSayWhatTheyMergedInto() {
        // Phase 10 A-10, as the Lab measured it: Midnight Scavengers (28)
        // exiled and Graf Rats (12) out and back as Chittering Host;
        // Gemrazer (24) from the stack into the merged zone over card 30.
        List<Moves.Move> moves = Moves.withInto(List.of(
                new Moves.Move(12, "battlefield", 2, "exile", 2, false, null),
                new Moves.Move(28, "battlefield", 2, "exile", 2, false, null),
                new Moves.Move(12, "exile", 2, "battlefield", 2, false, null),
                new Moves.Move(24, "stack", 1, "merged", 1, false, null)),
                java.util.Map.of(28, 12, 24, 30));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonArray seen = Moves.forViewer(moves, viewer);
            assertFalse(seen.get(0).getAsJsonObject().has("into"), "the host itself merged into nothing");
            assertEquals("card:12", seen.get(1).getAsJsonObject().get("into").getAsString());
            assertFalse(seen.get(2).getAsJsonObject().has("into"));
            assertEquals("card:30", seen.get(3).getAsJsonObject().get("into").getAsString());
        }
    }

    @Test
    void onlyAMoveIntoTheMergeIsMarked() {
        // The melded permanent leaving play later: its partner goes from
        // exile to the graveyard -- not a new merge.
        List<Moves.Move> later = Moves.withInto(
                List.of(new Moves.Move(28, "exile", 2, "graveyard", 2, false, null)),
                java.util.Map.of(28, 12));
        assertFalse(only(Moves.forViewer(later, 1)).has("into"));
        // And `into` never travels without its card.
        List<Moves.Move> hidden = List.of(new Moves.Move(5, "library", 2, "exile", 2, true, null, 12));
        JsonObject unseen = only(Moves.forViewer(hidden, 1));
        assertFalse(unseen.has("card"));
        assertFalse(unseen.has("into"));
    }

    @Test
    void zoneNames() {
        assertEquals("nowhere", Moves.zoneName(null));
        assertEquals("graveyard", Moves.zoneName(forge.game.zone.ZoneType.Graveyard));
        assertEquals("other", Moves.zoneName(forge.game.zone.ZoneType.Sideboard));
    }
}
