package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Spec 0074, Amendment 1 (owner 2026-11-12) -- who is shown the report
 * window for a mill, a counter, or cards out of a graveyard or exile: both
 * players, unless the reader did it to themselves alone. The other kinds keep
 * Amendment 13 item 7: not the player who made the choices.
 */
class ActionReportsTest {

    private static final String ALICE = "Alice";
    private static final String BOB = "Bob";

    @Test
    void yourMillOnBobIsShownToYouAndToBob() {
        // Glimpse the Unthinkable: Alice acts, Bob's library.
        assertTrue(ActionReports.tells(ActionReports.Kind.MILL, ALICE, ALICE, BOB, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.MILL, BOB, ALICE, BOB, ALICE));
    }

    @Test
    void millingYourselfIsShownOnlyToTheOtherPlayer() {
        assertFalse(ActionReports.tells(ActionReports.Kind.MILL, ALICE, ALICE, ALICE, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.MILL, BOB, ALICE, ALICE, ALICE));
    }

    @Test
    void bobsCounterspellOnYourSpellIsShownToBoth() {
        assertTrue(ActionReports.tells(ActionReports.Kind.COUNTER, ALICE, BOB, ALICE, BOB));
        assertTrue(ActionReports.tells(ActionReports.Kind.COUNTER, BOB, BOB, ALICE, BOB));
        // Countering your own spell: the other player only.
        assertFalse(ActionReports.tells(ActionReports.Kind.COUNTER, BOB, BOB, BOB, BOB));
    }

    @Test
    void bobsRaiseDeadIsShownToYouNotToBob() {
        assertTrue(ActionReports.tells(ActionReports.Kind.RETURN, ALICE, BOB, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.RETURN, BOB, BOB, BOB, BOB));
        // Bojuka Bog: Alice exiles Bob's graveyard -- both.
        assertTrue(ActionReports.tells(ActionReports.Kind.RETURN, ALICE, ALICE, BOB, ALICE));
    }

    @Test
    void theOtherKindsStillSpareTheOneWhoChose() {
        // Mind Rot on Bob: Bob chose his discards; Alice is shown them.
        assertTrue(ActionReports.tells(ActionReports.Kind.DISCARD, ALICE, ALICE, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.DISCARD, BOB, ALICE, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.SEARCH, ALICE, ALICE, ALICE, ALICE));
    }

    // --- spec 0075: the remaining card actions -------------------------------------

    @Test
    void bobsUnsummonOnYourCreatureIsShownToYouAlone() {
        // F-0075-A: Bob acts, the Bears were yours (the subject).
        assertTrue(ActionReports.tells(ActionReports.Kind.BOUNCE, ALICE, BOB, ALICE, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, BOB, BOB, ALICE, BOB));
        // Your Unsummon on his: his window only.
        assertTrue(ActionReports.tells(ActionReports.Kind.BOUNCE, BOB, ALICE, BOB, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, ALICE, ALICE, BOB, ALICE));
        // Bouncing your own creature: nobody.
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, ALICE, ALICE, ALICE, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, BOB, ALICE, ALICE, ALICE));
    }

    @Test
    void cyclingIsShownOnlyToTheOtherPlayer() {
        // F-0075-B: Bob cycles -- your window; you cycle -- none.
        assertTrue(ActionReports.tells(ActionReports.Kind.CYCLE, ALICE, BOB, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.CYCLE, BOB, BOB, BOB, BOB));
    }

    @Test
    void choicesAndFlipsAreTheOtherPlayers() {
        // F-0075-C: a choice report is told by its values: Bob's colour to you,
        // your own colour or flip to nobody.
        assertFalse(ActionReports.tells(ActionReports.Kind.CHOICE, ALICE, BOB, BOB, BOB));
        assertTrue(ActionReports.showsValue(ALICE, BOB, "color"));
        assertFalse(ActionReports.showsValue(BOB, BOB, "color"));
        assertFalse(ActionReports.showsValue(BOB, BOB, null));
        // Owner 2026-11-12: a flip is luck -- the flipper sees their own too.
        assertTrue(ActionReports.showsValue(BOB, BOB, "coin"));
        assertTrue(ActionReports.showsValue(ALICE, BOB, "coin"));
        // The empty look is made for its one reader (ActionReports#emptyLook), never by kind.
        assertFalse(ActionReports.tells(ActionReports.Kind.EMPTY_LOOK, ALICE, ALICE, BOB, ALICE));
    }
}
