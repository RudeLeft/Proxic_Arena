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

    /**
     * A failed start gives the room back.
     *
     * OPEN with readiness cleared, which is owner decision D4's
     * shape: the players are still seated with their decks, and
     * can prepare again. The setup they used is CONSUMED and stays
     * that way -- it was claimed, and claiming is what stops a
     * second launch.
     */
    fun releaseRoom(roomId: UUID) {
        // ONE transaction. As two auto-committed statements there was
        // a moment with the room OPEN and its players still ready --
        // a state nothing else allows, and one a Prepare could have
        // acted on. CI's slower runner caught a test reading it.
        net.barnflix.proxic.room.MatchSetupStore(dataSource).inTransaction { connection ->
            val released =
                connection.prepareStatement(
                    "UPDATE room SET status = 'OPEN', revision = revision + 1 " +
                        "WHERE room_id = ? AND status = 'IN_MATCH'",
                ).use {
                    it.setObject(1, roomId)
                    it.executeUpdate()
                }
            // ONLY if this call is the one that unlocked it. The
            // readiness clear is unconditional SQL and would
            // otherwise un-ready a room that is merely prepared --
            // a release arriving late for a room that had already
            // moved on would quietly undo everybody's tick.
            if (released == 0) return@inTransaction
            connection.prepareStatement(
                "UPDATE room_member SET ready = FALSE WHERE room_id = ?",
            ).use {
                it.setObject(1, roomId)
                it.executeUpdate()
            }
        }
    }

    /**
     * §6.151, §6.149 — the game finished, and this is Forge's word.
     *
     * `result_summary` holds what FORGE reported and nothing Arena
     * concluded. A failure writes FAILED_RUNTIME with no summary
     * at all rather than a winner: §6.154 is explicit that a
     * crashed match must not record a fake one.
     */
    fun recordEnded(
        matchId: UUID,
        outcome: GameOutcome,
        at: Instant,
    ) {
        val failed = outcome.kind == GameOutcome.FAILED
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE match SET status = ?, result_summary = ?, failure_code = ?, " +
                    "ended_at = ? WHERE match_id = ? AND status = 'RUNNING'",
            ).use {
                it.setString(1, if (failed) "FAILED_RUNTIME" else "ENDED")
                it.setString(2, if (failed) null else summaryOf(outcome))
                it.setString(3, if (failed) "WORKER_STOPPED" else null)
                it.setTimestamp(4, java.sql.Timestamp.from(at))
                it.setObject(5, matchId)
                it.executeUpdate()
            }
        }
    }

    /**
     * Forge's result as one readable line.
     *
     * By SEAT, because a display name is not an identity: two
     * players may share one, and "Pat won" would then be a record
     * of nothing. An alternate win (P6-AP) keeps Forge's sentence
     * for it, so the record says WHICH rule ended the game.
     */
    private fun summaryOf(outcome: GameOutcome): String =
        when (outcome.kind) {
            GameOutcome.WINNER ->
                "winner:seat ${outcome.winningSeat} on turn ${outcome.turn}" +
                    (outcome.reason?.let { " ($it)" } ?: "")
            GameOutcome.DRAW -> "draw on turn ${outcome.turn}"
            else -> "no result on turn ${outcome.turn}"
        }

    /**
     * §6.162, TERMINATED — somebody ended this match deliberately.
     *
     * "Intentional operational termination that is not itself a
     * Forge game result", in §6.17's words, so `result_summary`
     * stays NULL. §6.153 is explicit that Arena must not declare
     * the opponent the winner without Forge's result, and an
     * abandoned game has none: nobody won it.
     *
     * Conditional on the match still being live, which makes it
     * idempotent and stops a late abandon overwriting a real
     * result with a termination. Returns whether this call was
     * the one that ended it.
     */
    fun recordTerminated(
        matchId: UUID,
        at: Instant,
    ): Boolean =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "UPDATE match SET status = 'TERMINATED', ended_at = ? " +
                    "WHERE match_id = ? AND status IN ('LAUNCHING', 'RUNNING')",
            ).use {
                it.setTimestamp(1, java.sql.Timestamp.from(at))
                it.setObject(2, matchId)
                it.executeUpdate() == 1
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
                // The seat NUMBER is what the worker routes on,
                // and it travels from the frozen setup rather than
                // being an index into this list.
                WorkerSeat(participant.displayName, participant.seatNumber, cards)
            }
        }

    /**
     * Seat → (card name → content hash) — §6.121, §6.126.
     *
     * The art each seat's OWN deck carries, which is what an
     * opponent ends up looking at when that seat plays a card.
     * Entries without art are left out rather than carried as
     * nulls: the exporter omits art it could not fetch and the
     * import succeeds anyway, so "no art" is ordinary.
     */
    fun artFor(match: Match): Map<Int, Map<String, String>> =
        dataSource.connection.use { connection ->
            match.participants.mapNotNull { participant ->
                val deckId = participant.deckId ?: return@mapNotNull null
                participant.seatNumber to artOf(connection, deckId)
            }.toMap()
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

/**
 * The art rows of one deck, keyed by the name Forge will use.
 *
 * Top-level rather than a method because MatchRecords is already
 * at detekt's function ceiling, and this needs nothing from it
 * beyond the connection it is handed.
 */
private fun artOf(
    connection: Connection,
    deckId: UUID,
): Map<String, String> =
    connection.prepareStatement(
        """
        SELECT card_name, art_sha256, resolved_set, resolved_number
          FROM deck_entry
         WHERE deck_id = ? AND art_sha256 IS NOT NULL
        """.trimIndent(),
    ).use { statement ->
        statement.setObject(1, deckId)
        statement.executeQuery().use { rows ->
            buildMap {
                while (rows.next()) {
                    put(rows.getString(1), rows.getString(2))
                    // P6-BD -- and by the printing Forge resolved, which
                    // is what a snapshot names ("M10/242"), so two
                    // printings of one card keep their own pictures.
                    val set = rows.getString(3)
                    val number = rows.getString(4)
                    if (set != null && number != null) {
                        put("${MatchArt.PRINTING}$set/$number|${rows.getString(1)}", rows.getString(2))
                    }
                }
            }
        }
    }
