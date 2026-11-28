package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import forge.game.phase.PhaseType;
import org.junit.jupiter.api.Test;

/**
 * Spec 0124 (A4, owner 2026-11-27, Q1 "Every step") -- "Nothing to play" is
 * re-checked at every priority point of the seat's own turn: it goes the
 * moment there is something to play (asked, or offered outside a stop) and
 * comes back later that turn with the reason as it is then. The rule as
 * plain state (PriorityStops#recheck, #asked, #passingFor); driven against
 * Forge by the Mechanics Lab (check-thrown-away.py "drew").
 */
class PassingEveryStepTest {

    private static final int ALICE = 1;
    private static final int TURN = 7;

    private static String why(PriorityStops stops, int turn) {
        com.google.gson.JsonObject passing = stops.passingFor(ALICE, turn, true);
        return passing == null ? null : passing.get("why").getAsString();
    }

    @Test
    void setAtMain1ThenGoneWhenAskedThenBackWithAFreshReason() {
        PriorityStops stops = new PriorityStops();
        // Main 1, nothing to play: passing, and the boards are sent.
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true,
                () -> "Three lands; no land in hand"));
        assertEquals("Three lands; no land in hand", why(stops, TURN));
        // The same again at the next step: nothing new to send.
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.COMBAT_BEGIN, true, true,
                () -> "Three lands; no land in hand"));
        // Scroll Thief drew an Island; at Main 2 Alice is asked: gone.
        assertTrue(stops.asked(ALICE));
        assertNull(stops.passingFor(ALICE, TURN, true));
        assertFalse(stops.asked(ALICE), "already gone: nothing changed");
        // She played it; nothing else: back, with the reason as it is now.
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.MAIN2, true, true,
                () -> "Four lands; a land already played this turn"));
        assertEquals("Four lands; a land already played this turn", why(stops, TURN));
    }

    @Test
    void somethingToPlayOutsideAStopTakesItAwayToo() {
        // An instant drawn at combat damage (not a stop, so not asked): gone.
        PriorityStops stops = new PriorityStops();
        stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true, () -> "Two lands; no land in hand");
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.COMBAT_DAMAGE, true, false, () -> {
            throw new AssertionError("no reason is read when there is something to play");
        }));
        assertNull(stops.passingFor(ALICE, TURN, true));
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.END_OF_TURN, true, false, () -> "x"));
    }

    @Test
    void aChangedReasonIsSentEvenWithoutAQuestion() {
        // Stone Rain on one of her lands, resolved: the reason is re-read.
        PriorityStops stops = new PriorityStops();
        stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true, () -> "Three lands; no land in hand");
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.COMBAT_BEGIN, true, true,
                () -> "Two lands; no land in hand"));
        assertEquals("Two lands; no land in hand", why(stops, TURN));
    }

    @Test
    void comesOnLaterInTheTurnWhenMain1HadSomething() {
        // Alice used everything at Main 1 and passed on: from combat, passing.
        PriorityStops stops = new PriorityStops();
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, false, () -> "x"),
                "never on: nothing to send");
        assertNull(stops.passingFor(ALICE, TURN, true));
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.COMBAT_BEGIN, true, true,
                () -> "Four lands; a land already played this turn"));
        assertNotNull(stops.passingFor(ALICE, TURN, true));
    }

    @Test
    void neverWithAFullStackBeforeMain1OrOnTheOtherTurn() {
        PriorityStops stops = new PriorityStops();
        // Bob's Bolt on the stack: left as it is (the page shows "Bob's move").
        stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true, () -> "Two lands; no land in hand");
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.COMBAT_BEGIN, false, false, () -> "x"));
        assertEquals("Two lands; no land in hand", why(stops, TURN), "kept while the stack is full");
        // Upkeep and draw: the turn's draw is still to come.
        PriorityStops fresh = new PriorityStops();
        assertFalse(fresh.recheck(ALICE, TURN, true, PhaseType.UPKEEP, true, true, () -> "x"));
        assertFalse(fresh.recheck(ALICE, TURN, true, PhaseType.DRAW, true, true, () -> "x"));
        // The other player's turn: never.
        assertFalse(fresh.recheck(ALICE, TURN, false, PhaseType.MAIN1, true, true, () -> "x"));
        assertNull(fresh.passingFor(ALICE, TURN, true));
    }

    // --- owner answer 2026-11-28, "Ordinary button" (Option B) ---------------

    @Test
    void passedUpSomethingPlayableThenNoPassingAtTheEndStep() {
        // Six Islands, Air Elemental in hand: asked at Main 2, End turn pressed.
        PriorityStops stops = new PriorityStops();
        stops.declined(ALICE, TURN, true, true);
        // The End step: nothing castable (a creature), yet no "Passing".
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.END_OF_TURN, true, true,
                () -> "Six lands; no land in hand"), "nothing to send: it was never on");
        assertNull(stops.passingFor(ALICE, TURN, true));
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.CLEANUP, true, true, () -> "x"));
        assertNull(stops.passingFor(ALICE, TURN, true));
    }

    @Test
    void passedUpAfterPassingWasOnTakesItAway() {
        // On at Main 1; later asked and passed with something playable: gone, and stays gone.
        PriorityStops stops = new PriorityStops();
        stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true, () -> "Two lands; no land in hand");
        stops.declined(ALICE, TURN, true, true);
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.END_OF_TURN, true, true, () -> "x"));
        assertNull(stops.passingFor(ALICE, TURN, true));
    }

    @Test
    void playingWhatWasOfferedIsNotDecliningSoPassingComesBack() {
        // Q1's case: the Thief drew an Island, asked at Main 2, she PLAYED it.
        PriorityStops stops = new PriorityStops();
        stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true, () -> "Three lands; no land in hand");
        stops.asked(ALICE);
        // A pass with nothing playable on offer, or on Bob's turn, declines nothing either.
        stops.declined(ALICE, TURN, true, false);
        stops.declined(ALICE, TURN - 1, false, true);
        assertTrue(stops.recheck(ALICE, TURN, true, PhaseType.MAIN2, true, true,
                () -> "Four lands; no land in hand"));
        assertEquals("Four lands; no land in hand", why(stops, TURN));
    }

    @Test
    void declinedResetsAtTheNextTurn() {
        PriorityStops stops = new PriorityStops();
        stops.declined(ALICE, TURN, true, true);
        assertFalse(stops.recheck(ALICE, TURN, true, PhaseType.END_OF_TURN, true, true, () -> "x"));
        // Her next turn: nothing to play, and "Passing" is back.
        assertTrue(stops.recheck(ALICE, TURN + 2, true, PhaseType.MAIN1, true, true,
                () -> "Six lands; no land in hand"));
        assertEquals("Six lands; no land in hand", why(stops, TURN + 2));
        // Bob passing up his own turn's plays never touches Alice's.
        stops.declined(2, TURN + 2, true, true);
        assertNotNull(stops.passingFor(ALICE, TURN + 2, true));
    }

    @Test
    void goneAtTheTurnLineAndNeverOnAnotherSeatsBoard() {
        PriorityStops stops = new PriorityStops();
        stops.recheck(ALICE, TURN, true, PhaseType.MAIN1, true, true, () -> "Two lands; no land in hand");
        assertNull(stops.passingFor(ALICE, TURN + 1, false), "the next turn is Bob's");
        assertNull(stops.passingFor(ALICE, TURN, false), "not the active player");
        assertNull(stops.passingFor(2, TURN, true), "Bob's own board never carries Alice's");
    }
}
