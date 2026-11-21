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
    fun `a stopped match sends its code, never the worker's own words (spec 0115, W3-022)`() {
        // The worker's detail (a class name) is in the server log and the
        // record; the page words the code (admin.ts REASON_WORDS).
        assertEquals("Stopped: WORKER_STOPPED", AdminMatches.endingOf("FAILED_RUNTIME", null, "WORKER_STOPPED"))
        assertEquals("Stopped: SERVER_RESTARTED", AdminMatches.endingOf("FAILED_RUNTIME", null, "SERVER_RESTARTED"))
        assertNull(AdminMatches.endingOf("FAILED_RUNTIME", null, null), "no code: the page says Stopped by a fault")
    }

    @Test
    fun `a finished match says who won in words, and a running one nothing`() {
        // Spec 0019 (11) — names, not seats; never the raw record.
        val names = AdminMatches.seatNames("1=RudeLeft|2=Pat")

        fun ended(summary: String) = AdminMatches.endingOf("ENDED", summary, null, names)
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
            AdminMatches.endingOf("FAILED_STARTUP", null, "DECK_UNAVAILABLE"),
        )
        assertNull(AdminMatches.endingOf("RUNNING", null, null))
    }

    @Test
    fun `W3-023 a winner with no name is Someone, never Seat 2`() {
        fun ended(summary: String) = AdminMatches.endingOf("ENDED", summary, null, emptyMap())
        assertEquals("Someone won on turn 9", ended("winner:seat 2 on turn 9"))
        assertEquals("Someone won on turn 4 · Someone conceded", ended("winner:seat 1 on turn 4 (seat 2 conceded)"))
    }
}
