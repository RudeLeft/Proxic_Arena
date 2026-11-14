package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Spec 0085 -- gained keywords and the cards a permanent holds, as sent. */
class MarksTest {

    @Test
    void onlyWhatTheFaceDoesNotPrintIsGained() {
        // Run Amok on Grizzly Bears: trample is gained.
        assertEquals(List.of("Trample"), Marks.gainedTitles(List.of("Trample"), Set.of()));
        // Serra Angel given flying again: nothing new.
        assertEquals(List.of("Vigilance"),
                Marks.gainedTitles(List.of("Flying", "Vigilance"), Set.of("Flying")));
        // Twice from two sources: once.
        assertEquals(List.of("Hexproof"),
                Marks.gainedTitles(List.of("Hexproof", "Hexproof", "Flying"), Set.of("Flying")));
        assertEquals(List.of(), Marks.gainedTitles(List.of("Flying"), Set.of("Flying")));
    }

    @Test
    void banishingLightAndFiendHunterHoldTheirCards() {
        Set<Integer> table = Set.of(10, 11, 12, 13);
        Map<Integer, List<Integer>> held = Marks.holdersOf(List.of(
                // Banishing Light (10): exiled until it leaves.
                new Marks.Link(50, 10, true, false, true),
                // Fiend Hunter (11): its own ability moved it from the battlefield.
                new Marks.Link(51, 11, false, false, true),
                // Chrome Mox (12): imprinted.
                new Marks.Link(52, 12, false, true, true),
                // Bojuka Bog (13): a graveyard eaten, not held.
                new Marks.Link(53, 13, false, false, false),
                // A holder gone from the table holds nothing on it.
                new Marks.Link(54, 99, true, false, true)), table);
        assertEquals(List.of(50), held.get(10));
        assertEquals(List.of(51), held.get(11));
        assertEquals(List.of(52), held.get(12));
        assertFalse(held.containsKey(13), "a graveyard exiled with a land is not held");
        assertFalse(held.containsKey(99));
    }

    @Test
    void aHolderKeepsItsCardsInExileOrder() {
        Map<Integer, List<Integer>> held = Marks.holdersOf(List.of(
                new Marks.Link(61, 20, false, false, true),
                new Marks.Link(60, 20, false, false, true)), Set.of(20));
        assertEquals(List.of(61, 60), held.get(20));
        assertTrue(Marks.holdersOf(List.of(), Set.of(20)).isEmpty());
    }
}
