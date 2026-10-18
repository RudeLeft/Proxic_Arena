package net.barnflix.proxic.match

import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.deck.DeckAuthorization
import net.barnflix.proxic.room.RoomStatus
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Claiming a setup and creating a match — PHASE_06 §6.9–§6.19.
//
// THE WHOLE FILE IS ONE TRANSACTION AND ONE UPDATE.
//
// §6.9 says a setup may create at most one match and that a race
// between duplicate launch requests must not start two Forge
// runtimes. The way that is achieved is the conditional update in
// `claimSetup`: READY → CONSUMED, and the launch proceeds only if
// it changed a row. Reading the status and then updating is the
// race this is written to lose, and losing it costs a second JVM
// and a second game nobody is watching.
//
// §6.12's revalidation runs INSIDE the same transaction, before the
// claim. Doing it outside would be checking facts that can change
// before they are used — which is the mistake Phase 5's preflight
// made deliberately visible by checking the revision again
// afterwards, and which here is avoided outright because none of
// these checks is slow enough to need the room unlocked.
//
// What is NOT here: starting Forge. A match record exists in
// LAUNCHING before any JVM is asked for, so a worker that fails to
// start has somewhere to record that it failed (§6.15, §6.17).

private const val OPEN_FORMAT_PRESET = "OPEN_FORMAT_1V1"

class MatchLauncher(
    private val dataSource: DataSource,
    private val deckAuthorization: DeckAuthorization,
    private val clock: () -> Instant = Instant::now,
) {
    /**
     * §6.10, §6.11 — the host claims a prepared setup.
     *
     * The browser supplies ONLY the setup id (§6.10). Participants,
     * seats, decks, the player count and the preset all come from
     * the immutable setup, because a client that can name its own
     * seat can name somebody else's.
     */
    fun launch(
        setupId: UUID,
        requesterId: UUID,
    ): LaunchResult =
        inTransaction { connection ->
            val setup =
                lockedSetup(connection, setupId)
                    ?: return@inTransaction refuse(LaunchError.SetupNotFound)

            // §6.11 — and before anything else, because a non-host
            // must not learn whether a setup is launchable.
            if (setup.hostUserId != requesterId) {
                return@inTransaction refuse(LaunchError.HostRequired)
            }

            when (setup.status) {
                "CONSUMED" -> return@inTransaction refuse(LaunchError.AlreadyLaunched)
                "READY" -> Unit
                else -> return@inTransaction refuse(LaunchError.SetupNotReady)
            }

            if (setup.roomStatus != RoomStatus.READY_FOR_MATCH.name) {
                return@inTransaction refuse(LaunchError.SetupNotReady)
            }

            revalidate(setup)?.let { return@inTransaction refuse(it) }

            // §6.9 — the claim. Everything above is a precondition;
            // THIS is the thing that makes a second launch lose.
            if (!claimSetup(connection, setupId)) {
                return@inTransaction refuse(LaunchError.AlreadyLaunched)
            }

            val match = createMatch(connection, setup)
            setRoomStatus(connection, setup.roomId, RoomStatus.IN_MATCH)
            LaunchResult.Launched(match)
        }

    // --- §6.12 revalidation ------------------------------------------------

    /**
     * Everything §6.12 requires, re-read rather than trusted.
     *
     * Returns null when the setup is still launchable. The order is
     * deliberate: the cheap structural facts first, the per-seat
     * authorization last, so a setup that is simply stale does not
     * cost a round of deck queries.
     *
     * Takes no Connection: everything it checks was read under the
     * lock in [lockedSetup], and `canUseDeck` opens its own. A
     * parameter that is only there for symmetry is one the next
     * reader assumes is load-bearing.
     */
    private fun revalidate(setup: StoredSetup): LaunchError? {
        // §6.12, §5.94 — the preset must still be one this server
        // supports. Not trusted from the setup either: it was
        // recorded when the room was prepared, and a server upgrade
        // between then and now could have withdrawn it.
        if (setup.presetId != OPEN_FORMAT_PRESET) {
            return LaunchError.RevalidationFailed("That match preset is no longer available.")
        }

        if (setup.seats.isEmpty()) {
            return LaunchError.RevalidationFailed("That setup has no players.")
        }

        for (seat in setup.seats) {
            if (!seat.accountActive) {
                return LaunchError.RevalidationFailed(
                    "${seat.displayName} can no longer play. Prepare the match again.",
                )
            }
            if (seat.deckId == null) {
                return LaunchError.RevalidationFailed(
                    "${seat.displayName}'s deck is gone. Prepare the match again.",
                )
            }
            // §6.12, §5.51 — asked again HERE, because a share
            // revoked between preparation and launch is revoked.
            // §5.101 still applies: the host is told which seat,
            // never why.
            if (!deckAuthorization.canUseDeck(seat.userId, seat.deckId)) {
                return LaunchError.RevalidationFailed(
                    "${seat.displayName} can no longer use their deck. " +
                        "Prepare the match again.",
                )
            }
        }
        return null
    }

    // --- the claim ---------------------------------------------------------

    /**
     * READY → CONSUMED, and report whether this caller did it.
     *
     * §5.113 asked Phase 5 to provide the foundation for exactly
     * this, and `MATCH_SETUP_CONTRACT.md` told Phase 6 to claim
     * atomically. This is that claim: one statement, one row count,
     * no window between deciding and doing.
     */
    private fun claimSetup(
        connection: Connection,
        setupId: UUID,
    ): Boolean =
        connection.prepareStatement(
            "UPDATE match_setup SET status = 'CONSUMED' " +
                "WHERE setup_id = ? AND status = 'READY'",
        ).use {
            it.setObject(1, setupId)
            it.executeUpdate() == 1
        }

    // --- writing the record --------------------------------------------------

    private fun createMatch(
        connection: Connection,
        setup: StoredSetup,
    ): Match {
        val matchId = UUID.randomUUID()
        connection.prepareStatement(
            """
            INSERT INTO match
                (match_id, setup_id, room_id, status, preset_id,
                 forge_commit, forge_release, worker_protocol_version,
                 public_protocol_version, created_at)
            VALUES (?, ?, ?, 'LAUNCHING', ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
        ).use {
            it.setObject(1, matchId)
            it.setObject(2, setup.setupId)
            it.setObject(3, setup.roomId)
            it.setString(4, setup.presetId)
            // §6.18 — what RAN, from the server's own build facts.
            it.setString(5, BuildInfo.FORGE_COMMIT)
            it.setString(6, BuildInfo.FORGE_RELEASE)
            it.setInt(7, BuildInfo.PROTOCOL_VERSION)
            it.setInt(8, BuildInfo.PROTOCOL_VERSION)
            it.setTimestamp(9, java.sql.Timestamp.from(clock()))
            it.executeUpdate()
        }

        connection.prepareStatement(
            """
            INSERT INTO match_participant
                (match_id, user_id, seat_number, team_id, deck_id,
                 deck_name_snapshot, display_name_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """.trimIndent(),
        ).use { statement ->
            for (seat in setup.seats) {
                statement.setObject(1, matchId)
                statement.setObject(2, seat.userId)
                statement.setInt(3, seat.seatNumber)
                statement.setNull(4, java.sql.Types.INTEGER)
                statement.setObject(5, seat.deckId)
                statement.setString(6, seat.deckName)
                statement.setString(7, seat.displayName)
                statement.addBatch()
            }
            statement.executeBatch()
        }

        // THE SETUP'S SEATS ARE NOW REDUNDANT, so they go.
        //
        // This settles a question Phase 5 explicitly left to Phase 6:
        // should a CONSUMED setup keep blocking deck deletion? It
        // did, through match_setup_player's RESTRICT, which meant
        // playing one game made a deck permanently undeletable --
        // the exact defect V008 and V009 were written to repair,
        // reappearing through a different table.
        //
        // The rule is now uniform: a setup's seats exist only while
        // the setup is live. V008 already deletes them when a setup
        // is INVALIDATED; this does the same when it is CONSUMED,
        // at the moment match_participant has captured everything
        // that mattered -- including the deck's NAME, which is what
        // anybody reading an old match actually wants.
        //
        // The match_setup row itself survives, status CONSUMED,
        // as proof the preparation happened.
        connection.prepareStatement("DELETE FROM match_setup_player WHERE setup_id = ?")
            .use {
                it.setObject(1, setup.setupId)
                it.executeUpdate()
            }

        return Match(
            matchId = matchId,
            setupId = setup.setupId,
            roomId = setup.roomId,
            status = MatchStatus.LAUNCHING,
            presetId = setup.presetId,
            participants =
                setup.seats.map {
                    MatchParticipant(
                        userId = it.userId,
                        seatNumber = it.seatNumber,
                        deckId = it.deckId,
                        deckName = it.deckName,
                        displayName = it.displayName,
                    )
                },
        )
    }

    private fun setRoomStatus(
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

    // --- reading ---------------------------------------------------------------

    private data class StoredSeat(
        val userId: UUID,
        val seatNumber: Int,
        val deckId: UUID?,
        val deckName: String,
        val displayName: String,
        val accountActive: Boolean,
    )

    private data class StoredSetup(
        val setupId: UUID,
        val roomId: UUID,
        val hostUserId: UUID,
        val presetId: String,
        val status: String,
        val roomStatus: String,
        val seats: List<StoredSeat>,
    )

    /**
     * The setup and its room, locked together.
     *
     * `FOR UPDATE OF s, r` rather than a plain read: two launches
     * racing must serialise here, so the second one sees CONSUMED
     * rather than the READY its predecessor is halfway through
     * changing.
     */
    private fun lockedSetup(
        connection: Connection,
        setupId: UUID,
    ): StoredSetup? {
        val header =
            connection.prepareStatement(
                """
                SELECT s.room_id, s.preset_id, s.status, r.status, r.host_user_id
                  FROM match_setup s
                  JOIN room r ON r.room_id = s.room_id
                 WHERE s.setup_id = ?
                   FOR UPDATE OF s, r
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, setupId)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) {
                        null
                    } else {
                        Header(
                            roomId = rows.getObject(1, UUID::class.java),
                            presetId = rows.getString(2),
                            status = rows.getString(3),
                            roomStatus = rows.getString(4),
                            hostUserId = rows.getObject(5, UUID::class.java),
                        )
                    }
                }
            } ?: return null

        return StoredSetup(
            setupId = setupId,
            roomId = header.roomId,
            hostUserId = header.hostUserId,
            presetId = header.presetId,
            status = header.status,
            roomStatus = header.roomStatus,
            seats = seatsOf(connection, setupId),
        )
    }

    private data class Header(
        val roomId: UUID,
        val presetId: String,
        val status: String,
        val roomStatus: String,
        val hostUserId: UUID,
    )

    /**
     * The seats, joined to what they depend on.
     *
     * A LEFT JOIN to the deck on purpose: a deck deleted since
     * preparation leaves the row with a null name, and §6.12 wants
     * that reported as a revalidation failure rather than hidden by
     * an inner join dropping the seat entirely. A missing seat and
     * a seat with a missing deck are very different facts.
     */
    private fun seatsOf(
        connection: Connection,
        setupId: UUID,
    ): List<StoredSeat> =
        connection.prepareStatement(
            """
            SELECT p.user_id, p.seat_number, p.deck_id, p.display_name,
                   d.display_name, u.status
              FROM match_setup_player p
              JOIN app_user u ON u.user_id = p.user_id
              LEFT JOIN imported_deck d ON d.deck_id = p.deck_id
             WHERE p.setup_id = ?
             ORDER BY p.seat_number
            """.trimIndent(),
        ).use { statement ->
            statement.setObject(1, setupId)
            statement.executeQuery().use { rows ->
                buildList {
                    while (rows.next()) {
                        add(
                            StoredSeat(
                                userId = rows.getObject(1, UUID::class.java),
                                seatNumber = rows.getInt(2),
                                deckId = rows.getObject(3, UUID::class.java),
                                deckName = rows.getString(5) ?: "a deck that no longer exists",
                                displayName = rows.getString(4),
                                accountActive = rows.getString(6) == "ACTIVE",
                            ),
                        )
                    }
                }
            }
        }

    private fun refuse(error: LaunchError): LaunchResult = LaunchResult.Refused(error)

    private fun <T> inTransaction(body: (Connection) -> T): T =
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
}
