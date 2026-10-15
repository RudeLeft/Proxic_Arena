package net.barnflix.proxic

import org.slf4j.MDC
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Structured log fields — PHASE_01 §1.41.
 *
 * The bug these guard against does not crash anything: it attributes
 * one request's or player's log lines to another, which is worse
 * than a crash because it is believed.
 */
class LogContextTest {
    @AfterTest
    fun clear() = MDC.clear()

    @Test
    fun `every field named by 1_41 is in the log pattern`() {
        val pattern =
            javaClass.classLoader
                .getResourceAsStream("logback.xml")!!
                .bufferedReader().readText()

        for (field in LogContext.ALL) {
            assertTrue(
                pattern.contains("%X{$field"),
                "logback.xml does not render $field; a field added after the code " +
                    "that should set it ends up populated on some paths only",
            )
        }
    }

    @Test
    fun `a field does not leak past its block`() {
        LogContext.withFields(LogContext.MATCH_ID to "match-1") {
            assertEquals("match-1", MDC.get(LogContext.MATCH_ID))
        }
        // Thread-local state that outlives its scope attaches itself
        // to whatever runs next on this thread.
        assertNull(MDC.get(LogContext.MATCH_ID))
    }

    @Test
    fun `nesting restores the outer value rather than clearing it`() {
        LogContext.withFields(LogContext.CONNECTION_ID to "conn-1") {
            LogContext.withFields(LogContext.MATCH_ID to "match-1") {
                assertEquals("conn-1", MDC.get(LogContext.CONNECTION_ID))
                assertEquals("match-1", MDC.get(LogContext.MATCH_ID))
            }
            // A match ending must not take the connection context
            // with it -- the connection is still live and still
            // logging.
            assertEquals("conn-1", MDC.get(LogContext.CONNECTION_ID))
            assertNull(MDC.get(LogContext.MATCH_ID))
        }
        assertNull(MDC.get(LogContext.CONNECTION_ID))
    }

    @Test
    fun `an exception still restores the previous state`() {
        LogContext.withFields(LogContext.PLAYER_ID to "player-1") {
            runCatching {
                LogContext.withFields(LogContext.PLAYER_ID to "player-2") {
                    throw IllegalStateException("boom")
                }
            }
            // The failure path is exactly where a leak would be
            // least noticed and most misleading.
            assertEquals("player-1", MDC.get(LogContext.PLAYER_ID))
        }
    }
}
