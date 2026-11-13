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
    void aCreatureKilledByShrinkingCarriesItsLastSize() {
        // Spec 0078, item 4: Grasp of Darkness on a 4/4 -- it last stood at
        // 0/0 on the table; every seat sees that, since the board showed it.
        List<Moves.Move> moves = List.of(
                new Moves.Move(21, "battlefield", 2, "graveyard", 2, false, "died").withLast(0, 0));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonObject move = only(Moves.forViewer(moves, viewer));
            assertEquals("card:21", move.get("card").getAsString());
            assertEquals(0, move.getAsJsonObject("last").get("power").getAsInt());
            assertEquals(0, move.getAsJsonObject("last").get("toughness").getAsInt());
        }
        // The size survives the other withs (said, where, into).
        Moves.Move said = new Moves.Move(21, "battlefield", 2, "graveyard", 2, false, null).withLast(3, -1)
                .withSaid("died", null, "Rumbling Baloth");
        assertEquals(-1, only(Moves.forViewer(List.of(said), 1)).getAsJsonObject("last").get("toughness")
                .getAsInt());
    }

    @Test
    void aLastSizeNeverTravelsWithoutItsCardOrOffTheTable() {
        // A size never travels without the card it is about (a move off the
        // table is always named today; the rule holds anyway).
        List<Moves.Move> hidden = List.of(
                new Moves.Move(8, "library", 2, "exile", 2, true, null).withLast(5, 5));
        JsonObject unseen = only(Moves.forViewer(hidden, 1));
        assertFalse(unseen.has("card"));
        assertFalse(unseen.has("last"), "a size must not travel with a card the viewer may not name");
        // A creature tucked into a library from the table: named (it was on
        // the table), so its size goes too -- both numbers were on the board.
        assertTrue(only(Moves.forViewer(List.of(
                new Moves.Move(8, "battlefield", 2, "library", 2, false, null).withLast(5, 5)), 1)).has("last"));
        // Only a move off the battlefield says one.
        List<Moves.Move> fromHand = List.of(
                new Moves.Move(9, "hand", 1, "graveyard", 1, false, "discarded").withLast(2, 2));
        assertFalse(only(Moves.forViewer(fromHand, 1)).has("last"));
        // And none when the worker had none (not a creature).
        assertFalse(only(Moves.forViewer(List.of(
                new Moves.Move(10, "battlefield", 1, "graveyard", 1, false, "destroyed")), 1)).has("last"));
    }

    @Test
    void aLibrarysTopAndBottomAsForgeListsThem() {
        // Phase 10 A-14: Forge's library list is top first.
        assertEquals("top", Moves.libraryPlace(0, 40));
        assertEquals("top", Moves.libraryPlace(0, 1));
        assertEquals("bottom", Moves.libraryPlace(39, 40));
        assertEquals(null, Moves.libraryPlace(2, 40), "third from the top is not said as top or bottom");
        assertEquals(null, Moves.libraryPlace(-1, 40));
    }

    @Test
    void whereInTheLibraryIsSentToEveryoneAndAShuffleReplacesIt() {
        java.util.List<Moves.Move> moves = new java.util.ArrayList<>(List.of(
                new Moves.Move(7, "battlefield", 2, "library", 2, false, null).withWhere("top"),
                new Moves.Move(8, "hand", 1, "library", 1, false, null).withWhere("bottom"),
                new Moves.Move(9, "battlefield", 2, "hand", 2, false, null)));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonArray seen = Moves.forViewer(moves, viewer);
            assertEquals("top", seen.get(0).getAsJsonObject().get("where").getAsString());
            // From seat 1's hand: seat 2 is not told the card, but is told it
            // went to the bottom, as anyone at the table would see.
            assertEquals("bottom", seen.get(1).getAsJsonObject().get("where").getAsString());
            assertEquals(viewer != null && viewer == 1, seen.get(1).getAsJsonObject().has("card"));
            assertFalse(seen.get(2).getAsJsonObject().has("where"), "only a move into a library says where");
        }
        // Seat 2's library shuffled: its new card is "shuffled", seat 1's untouched.
        Moves.shuffled(moves, 2);
        JsonArray after = Moves.forViewer(moves, 1);
        assertEquals("shuffled", after.get(0).getAsJsonObject().get("where").getAsString());
        assertEquals("bottom", after.get(1).getAsJsonObject().get("where").getAsString());
        // A where never sneaks onto a move that is not into a library.
        assertFalse(Moves.forViewer(List.of(
                new Moves.Move(3, "library", 2, "hand", 2, false, null).withWhere("top")), 1)
                .get(0).getAsJsonObject().has("where"));
    }

    @Test
    void zoneNames() {
        assertEquals("nowhere", Moves.zoneName(null));
        assertEquals("graveyard", Moves.zoneName(forge.game.zone.ZoneType.Graveyard));
        assertEquals("other", Moves.zoneName(forge.game.zone.ZoneType.Sideboard));
    }

    // --- spec 0079: copies and fizzles ----------------------------------------------------

    @Test
    void aFizzledSpellSaysSoToBothSeatsWithNoTag() {
        // F-0079-D: Alice's Bolt fizzled: off the stack to her graveyard, "fizzled".
        List<Moves.Move> moves = List.of(new Moves.Move(30, "stack", 1, "graveyard", 1, false, null)
                .withSaid("fizzled", null, "Lightning Bolt"));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonObject move = only(Moves.forViewer(moves, viewer));
            assertEquals("card:30", move.get("card").getAsString());
            assertEquals("fizzled", move.get("why").getAsString());
            assertFalse(move.has("said"), "the report window explains it: no tag rides on the card");
        }
    }

    @Test
    void aCopyEndingOnTheStackGoesNowhere() {
        // F-0079-B: Fork's copy resolved -- it ceases to exist (no graveyard).
        List<Moves.Move> moves = List.of(new Moves.Move(81, "stack", 1, "nowhere", null, false, null),
                new Moves.Move(82, "stack", 1, "nowhere", null, false, "fizzled"));
        for (Integer viewer : new Integer[] {1, 2, null}) {
            JsonArray told = Moves.forViewer(moves, viewer);
            assertEquals("card:81", told.get(0).getAsJsonObject().get("card").getAsString());
            assertEquals("nowhere", told.get(0).getAsJsonObject().getAsJsonObject("to").get("zone").getAsString());
            assertFalse(told.get(0).getAsJsonObject().getAsJsonObject("to").has("seat"));
            assertEquals("fizzled", told.get(1).getAsJsonObject().get("why").getAsString());
        }
    }
}
