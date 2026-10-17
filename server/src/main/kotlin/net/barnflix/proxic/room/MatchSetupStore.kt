package net.barnflix.proxic.room

import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Match-setup persistence — PHASE_05 §5.102–§5.114, §5.118.
//
// SQL only, the same seam RoomStore has: the rules are next door in
// MatchSetupService and can be read without stepping over a
// prepared statement. Everything that writes takes a Connection,
// because preparation decides and writes inside one transaction.

internal class MatchSetupStore(private val dataSource: DataSource) {
    fun <T> inTransaction(body: (Connection) -> T): T =
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                val result = body(connection)
                connection.commit()
                result
            } catch (e: Exception) {
                connection.rollback()
                throw e
            } finally {
                connection.autoCommit = true
            }
        }

    /** The live setup for a room, if there is one (§5.114). */
    fun readySetup(
        connection: Connection,
        roomId: UUID,
    ): MatchSetupView? {
        val header =
            connection.prepareStatement(
                """
                SELECT setup_id, source_room_revision, preset_id, status, created_at
                  FROM match_setup
                 WHERE room_id = ? AND status = 'READY'
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, roomId)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) {
                        null
                    } else {
                        Header(
                            setupId = rows.getObject(1, UUID::class.java),
                            revision = rows.getLong(2),
                            presetId = rows.getString(3),
                            status = rows.getString(4),
                            createdAt = rows.getTimestamp(5).toInstant(),
                        )
                    }
                }
            } ?: return null

        val players = playersOf(connection, header.setupId)
        return MatchSetupView(
            setupId = header.setupId.toString(),
            roomId = roomId.toString(),
            sourceRoomRevision = header.revision,
            presetId = header.presetId,
            playerCount = players.size,
            status = header.status,
            createdAt = header.createdAt.toString(),
            players = players,
        )
    }

    private data class Header(
        val setupId: UUID,
        val revision: Long,
        val presetId: String,
        val status: String,
        val createdAt: Instant,
    )

    private fun playersOf(
        connection: Connection,
        setupId: UUID,
    ): List<MatchSetupPlayer> =
        connection.prepareStatement(
            """
            SELECT user_id, display_name, seat_number, deck_id
              FROM match_setup_player
             WHERE setup_id = ?
             ORDER BY seat_number
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, setupId)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            MatchSetupPlayer(
                                userId = rows.getObject(1, UUID::class.java).toString(),
                                displayName = rows.getString(2),
                                seatNumber = rows.getInt(3),
                                deckId = rows.getObject(4, UUID::class.java).toString(),
                            ),
                        )
                    }
                }
            }
        }

    /**
     * Write the snapshot.
     *
     * §5.104 — every value here came from the room rows this
     * transaction just read, not from the request that triggered
     * it. The deck id in particular: a browser sending one would be
     * choosing what to launch.
     */
    fun create(
        connection: Connection,
        room: Room,
        createdAt: Instant,
    ): UUID {
        val setupId = UUID.randomUUID()
        connection.prepareStatement(
            """
            INSERT INTO match_setup
                (setup_id, room_id, source_room_revision, preset_id, status, created_at)
            VALUES (?, ?, ?, ?, 'READY', ?)
            """.trimIndent(),
        ).use {
            it.setObject(1, setupId)
            it.setObject(2, room.roomId)
            it.setLong(3, room.revision)
            it.setString(4, room.presetId)
            it.setTimestamp(5, Timestamp.from(createdAt))
            it.executeUpdate()
        }

        connection.prepareStatement(
            """
            INSERT INTO match_setup_player
                (setup_id, user_id, seat_number, deck_id, team_id, display_name)
            VALUES (?, ?, ?, ?, ?, ?)
            """.trimIndent(),
        ).use { statement ->
            for (member in room.members) {
                statement.setObject(1, setupId)
                statement.setObject(2, member.userId)
                statement.setInt(3, member.seatNumber)
                // Not null by this point: the service refuses to
                // prepare a room where anyone has no deck, and the
                // column is NOT NULL so a bug here fails loudly
                // rather than writing an unlaunchable snapshot.
                statement.setObject(4, member.selectedDeckId)
                statement.setNull(5, java.sql.Types.INTEGER)
                statement.setString(6, member.displayName)
                statement.addBatch()
            }
            statement.executeBatch()
        }
        return setupId
    }

    /**
     * §5.114 — READY becomes INVALIDATED.
     *
     * Delegated so that cancelling, closing and expiring cannot
     * drift apart; see SetupInvalidation.kt for why the seats go
     * with it.
     */
    fun invalidate(
        connection: Connection,
        roomId: UUID,
    ): Int = invalidateReadySetups(connection, roomId)

    fun setRoomStatus(
        connection: Connection,
        roomId: UUID,
        status: RoomStatus,
    ) {
        connection.prepareStatement(
            "UPDATE room SET status = ?, revision = revision + 1, " +
                "last_activity_at = now() WHERE room_id = ?",
        ).use {
            it.setString(1, status.name)
            it.setObject(2, roomId)
            it.executeUpdate()
        }
    }
}
