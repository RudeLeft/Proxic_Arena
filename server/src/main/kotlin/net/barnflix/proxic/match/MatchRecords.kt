package net.barnflix.proxic.match

import net.barnflix.proxic.deck.DeckEntry
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// What a match runtime writes down — PHASE_06 §6.17, §6.18, §6.33.
//
// Split from MatchRuntime when detekt found that class past its
// function limit. The seam is the usual one: MatchRuntime holds the
// POLICY of starting and stopping matches, and this holds the SQL,
// so a lifecycle rule can be read without stepping over a prepared
// statement.

internal class MatchRecords(private val dataSource: DataSource) {
    /** §6.17 — Forge reached the running milestone. */
    fun recordRunning(
        matchId: UUID,
        at: Instant,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE match SET status = 'RUNNING', started_at = ? WHERE match_id = ?",
            ).use {
                it.setTimestamp(1, java.sql.Timestamp.from(at))
                it.setObject(2, matchId)
                it.executeUpdate()
            }
        }
    }

    /** §6.15 — it did not start, and the reason is kept. */
    fun recordFailure(
        matchId: UUID,
        code: String,
        at: Instant,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE match SET status = 'FAILED_STARTUP', failure_code = ?, ended_at = ? " +
                    "WHERE match_id = ?",
            ).use {
                it.setString(1, code)
                it.setTimestamp(2, java.sql.Timestamp.from(at))
                it.setObject(3, matchId)
                it.executeUpdate()
            }
        }
    }

    fun recordStatus(
        matchId: UUID,
        status: MatchStatus,
        at: Instant?,
    ) {
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE match SET status = ?, ended_at = ? WHERE match_id = ?",
            ).use {
                it.setString(1, status.name)
                it.setTimestamp(2, at?.let { moment -> java.sql.Timestamp.from(moment) })
                it.setObject(3, matchId)
                it.executeUpdate()
            }
        }
    }

    /**
     * Each seat's deck, as card entries.
     *
     * Null when ANY seat's deck cannot be read, rather than a
     * partial list: starting a game with one player's deck missing
     * is worse than not starting. §6.12 already refused this at
     * launch, so reaching here means something changed in between.
     */
    fun seatsFor(match: Match): List<WorkerSeat>? =
        dataSource.connection.use { connection ->
            match.participants.map { participant ->
                val deckId = participant.deckId ?: return@use null
                val cards = entriesOf(connection, deckId)
                if (cards.isEmpty()) return@use null
                WorkerSeat(participant.displayName, cards)
            }
        }

    /**
     * §6.33 — the PRINTING travels, not just the name.
     *
     * Phase 2 stored what Forge actually resolved alongside what
     * the package asked for. Sending the resolved values means the
     * match is played with the printing import agreed on, rather
     * than re-deriving it and risking a different answer.
     */
    private fun entriesOf(
        connection: Connection,
        deckId: UUID,
    ): List<DeckEntry> =
        connection.prepareStatement(
            """
            SELECT quantity, card_name, resolved_set, resolved_number,
                   source_text, line_number
              FROM deck_entry
             WHERE deck_id = ?
             ORDER BY line_number
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, deckId)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            DeckEntry(
                                quantity = rows.getInt(1),
                                name = rows.getString(2),
                                setCode = rows.getString(3),
                                collectorNumber = rows.getString(4),
                                sourceText = rows.getString(5),
                                lineNumber = rows.getInt(6),
                            ),
                        )
                    }
                }
            }
        }
}
