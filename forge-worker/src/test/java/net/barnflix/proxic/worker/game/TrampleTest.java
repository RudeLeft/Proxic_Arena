package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * Spec 0107 -- trample: the pure parts. The game itself (the stop, "Change
 * split", the split made for the player, the plan that no longer fits) is
 * the Lab's, `check-combat-choices.py` (trample-auto, trample-kept,
 * trample-two-blockers, trample-elf-dies, trample-elf-plan, trample-deathtouch).
 */
class TrampleTest {

    private static final String ALICE = "Alice";
    private static final String BOB = "Bob";

    @Test
    void aKeptSplitIsToldToTheDefenderOnlyNeverTheAttacker() {
        // F-0107-B: Bob (attacking) kept all of it on Alice's Bears.
        assertTrue(ActionReports.tells(ActionReports.Kind.TRAMPLE_KEPT, ALICE, BOB, ALICE, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.TRAMPLE_KEPT, BOB, BOB, ALICE, BOB));
    }

    @Test
    void theDefendersWords() {
        assertEquals("Bob put all five on your Grizzly Bears; none trampled over.",
                PlainWords.trampleKept("Bob", "your", List.of("Grizzly Bears"), List.of(5), 0, 5));
        assertEquals("Bob put three on your Grizzly Bears and two on your Llanowar Elves; none trampled over.",
                PlainWords.trampleKept("Bob", "your", List.of("Grizzly Bears", "Llanowar Elves"), List.of(3, 2),
                        0, 5));
        assertEquals("Bob put four on your Grizzly Bears; one trampled over.",
                PlainWords.trampleKept("Bob", "your", List.of("Grizzly Bears"), List.of(4), 1, 5));
        // Small numbers are words; a big one stays digits.
        assertEquals("ten", PlainWords.number(10));
        assertEquals("12", PlainWords.number(12));
    }
}
