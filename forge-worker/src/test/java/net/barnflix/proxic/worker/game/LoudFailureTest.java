package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A reached stub must fail the MATCH — PHASE_06 §6.105, §6.106,
 * AGENTS STUB-002.
 *
 * Measured, not hypothetical. A creature deck played through the
 * worker reached {@code chooseCounterType} twice, threw twice,
 * printed no stack trace anywhere, and finished reporting
 * {@code WINNER} at turn 13. Forge's effect code caught the
 * exception, skipped the counter and played on — so a game decided
 * partly by a rule that never applied was reported as somebody's
 * win.
 *
 * Throwing is therefore not enough on its own. The adapter also
 * tells the host, and the host records it as the reason the match
 * failed, which `publishEnd` reads BEFORE it looks for a winner.
 */
class LoudFailureTest {

    /** The loud path announces itself before it throws. */
    @Test
    void aReachedStubIsAnnouncedBeforeItThrows() {
        List<String> told = new ArrayList<>();
        GeneratedControllerBase.onStubReached(told::add);
        try {
            assertThrows(
                    UnsupportedOperationException.class,
                    () -> GeneratedControllerBase.loud("chooseCounterType"));

            // The point of the test: the watcher heard about it even
            // though the exception is what Forge may discard.
            assertEquals(List.of("chooseCounterType"), told);
        } finally {
            GeneratedControllerBase.onStubReached(method -> { });
        }
    }

    /** And the registry keeps it, for the end-of-run evidence. */
    @Test
    void aReachedStubIsRecorded() {
        GeneratedControllerBase.REACHED_STUBS.remove("aMethodNoCardUses");
        assertThrows(
                UnsupportedOperationException.class,
                () -> GeneratedControllerBase.loud("aMethodNoCardUses"));
        assertEquals(
                1,
                GeneratedControllerBase.REACHED_STUBS.get("aMethodNoCardUses"),
                "§6.106 — the evidence has to survive the exception being swallowed");
        GeneratedControllerBase.REACHED_STUBS.remove("aMethodNoCardUses");
    }

    /**
     * The recorded reason names the Forge method — §6.106.
     *
     * Not the exception class. "UnsupportedOperationException" is
     * true, useless, and indistinguishable from any other crash;
     * the method name is the one fact that says what to build next.
     */
    @Test
    void theRecordedFailureNamesTheForgeMethod() {
        GameHost host = new GameHost();
        host.failUnsupported("chooseCounterType");

        Throwable recorded = host.failure();
        assertNotNull(recorded, "a reached stub must leave a reason behind");
        assertTrue(
                recorded.getMessage().contains("chooseCounterType"),
                "the reason must name the method, was: " + recorded.getMessage());
    }

    /**
     * The FIRST reason wins.
     *
     * The adapter records why before it throws, precisely so the
     * reason outlives the throw. A later exception out of the game
     * thread must not replace it — that would turn "Forge asked for
     * chooseCounterType" back into "something went wrong".
     */
    @Test
    void theFirstReasonSurvivesALaterOne() {
        GameHost host = new GameHost();
        host.failUnsupported("chooseCounterType");
        // What the game thread catches afterwards. Forge's own
        // exception out of a half-resolved effect arrives here, and
        // it is the less useful of the two.
        host.recordCrash(new IllegalStateException("something went wrong"));

        assertTrue(
                host.failure().getMessage().contains("chooseCounterType"),
                "the first reason must win, was: " + host.failure().getMessage());
    }

}
