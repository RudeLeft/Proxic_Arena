package net.barnflix.proxic.room

import net.barnflix.proxic.deck.DeckAccessListener
import org.slf4j.Logger
import java.util.UUID
import javax.sql.DataSource

// Two things the room must react to that are not somebody clicking
// in it: the server restarting, and deck access changing elsewhere.
// PHASE_05 §5.50, §5.51, §5.120, §5.122, §5.198, §5.213.

/**
 * What a restart has to put right — §5.120, §5.122, §5.198, §5.213.
 *
 * Rooms are persistent on purpose (§5.119): a restart must not
 * destroy a lobby people were standing in. But some of what was
 * true before the restart is not true after it, and the §5.228
 * audit found that NOTHING was putting those things right.
 *
 * Presence takes care of itself, because it never left memory
 * (§5.120): after a restart there are no connections, so everybody
 * is correctly disconnected. The other two do not:
 *
 * - **Readiness.** §5.198 says reset it conservatively. "Ready" is
 *   a statement about a person who is watching, and after a restart
 *   nobody is: every socket died with the old process. Leaving the
 *   ticks set would show a table ready to start, in front of two
 *   people who have gone to bed.
 *
 * - **A prepared setup.** §5.122 and §5.213: a setup that was not
 *   consumed before the restart is INVALIDATED, never "probably
 *   still fine". It froze a room whose players are all gone, and
 *   the room goes back to OPEN so they can prepare again when they
 *   return.
 *
 * Deck selections are deliberately KEPT. §5.120 lists them among
 * the things that remain, and re-picking a deck you already picked
 * is a cost with no safety benefit — the preflight revalidates
 * everything at preparation anyway (§5.93).
 */
class RoomRecovery(
    private val dataSource: DataSource,
    private val log: Logger,
) {
    fun recover() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            try {
                val setups = invalidatePreparedRooms(connection)
                val ready = clearReadiness(connection)
                connection.commit()
                if (setups > 0 || ready > 0) {
                    log.info("room recovery: $setups prepared setup(s) invalidated, $ready seat(s) un-readied")
                }
            } catch (e: Exception) {
                connection.rollback()
                // A restart must not be stopped by this. The rooms
                // are still there and the worst case is a lobby
                // showing stale ticks, which is better than a
                // server that refuses to come up.
                log.warn("room recovery failed; continuing", e)
            } finally {
                connection.autoCommit = true
            }
        }
    }

    /** §5.213 — the setup goes, and the room returns to OPEN. */
    private fun invalidatePreparedRooms(connection: java.sql.Connection): Int {
        val roomIds =
            connection.prepareStatement(
                "SELECT room_id FROM room WHERE status = 'READY_FOR_MATCH'",
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }

        for (roomId in roomIds) {
            invalidateReadySetups(connection, roomId)
            connection.prepareStatement(
                "UPDATE room SET status = 'OPEN', revision = revision + 1 WHERE room_id = ?",
            ).use {
                it.setObject(1, roomId)
                it.executeUpdate()
            }
        }
        return roomIds.size
    }

    /**
     * §5.198 — readiness is reset conservatively.
     *
     * Not `last_activity_at`: a restart is not activity in a room
     * (§5.124, owner D4). A server bounced every night would
     * otherwise keep abandoned rooms alive forever.
     */
    private fun clearReadiness(connection: java.sql.Connection): Int =
        connection.prepareStatement(
            """
            UPDATE room_member SET ready = FALSE
             WHERE ready
               AND room_id IN (SELECT room_id FROM room WHERE status IN ('OPEN', 'READY_FOR_MATCH'))
            """.trimIndent(),
        ).use { it.executeUpdate() }
}

/**
 * The Deck Depot telling rooms that access changed — §5.50, §5.51.
 *
 * Implements the `deck` package's listener, so the Deck Depot never
 * learns what a room is. The two cases are opposite in time and the
 * interface says why; this is where that difference turns into two
 * different calls.
 */
class RoomDeckAccess(
    private val watch: RoomDeckWatch,
    private val announcer: RoomAnnouncer,
    private val sharing: DeckRecipients,
) : DeckAccessListener {
    override suspend fun deckAccessChanged(
        deckId: UUID,
        beingDeleted: Boolean,
    ) {
        val changed =
            if (beingDeleted) {
                // By deck id, before the row goes.
                watch.releaseDeck(deckId)
            } else {
                // By user, after the revocation: `canUseDeck` now
                // answers no for exactly the people who lost it.
                sharing.possibleHolders(deckId).mapNotNull { watch.revalidateUser(it) }
            }

        // §5.51 — and they find out, rather than discovering it when
        // the host cannot start the match.
        for (room in changed) announcer.roomChanged(room)
    }

    // PHASE_07 §7.65 — re-sent at the same revision: a rename is not
    // a change to the room, and bumping the revision would turn away
    // a host's Start match that was already on its way.
    override suspend fun deckRenamed(deckId: UUID) {
        for (room in watch.roomsHolding(deckId)) announcer.roomChanged(room)
    }
}

/**
 * Who might have been using a deck.
 *
 * Narrow on purpose: after a revocation the share row is already
 * gone, so "who lost access" cannot be read from the shares. Every
 * member of an active room with this deck selected is the set that
 * matters, and re-checking each of them against `canUseDeck` sorts
 * the ones who still may from the ones who no longer do.
 */
class DeckRecipients(private val dataSource: DataSource) {
    fun possibleHolders(deckId: UUID): List<UUID> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT DISTINCT m.user_id
                  FROM room_member m
                  JOIN room r ON r.room_id = m.room_id
                 WHERE m.selected_deck_id = ?
                   AND r.status IN ('OPEN', 'READY_FOR_MATCH')
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, deckId)
                statement.executeQuery().use { rows ->
                    buildList { while (rows.next()) add(rows.getObject(1, UUID::class.java)) }
                }
            }
        }
}
