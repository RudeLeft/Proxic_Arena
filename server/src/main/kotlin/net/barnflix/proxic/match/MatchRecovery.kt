package net.barnflix.proxic.match

import org.slf4j.Logger
import javax.sql.DataSource

// A restart ends every match it finds — PHASE_06 §6.154, §6.157.
//
// §6.157 demands one of two things be proven honestly: either the
// worker survives a Ktor restart and the server safely reattaches,
// or it cannot and the match becomes FAILED_RUNTIME. "Do not claim
// reattachment without evidence."
//
// THE EVIDENCE HERE IS THE ARCHITECTURE. A worker is a CHILD
// PROCESS of this server (MatchWorker spawns it with
// ProcessBuilder and holds its pipes). When the server exits the
// child goes with it, and the handles that made it reachable -- a
// stdin writer and a reader thread -- lived only in memory. There
// is nothing left to reattach to, so the second branch applies.
//
// WHY THIS IS NOT MERELY TIDY. Found in production: after a
// restart, `match` rows still said RUNNING. /api/matches/current
// handed those back, both browsers opened a match socket for a
// game whose Forge died with the previous container, and sat on
// "Waiting for the game" for ever -- a decision that was never
// going to arrive, for a match nobody could leave, in a room
// still locked IN_MATCH. The players had no way to tell that from
// a slow opponent.

class MatchRecovery(
    private val dataSource: DataSource,
    private val log: Logger,
) {
    fun recover() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                val matches = failRunningMatches(connection)
                // Readiness BEFORE the release, because the only
                // thing identifying the affected rooms is that
                // they are still IN_MATCH, and the release is
                // what stops them being.
                val ready = clearReadiness(connection)
                val rooms = releaseRooms(connection)
                connection.commit()
                if (matches > 0) {
                    log.warn(
                        "match recovery: $matches match(es) could not survive the restart, " +
                            "$rooms room(s) reopened, $ready seat(s) un-readied",
                    )
                }
            } catch (e: Exception) {
                connection.rollback()
                // Loud, and NOT fatal. A server that refuses to
                // start because of stale rows is worse than one
                // that starts and says what it could not clean:
                // the second can still be used to look.
                log.error("match recovery failed; stale matches may remain", e)
            } finally {
                connection.autoCommit = true
            }
        }
    }

    /**
     * §6.154 — FAILED_RUNTIME, and NO RESULT.
     *
     * Not ENDED, because no game finished; not a win for anybody,
     * because §6.149 gives Forge sole authority over who won and
     * Forge is gone. `result_summary` is left null on purpose.
     *
     * LAUNCHING counts too: a match whose worker was still
     * starting when the server stopped is in exactly the same
     * position, and is the easier one to forget.
     */
    private fun failRunningMatches(connection: java.sql.Connection): Int =
        connection.prepareStatement(
            "UPDATE match SET status = 'FAILED_RUNTIME', failure_code = 'SERVER_RESTARTED', " +
                "ended_at = now() WHERE status IN ('LAUNCHING', 'RUNNING')",
        ).use { it.executeUpdate() }

    /**
     * The rooms those matches locked, given back.
     *
     * EVERY room still IN_MATCH, and that is exact rather than
     * broad: a room is only ever IN_MATCH for a match that was
     * LAUNCHING or RUNNING, and the statement above has just
     * ended every one of those. So by this point an IN_MATCH room
     * is a stale room, with no exceptions to reason about.
     *
     * (The first draft selected rooms by joining to matches with
     * this restart's failure code. That looks more careful and is
     * not: the code is also on every match failed by every
     * PREVIOUS restart, so the subquery said something broader
     * than it appeared to.)
     *
     * D4's shape, the same as a match ending normally: OPEN, with
     * everyone still seated and their decks still chosen.
     */
    private fun releaseRooms(connection: java.sql.Connection): Int =
        connection.prepareStatement(
            "UPDATE room SET status = 'OPEN', revision = revision + 1 WHERE status = 'IN_MATCH'",
        ).use { it.executeUpdate() }

    /**
     * And nobody is left ticked.
     *
     * The setup those seats were ready for was consumed by the
     * launch, so a seat still claiming READY is claiming it for
     * something that no longer exists. Runs while the rooms are
     * still IN_MATCH, which is what identifies them.
     */
    private fun clearReadiness(connection: java.sql.Connection): Int =
        connection.prepareStatement(
            "UPDATE room_member SET ready = FALSE WHERE ready = TRUE AND room_id IN (" +
                "SELECT room_id FROM room WHERE status = 'IN_MATCH')",
        ).use { it.executeUpdate() }
}
