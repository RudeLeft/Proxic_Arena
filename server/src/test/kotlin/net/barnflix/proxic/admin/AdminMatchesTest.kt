package net.barnflix.proxic.admin

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * How a match ended, for the Admin list — owner 2026-10-22. A game that
 * stopped at Eldrazi Monument's upkeep trigger was listed only as stopped;
 * finding why took downloading its record.
 */
class AdminMatchesTest {
    @Test
    fun `a stopped match says why, from the worker's own words`() {
        val why =
            "UnsupportedOperationException: Forge asked for choosePermanentsToSacrifice, which this " +
                "adapter does not implement -- turn 10, RudeLeft's UPKEEP, while resolving " +
                "Eldrazi Monument's trigger (RudeLeft)"
        assertEquals("Stopped: $why", AdminMatches.endingOf("FAILED_RUNTIME", null, "WORKER_STOPPED", why))
        // An older row, from before the reason was kept: the code at least.
        assertEquals(
            "Stopped: WORKER_STOPPED",
            AdminMatches.endingOf("FAILED_RUNTIME", null, "WORKER_STOPPED", null),
        )
    }

    @Test
    fun `a finished match gives Forge's result, and a running one nothing`() {
        assertEquals("seat 2 won", AdminMatches.endingOf("ENDED", "seat 2 won", null, null))
        assertEquals(
            "Did not start: DECK_UNAVAILABLE",
            AdminMatches.endingOf("FAILED_STARTUP", null, "DECK_UNAVAILABLE", null),
        )
        assertNull(AdminMatches.endingOf("RUNNING", null, null, null))
    }
}
