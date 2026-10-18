package net.barnflix.proxic.room

import net.barnflix.proxic.deck.DeckAuthorization
import java.sql.Connection
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

// Preparing and cancelling a match — PHASE_05 §5.91–§5.117.
//
// Preparation does NOT start Forge (§5.91). It validates, freezes a
// snapshot, and moves the room to READY_FOR_MATCH. Phase 6 turns
// that snapshot into a match.
//
// THE SHAPE OF THIS FILE IS §5.93 PLUS A JVM.
//
// §5.93 says preparation must revalidate everything from
// authoritative state rather than trusting an earlier answer. That
// argues for one transaction doing all of it. But §5.96's Forge
// preflight spawns a worker — ~611 MB and ~2.8 s per deck (Phase
// 0A) — and holding a row lock across a JVM start is how a lobby
// becomes unresponsive for six seconds because somebody clicked
// Prepare.
//
// So preparation is three steps:
//
//   1. locked  — every cheap check, and capture the revision
//   2. unlocked — the Forge preflight, which is slow
//   3. locked  — the revision must be UNCHANGED, then write
//
// Step 3's revision check is what makes step 2 safe to run outside
// a lock. If anything moved the room while Forge was thinking —
// somebody left, changed a deck, was removed — the preparation is
// refused as stale rather than written from facts that have since
// expired. That is §5.93 honoured, not dodged: nothing validated in
// step 1 is trusted at step 3 without the revision agreeing.

private const val OPEN_FORMAT_PRESET = "OPEN_FORMAT_1V1"

class MatchSetupService(
    dataSource: DataSource,
    private val deckAuthorization: DeckAuthorization,
    private val preflight: DeckPreflight,
    private val presence: Presence = EveryoneOnline,
    private val clock: () -> Instant = Instant::now,
) {
    private val rooms = RoomStore(dataSource)
    private val setups = MatchSetupStore(dataSource)

    /** §5.91 — host-only. Validates and freezes; starts nothing. */
    fun prepare(
        roomId: UUID,
        hostUserId: UUID,
        expectedRevision: Long? = null,
    ): PrepareResult {
        val checked = firstPass(roomId, hostUserId, expectedRevision)
        if (checked !is FirstPass.Proceed) return (checked as FirstPass.Answer).result

        // Step 2 — slow, and outside every lock.
        val problems =
            checked.decks.mapNotNull { (userId, deckId) ->
                val check = preflight.validate(deckId)
                if (check.ok) null else SeatProblem(userId, check.verdict.name, check.detail)
            }

        if (problems.isNotEmpty()) {
            // §5.98 — the room stays OPEN, no setup is created, and
            // the readiness that was based on a deck Forge has just
            // rejected is cleared. Leaving it set would show a
            // table that is ready and cannot start.
            clearReadinessFor(roomId, problems.map { it.userId })
            return PrepareResult.NotReady(problems)
        }

        return secondPass(roomId, checked.revision)
    }

    /**
     * §5.117 — the host cancels, and the room goes back to OPEN.
     *
     * Readiness resets (§5.117). Deck selections stay: the section
     * says they may remain if still valid, and making two people
     * re-pick a deck they already picked is a cost with no benefit.
     */
    fun cancel(
        roomId: UUID,
        hostUserId: UUID,
    ): RoomResult =
        setups.inTransaction { connection ->
            val room =
                rooms.lockedRoom(connection, roomId)
                    ?: return@inTransaction RoomResult.Refused(RoomError.NotFound)
            if (!room.isHost(hostUserId)) {
                return@inTransaction RoomResult.Refused(RoomError.HostRequired)
            }
            // THE ONE THAT HAD NO GUARD AT ALL.
            //
            // Cancelling sets the room back to OPEN and clears
            // readiness. Called while a match was running it would
            // have unlocked a room whose game was still being
            // played, letting the host prepare and launch a SECOND
            // match with the same two players -- two Forge JVMs,
            // two games, and the first one orphaned. Nothing in the
            // UI offered it; the endpoint did.
            if (room.status != RoomStatus.READY_FOR_MATCH) {
                return@inTransaction RoomResult.Refused(
                    if (room.status == RoomStatus.IN_MATCH) {
                        RoomError.MatchInProgress
                    } else {
                        RoomError.NotOpen
                    },
                )
            }

            setups.invalidate(connection, roomId)
            rooms.clearReadiness(connection, roomId)
            // Not `touch`: setRoomStatus bumps the revision and the
            // activity stamp itself, and doing both would move the
            // revision twice for one action.
            setups.setRoomStatus(connection, roomId, RoomStatus.OPEN)
            RoomResult.Ok(rooms.load(connection, roomId)!!)
        }

    /** The live snapshot for a room, for Phase 6 and for the UI. */
    fun readySetup(roomId: UUID): MatchSetupView? {
        return setups.inTransaction { connection -> setups.readySetup(connection, roomId) }
    }

    // --- step 1 ------------------------------------------------------------

    private sealed interface FirstPass {
        data class Answer(val result: PrepareResult) : FirstPass

        data class Proceed(
            val revision: Long,
            val decks: List<Pair<UUID, UUID>>,
        ) : FirstPass
    }

    private fun firstPass(
        roomId: UUID,
        hostUserId: UUID,
        expectedRevision: Long?,
    ): FirstPass =
        setups.inTransaction { connection ->
            val room =
                rooms.lockedRoom(connection, roomId)
                    ?: return@inTransaction refuse(RoomError.NotFound)

            if (expectedRevision != null && expectedRevision != room.revision) {
                return@inTransaction refuse(RoomError.StaleRevision(room.revision))
            }
            if (!room.isHost(hostUserId)) return@inTransaction refuse(RoomError.HostRequired)

            // §5.115 — preparing a room that is already prepared,
            // from the same revision, is the same preparation. The
            // partial unique index would refuse a second READY row
            // anyway; answering with the existing one turns a race
            // into an idempotent success instead of an error the
            // host cannot act on.
            if (room.status == RoomStatus.READY_FOR_MATCH) {
                val existing = setups.readySetup(connection, roomId)
                return@inTransaction if (existing != null) {
                    FirstPass.Answer(PrepareResult.Prepared(existing, room))
                } else {
                    // READY_FOR_MATCH with no setup is a state
                    // nothing should produce. Saying NotOpen is
                    // honest: it is not open, and it is not
                    // launchable either.
                    refuse(RoomError.NotOpen)
                }
            }

            if (room.status != RoomStatus.OPEN) return@inTransaction refuse(RoomError.NotOpen)

            // §5.94 — the preset must still be one this server
            // supports. Not trusted from the browser's list.
            if (room.presetId != OPEN_FORMAT_PRESET) {
                return@inTransaction refuse(
                    RoomError.InvalidConfiguration("That match preset is no longer available."),
                )
            }

            // §5.92 — the exact required number of members. A
            // room-level fact, not one seat's problem.
            if (room.members.size != room.desiredPlayerCount) {
                return@inTransaction refuse(
                    RoomError.InvalidConfiguration(
                        "This room needs ${room.desiredPlayerCount} players " +
                            "and has ${room.members.size}.",
                    ),
                )
            }

            val problems = seatProblems(room)
            if (problems.isNotEmpty()) {
                return@inTransaction FirstPass.Answer(PrepareResult.NotReady(problems))
            }

            FirstPass.Proceed(
                revision = room.revision,
                decks = room.members.map { it.userId to it.selectedDeckId!! },
            )
        }

    /**
     * §5.92's per-seat preconditions, in the order a player would
     * want to hear them: the thing you can fix first, first.
     */
    private fun seatProblems(room: Room): List<SeatProblem> =
        room.members.mapNotNull { member ->
            val deckId = member.selectedDeckId
            when {
                deckId == null ->
                    SeatProblem(member.userId, "DECK_REQUIRED", "Choose a deck.")

                // §5.42, §5.51 — asked again here, because a share
                // revoked since the selection is revoked now.
                !deckAuthorization.canUseDeck(member.userId, deckId) ->
                    SeatProblem(
                        member.userId,
                        DeckVerdict.ACCESS_REVOKED.name,
                        "That deck is no longer available to you. Choose another.",
                    )

                !member.ready ->
                    SeatProblem(member.userId, "NOT_READY", "Mark yourself ready.")

                // §5.92 — present, not merely seated. A player who
                // closed the tab cannot answer Forge's first prompt.
                !presence.isOnline(member.userId) ->
                    SeatProblem(
                        member.userId,
                        "NOT_CONNECTED",
                        "You are not connected. Reload the lobby.",
                    )

                else -> null
            }
        }

    // --- step 3 ------------------------------------------------------------

    private fun secondPass(
        roomId: UUID,
        expectedRevision: Long,
    ): PrepareResult =
        setups.inTransaction { connection ->
            val room =
                rooms.lockedRoom(connection, roomId)
                    ?: return@inTransaction PrepareResult.Refused(RoomError.NotFound)

            // The whole reason step 2 could run unlocked. Anything
            // at all moved the room: refuse rather than write a
            // snapshot of facts that have expired.
            if (room.revision != expectedRevision) {
                return@inTransaction PrepareResult.Refused(RoomError.StaleRevision(room.revision))
            }

            setups.create(connection, room, clock())
            setups.setRoomStatus(connection, roomId, RoomStatus.READY_FOR_MATCH)

            val stored =
                setups.readySetup(connection, roomId)
                    ?: return@inTransaction PrepareResult.Refused(
                        RoomError.InvalidConfiguration("The match setup could not be stored."),
                    )
            PrepareResult.Prepared(stored, rooms.load(connection, roomId)!!)
        }

    private fun clearReadinessFor(
        roomId: UUID,
        userIds: List<UUID>,
    ) {
        setups.inTransaction { connection ->
            // Locked, so this does not race a player who is
            // readying up at the same moment.
            rooms.lockedRoom(connection, roomId) ?: return@inTransaction
            clearSeats(connection, roomId, userIds)
        }
    }

    private fun clearSeats(
        connection: Connection,
        roomId: UUID,
        userIds: List<UUID>,
    ) {
        connection.prepareStatement(
            "UPDATE room_member SET ready = FALSE WHERE room_id = ? AND user_id = ?",
        ).use { statement ->
            for (userId in userIds) {
                statement.setObject(1, roomId)
                statement.setObject(2, userId)
                statement.addBatch()
            }
            statement.executeBatch()
        }
        rooms.touch(connection, roomId)
    }

    private fun refuse(error: RoomError): FirstPass = FirstPass.Answer(PrepareResult.Refused(error))
}
