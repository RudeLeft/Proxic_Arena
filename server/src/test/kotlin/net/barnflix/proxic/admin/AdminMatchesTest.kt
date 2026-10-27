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
    fun `a finished match says who won in words, and a running one nothing`() {
        // Spec 0019 (11) — names, not seats; never the raw record.
        val names = AdminMatches.seatNames("1=RudeLeft|2=Pat")

        fun ended(summary: String) = AdminMatches.endingOf("ENDED", summary, null, null, names)
        assertEquals("RudeLeft won on turn 19", ended("winner:seat 1 on turn 19"))
        assertEquals("RudeLeft won on turn 4 · Pat conceded", ended("winner:seat 1 on turn 4 (seat 2 conceded)"))
        assertEquals(
            "Pat won on turn 9 · Laboratory Maniac",
            ended("winner:seat 2 on turn 9 (has won due to effect of 'Laboratory Maniac')"),
        )
        assertEquals("Draw on turn 17", ended("draw on turn 17"))
        assertNull(ended("seat 2 won"), "a record it cannot read: the page says Finished alone")
        assertEquals(
            "Did not start: DECK_UNAVAILABLE",
            AdminMatches.endingOf("FAILED_STARTUP", null, "DECK_UNAVAILABLE", null),
        )
        assertNull(AdminMatches.endingOf("RUNNING", null, null, null))
    }
}
