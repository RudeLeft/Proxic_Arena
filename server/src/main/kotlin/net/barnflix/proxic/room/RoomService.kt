package net.barnflix.proxic.room

import net.barnflix.proxic.deck.DeckAuthorization
import java.util.UUID
import javax.sql.DataSource

// The room service — PHASE_05 §5.14–§5.27, §5.36, §5.40–§5.51.
//
// Every room rule lives here, for the reason §4.45 gave about decks
// and §5.x repeats: a rule enforced in three routes is a rule that
// one route will forget, and the forgetful one is never the tested
// one. Routes and socket handlers call this; neither decides
// anything itself.
//
// Each mutation runs in ONE transaction that re-reads the room,
// checks the rule and bumps `revision`. Reading state, deciding
// outside a transaction and writing afterwards is how two people
// clicking at once both get a seat.

private const val PRESET_OPEN_FORMAT = "OPEN_FORMAT_1V1"
private const val OPEN_FORMAT_PLAYERS = 2

/**
 * §5.135–§5.137 — has the room moved since the client looked?
 *
 * Checked INSIDE the transaction, after the row lock, because
 * anywhere else it is a guess: between an unlocked read and the
 * write, the revision this compares against can change again.
 *
 * Null means the caller did not say, which is allowed (§5.136
 * says requests MAY include it). The socket's invitation accept
 * is the honest case: the joiner never saw a revision, so there
 * is nothing for them to be stale about.
 */
private fun stale(
    room: Room,
    expectedRevision: Long?,
): RoomResult.Refused? =
    if (expectedRevision != null && expectedRevision != room.revision) {
        RoomResult.Refused(RoomError.StaleRevision(room.revision))
    } else {
        null
    }

class RoomService(
    dataSource: DataSource,
    private val deckAuthorization: DeckAuthorization,
) {
    private val store = RoomStore(dataSource)
    // --- reads --------------------------------------------------------

    /**
     * The room, or null.
     *
     * Deliberately does NOT check membership: callers decide what a
     * non-member may know, because that differs per route. A
     * non-member asking for a room gets 404 at the route (§4.65's
     * lesson), not a different shape of truth here.
     */
    fun find(roomId: UUID): Room? = store.withConnection { connection -> store.load(connection, roomId) }

    /** §5.5 — the one room this user is in, if any. */
    fun roomOf(userId: UUID): Room? =
        store.withConnection { connection ->
            val roomId =
                connection.prepareStatement(
                    """
                    SELECT m.room_id FROM room_member m
                      JOIN room r ON r.room_id = m.room_id
                     WHERE m.user_id = ? AND r.status IN ('OPEN', 'READY_FOR_MATCH')
                    """.trimIndent(),
                ).use { statement ->
                    statement.setObject(1, userId)
                    statement.executeQuery().use { rows ->
                        if (rows.next()) rows.getObject(1, UUID::class.java) else null
                    }
                }
            roomId?.let { store.load(connection, it) }
        }

    // --- lifecycle ----------------------------------------------------

    /**
     * §5.14 — create a room and seat the host in it.
     *
     * The host is a player too (§5.16), so creation is one
     * transaction that writes both rows: a room with a host who is
     * not seated is a state nothing else in this service expects.
     */
    fun create(hostUserId: UUID): RoomResult =
        store.inTransaction { connection ->
            if (store.activeRoomOf(connection, hostUserId) != null) {
                return@inTransaction RoomResult.Refused(RoomError.AlreadyInARoom)
            }

            val roomId = UUID.randomUUID()
            connection.prepareStatement(
                """
                INSERT INTO room (room_id, host_user_id, preset_id, desired_player_count, status)
                VALUES (?, ?, ?, ?, 'OPEN')
                """.trimIndent(),
            ).use {
                it.setObject(1, roomId)
                it.setObject(2, hostUserId)
                it.setString(3, PRESET_OPEN_FORMAT)
                it.setInt(4, OPEN_FORMAT_PLAYERS)
                it.executeUpdate()
            }
            store.seat(connection, roomId, hostUserId, seatNumber = 1)
            RoomResult.Ok(store.load(connection, roomId)!!)
        }

    /**
     * §5.20, §5.21 — join, with every precondition checked inside
     * the transaction that does the seating.
     */
    fun join(
        roomId: UUID,
        userId: UUID,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)

            when {
                room.status != RoomStatus.OPEN ->
                    RoomResult.Refused(RoomError.NotOpen)

                room.isMember(userId) ->
                    RoomResult.Refused(RoomError.AlreadyMember)

                store.activeRoomOf(connection, userId) != null ->
                    RoomResult.Refused(RoomError.AlreadyInARoom)

                room.isFull() ->
                    // §5.22 — never silently create another seat.
                    RoomResult.Refused(RoomError.Full)

                else -> {
                    // §5.27 — the next free seat, not a chosen one.
                    val taken = room.members.map { it.seatNumber }.toSet()
                    val seatNumber = (1..room.desiredPlayerCount).first { it !in taken }
                    store.seat(connection, roomId, userId, seatNumber)
                    store.touch(connection, roomId)
                    RoomResult.Ok(store.load(connection, roomId)!!)
                }
            }
        }

    /**
     * §5.18 — a member leaves; if the HOST leaves, the room closes.
     *
     * Phase 5 implements no host transfer, so a host leaving is the
     * end of that room rather than a succession puzzle. Everyone
     * else is removed with it, which is what §5.18 asks for.
     *
     * No `expectedRevision`, unlike the mutations above, and the
     * omission is deliberate: leaving and closing are statements of
     * intent, not edits to state. "I want out" does not stop being
     * true because somebody else changed their deck while you
     * clicked, and refusing it with a 409 would trap a player in a
     * room until they clicked twice.
     */
    fun leave(
        roomId: UUID,
        userId: UUID,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            if (!room.isMember(userId)) {
                return@inTransaction RoomResult.Refused(RoomError.NotFound)
            }

            if (room.isHost(userId)) {
                store.close(connection, roomId)
            } else {
                store.removeMember(connection, roomId, userId)
                store.touch(connection, roomId)
            }
            RoomResult.Ok(store.load(connection, roomId)!!)
        }

    /** §5.17 — the host removes somebody. Not themselves. */
    fun remove(
        roomId: UUID,
        hostUserId: UUID,
        targetUserId: UUID,
        expectedRevision: Long? = null,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            stale(room, expectedRevision)?.let { return@inTransaction it }

            when {
                !room.isHost(hostUserId) -> RoomResult.Refused(RoomError.HostRequired)

                // Leaving is `leave`. Removing yourself as host would
                // close the room through a door marked "kick", which
                // is the kind of surprise that makes people distrust
                // a control.
                targetUserId == hostUserId ->
                    RoomResult.Refused(
                        RoomError.InvalidConfiguration("The host cannot remove themselves."),
                    )

                !room.isMember(targetUserId) -> RoomResult.Refused(RoomError.NotFound)

                else -> {
                    store.removeMember(connection, roomId, targetUserId)
                    store.touch(connection, roomId)
                    RoomResult.Ok(store.load(connection, roomId)!!)
                }
            }
        }

    /** §5.17 — the host closes the room. */
    fun close(
        roomId: UUID,
        hostUserId: UUID,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            if (!room.isHost(hostUserId)) {
                return@inTransaction RoomResult.Refused(RoomError.HostRequired)
            }
            store.close(connection, roomId)
            RoomResult.Ok(store.load(connection, roomId)!!)
        }

    // --- configuration --------------------------------------------------

    /**
     * §5.33–§5.36 — the host changes the player count.
     *
     * Open Format is two players, so today this can only ever be
     * asked for as 2. The path exists because §5.35's rule — never
     * shrink below the occupied seats — is the kind of check that is
     * much easier to write now than to remember when a preset with a
     * range arrives.
     */
    fun setPlayerCount(
        roomId: UUID,
        hostUserId: UUID,
        count: Int,
        expectedRevision: Long? = null,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            stale(room, expectedRevision)?.let { return@inTransaction it }

            when {
                !room.isHost(hostUserId) -> RoomResult.Refused(RoomError.HostRequired)

                room.status != RoomStatus.OPEN -> RoomResult.Refused(RoomError.NotOpen)

                count != OPEN_FORMAT_PLAYERS ->
                    RoomResult.Refused(
                        RoomError.InvalidConfiguration(
                            "Open Format is a two-player game.",
                        ),
                    )

                // §5.35 — a seat cannot be configured away from the
                // person sitting in it.
                count < room.members.size ->
                    RoomResult.Refused(
                        RoomError.InvalidConfiguration(
                            "Someone is sitting in a seat that change would remove.",
                        ),
                    )

                else -> {
                    connection.prepareStatement(
                        "UPDATE room SET desired_player_count = ? WHERE room_id = ?",
                    ).use {
                        it.setInt(1, count)
                        it.setObject(2, roomId)
                        it.executeUpdate()
                    }
                    // §5.36 — a material configuration change
                    // invalidates readiness. Everyone agreed to the
                    // old shape, not this one.
                    store.clearReadiness(connection, roomId)
                    store.touch(connection, roomId)
                    RoomResult.Ok(store.load(connection, roomId)!!)
                }
            }
        }

    // --- deck selection and readiness ------------------------------------

    /**
     * §5.40–§5.44 — choose MY deck. Never anybody else's.
     *
     * The deck is checked with `canUseDeck`, which is Phase 4's
     * single answer (§4.46): computed from the database on the
     * asking, so a share revoked a second ago is already false. A
     * host cannot call this for another member — there is no
     * parameter for it (§5.44).
     */
    fun selectDeck(
        roomId: UUID,
        userId: UUID,
        deckId: UUID?,
        expectedRevision: Long? = null,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            stale(room, expectedRevision)?.let { return@inTransaction it }

            when {
                !room.isMember(userId) -> RoomResult.Refused(RoomError.NotFound)

                room.status != RoomStatus.OPEN -> RoomResult.Refused(RoomError.NotOpen)

                deckId != null && !deckAuthorization.canUseDeck(userId, deckId) ->
                    // §4.65 again: this is also the answer for a deck
                    // that does not exist, so a member cannot probe
                    // which deck ids are real.
                    RoomResult.Refused(RoomError.DeckNotUsable)

                else -> {
                    connection.prepareStatement(
                        // Changing a deck drops readiness: everyone
                        // else agreed to be ready alongside the old
                        // choice.
                        "UPDATE room_member SET selected_deck_id = ?, ready = FALSE " +
                            "WHERE room_id = ? AND user_id = ?",
                    ).use {
                        it.setObject(1, deckId)
                        it.setObject(2, roomId)
                        it.setObject(3, userId)
                        it.executeUpdate()
                    }
                    store.touch(connection, roomId)
                    RoomResult.Ok(store.load(connection, roomId)!!)
                }
            }
        }

    /**
     * §5.41, §5.42 — ready up, or stand down.
     *
     * Readying re-checks deck access rather than trusting the
     * selection made a minute ago: §5.50 says access can change, and
     * the moment before a match starts is exactly when it matters.
     */
    fun setReady(
        roomId: UUID,
        userId: UUID,
        ready: Boolean,
        expectedRevision: Long? = null,
    ): RoomResult =
        store.inTransaction { connection ->
            val room =
                store.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            stale(room, expectedRevision)?.let { return@inTransaction it }
            val member =
                room.member(userId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)

            if (room.status != RoomStatus.OPEN && ready) {
                return@inTransaction RoomResult.Refused(RoomError.NotOpen)
            }

            if (ready) {
                val deckId =
                    member.selectedDeckId
                        ?: return@inTransaction RoomResult.Refused(RoomError.DeckRequired)
                if (!deckAuthorization.canUseDeck(userId, deckId)) {
                    // §5.51 — access went away under them. Clear the
                    // selection rather than leaving a seat pointing
                    // at a deck they may not use.
                    connection.prepareStatement(
                        "UPDATE room_member SET selected_deck_id = NULL, ready = FALSE " +
                            "WHERE room_id = ? AND user_id = ?",
                    ).use {
                        it.setObject(1, roomId)
                        it.setObject(2, userId)
                        it.executeUpdate()
                    }
                    store.touch(connection, roomId)
                    return@inTransaction RoomResult.Refused(RoomError.DeckNotUsable)
                }
            }

            connection.prepareStatement(
                "UPDATE room_member SET ready = ? WHERE room_id = ? AND user_id = ?",
            ).use {
                it.setBoolean(1, ready)
                it.setObject(2, roomId)
                it.setObject(3, userId)
                it.executeUpdate()
            }
            store.touch(connection, roomId)
            RoomResult.Ok(store.load(connection, roomId)!!)
        }
}
