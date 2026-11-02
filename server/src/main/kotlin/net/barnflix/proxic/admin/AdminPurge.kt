package net.barnflix.proxic.admin

import kotlinx.serialization.Serializable
import net.barnflix.proxic.match.GameRecords
import java.io.File
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Spec 0048 (owner 2026-11-01) — the Admin purge: one player's finished
// games, finished games before a date, or a fresh start for production
// that keeps the accounts and clears everything else the owner listed
// (games and their recordings, decks and their pictures, rooms, reports,
// sign-in history, belt resets; chat is never stored).
//
// The Hall, ratings and Belt are worked out from the games that remain, so
// deleting games is all a player or date purge needs. A game being played
// is never touched; a fresh start is refused while one is. Rows go in one
// transaction; files only after it commits, so a failure leaves nothing
// half done in the database.

/** What a purge is of. */
sealed interface PurgeScope {
    data class Player(val userId: UUID) : PurgeScope

    data class Before(val at: Instant) : PurgeScope

    data object Everything : PurgeScope
}

/** What a purge would delete — shown before, and returned after. */
@Serializable
data class PurgeCounts(
    val games: Int,
    /** A player purge: games against each opponent, by name. */
    val against: Map<String, Int> = emptyMap(),
    val decks: Int = 0,
    val rooms: Int = 0,
    val reports: Int = 0,
    val signIns: Int = 0,
    val accountsKept: Int = 0,
    /** Why it cannot be done now (a fresh start while a game is played); null when it can. */
    val refused: String? = null,
)

class AdminPurge(
    private val dataSource: DataSource,
    private val records: GameRecords,
    dataRoot: String,
    /** Whether a match is being played on this server now. */
    private val isLive: (UUID) -> Boolean,
    private val runningCount: () -> Int,
) {
    private val root = File(dataRoot)

    fun preview(scope: PurgeScope): PurgeCounts =
        dataSource.connection.use { connection ->
            val games = matchesOf(connection, scope)
            when (scope) {
                is PurgeScope.Player -> PurgeCounts(games.size, against(connection, scope.userId, games))
                is PurgeScope.Before -> PurgeCounts(games.size)
                PurgeScope.Everything ->
                    PurgeCounts(
                        games = count(connection, "SELECT count(*) FROM match"),
                        decks = count(connection, "SELECT count(*) FROM imported_deck"),
                        rooms = count(connection, "SELECT count(*) FROM room"),
                        reports = count(connection, "SELECT count(*) FROM bug_report"),
                        signIns = count(connection, "SELECT count(*) FROM sign_in_event"),
                        accountsKept = count(connection, "SELECT count(*) FROM app_user"),
                        refused = refusedNow(connection),
                    )
            }
        }

    /**
     * Deletes what [preview] counted. Open rooms must already be closed for
     * a fresh start (the route closes them, so players are told); null when
     * it was refused.
     */
    fun purge(scope: PurgeScope): PurgeCounts? {
        val before = preview(scope)
        if (before.refused != null) return null
        val gone: List<UUID>
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                gone =
                    if (scope == PurgeScope.Everything) {
                        everything(connection)
                    } else {
                        deleteMatches(connection, matchesOf(connection, scope))
                    }
                connection.commit()
            } catch (e: java.sql.SQLException) {
                connection.rollback()
                throw e
            } finally {
                connection.autoCommit = true
            }
        }
        gone.forEach(::removeFilesOf)
        if (scope == PurgeScope.Everything) {
            listOf("art", "bug-reports", "match-logs", "match-records").forEach { folder ->
                File(root, folder).listFiles()?.forEach { it.deleteRecursively() }
            }
        }
        return before
    }

    /** The finished games of [scope] (never one being played). */
    private fun matchesOf(
        connection: Connection,
        scope: PurgeScope,
    ): List<UUID> {
        val sql =
            when (scope) {
                is PurgeScope.Player ->
                    "SELECT DISTINCT m.match_id FROM match m JOIN match_participant p ON p.match_id = m.match_id " +
                        "WHERE p.user_id = ? AND $FINISHED"
                is PurgeScope.Before -> "SELECT m.match_id FROM match m WHERE m.ended_at < ? AND $FINISHED"
                PurgeScope.Everything -> "SELECT m.match_id FROM match m WHERE $FINISHED"
            }
        return connection.prepareStatement(sql).use { statement ->
            when (scope) {
                is PurgeScope.Player -> statement.setObject(1, scope.userId)
                is PurgeScope.Before -> statement.setTimestamp(1, java.sql.Timestamp.from(scope.at))
                PurgeScope.Everything -> Unit
            }
            statement.executeQuery().use { rows ->
                buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
            }.filterNot(isLive)
        }
    }

    /** A player purge: the games by opponent, so the admin sees whose records change too. */
    private fun against(
        connection: Connection,
        userId: UUID,
        games: List<UUID>,
    ): Map<String, Int> {
        if (games.isEmpty()) return emptyMap()
        return connection.prepareStatement(
            """
            SELECT u.username, count(*) FROM match_participant p JOIN app_user u ON u.user_id = p.user_id
             WHERE p.match_id = ANY (?) AND p.user_id <> ? GROUP BY u.username ORDER BY count(*) DESC, u.username
            """.trimIndent(),
        ).use { statement ->
            statement.setArray(1, connection.createArrayOf("uuid", games.toTypedArray()))
            statement.setObject(2, userId)
            statement.executeQuery().use { rows ->
                buildMap { while (rows.next()) put(rows.getString(1), rows.getInt(2)) }
            }
        }
    }

    /** "A game is being played", or null: a fresh start waits for none to be. */
    private fun refusedNow(connection: Connection): String? {
        val live = count(connection, "SELECT count(*) FROM match WHERE status IN ('LAUNCHING', 'RUNNING')")
        return if (runningCount() > 0 || live > 0) "A game is being played: wait for it to end." else null
    }

    private fun deleteMatches(
        connection: Connection,
        ids: List<UUID>,
    ): List<UUID> {
        if (ids.isEmpty()) return ids
        connection.prepareStatement("DELETE FROM match WHERE match_id = ANY (?)").use { statement ->
            statement.setArray(1, connection.createArrayOf("uuid", ids.toTypedArray()))
            statement.executeUpdate()
        }
        return ids
    }

    /** The fresh start's rows, in the order the foreign keys allow. */
    private fun everything(connection: Connection): List<UUID> {
        val all =
            connection.prepareStatement("SELECT match_id FROM match").use { statement ->
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }
        connection.createStatement().use { statement ->
            for (sql in FRESH_START) statement.executeUpdate(sql)
        }
        return all
    }

    private fun removeFilesOf(matchId: UUID) {
        records.fileFor(matchId).delete()
        File(root, "match-logs/$matchId.log").delete()
    }

    private fun count(
        connection: Connection,
        sql: String,
    ): Int =
        connection.prepareStatement(sql).use { statement ->
            statement.executeQuery().use { rows -> if (rows.next()) rows.getInt(1) else 0 }
        }

    companion object {
        /** A game that is over, whatever its ending (never LAUNCHING or RUNNING). */
        private const val FINISHED = "m.status NOT IN ('LAUNCHING', 'RUNNING')"

        /** Games before rooms (RESTRICT), rooms before decks, decks before pictures. */
        private val FRESH_START =
            listOf(
                "DELETE FROM match",
                "DELETE FROM room",
                "DELETE FROM imported_deck",
                "DELETE FROM art_asset",
                "DELETE FROM bug_report",
                "DELETE FROM sign_in_event",
                "DELETE FROM belt_reset",
            )
    }
}

/** Spec 0048 — Reset the Belt: from now nobody holds it; the next game's winner takes it. */
class BeltReset(private val dataSource: DataSource) {
    fun reset(by: UUID): Instant =
        dataSource.connection.use { connection ->
            connection.prepareStatement("INSERT INTO belt_reset (reset_by) VALUES (?) RETURNING reset_at").use { s ->
                s.setObject(1, by)
                s.executeQuery().use { rows ->
                    rows.next()
                    rows.getTimestamp(1).toInstant()
                }
            }
        }
}
