package net.barnflix.proxic.room

import java.sql.Connection
import java.util.UUID

// Invalidating a match setup — PHASE_05 §5.79, §5.114, §5.125.
//
// One function, because there are three ways a setup stops being
// launchable — the host cancels (§5.117), the host closes the room
// (§5.79), the room expires (§5.125) — and all three must do the
// SAME thing. Three copies of this statement is three places for
// the next rule to be added to two of them.
//
// WHY THE SEATS GO TOO. `match_setup_player.deck_id` is ON DELETE
// RESTRICT, so a seat row holds its deck in place. That is right
// for a setup that could still launch and wrong for one that never
// will: leaving the rows behind meant a player who prepared a match
// once and cancelled it could NEVER delete that deck again. Their
// Deck Depot delete just failed, permanently, for a reason nothing
// on screen could explain.
//
// Found by the end-to-end match-setup test on its second run: the
// first run had left an invalidated setup behind, the deck could
// not be cleared, and the re-import was refused as a duplicate.
//
// A CONSUMED setup is NOT touched here, and keeps its seats. That
// is a match Phase 6 actually launched; rewriting it would be
// falsifying history, and the deck it was played with is part of
// that record.

/**
 * Invalidate this room's live setup, if it has one.
 *
 * Returns how many setups changed, which is 0 or 1 — the partial
 * unique index allows only one READY per room.
 */
internal fun invalidateReadySetups(
    connection: Connection,
    roomId: UUID,
): Int {
    // The seats first: once the header says INVALIDATED this query
    // would no longer match it, and the rows would be orphaned in
    // exactly the way that caused the bug.
    connection.prepareStatement(
        """
        DELETE FROM match_setup_player
         WHERE setup_id IN (
               SELECT setup_id FROM match_setup
                WHERE room_id = ? AND status = 'READY'
             )
        """.trimIndent(),
    ).use {
        it.setObject(1, roomId)
        it.executeUpdate()
    }

    return connection.prepareStatement(
        "UPDATE match_setup SET status = 'INVALIDATED' WHERE room_id = ? AND status = 'READY'",
    ).use {
        it.setObject(1, roomId)
        it.executeUpdate()
    }
}

/**
 * A player is gone from a room whose game was prepared (owner
 * 2026-11-04): the setup goes, nobody stays ready and the room is OPEN
 * again -- else Start match seated somebody who had left. Bumps the
 * revision and the activity stamp, so no `touch` after it.
 */
internal fun reopenAfterLeaving(
    connection: Connection,
    roomId: UUID,
) {
    invalidateReadySetups(connection, roomId)
    for (
    sql in listOf(
        "UPDATE room_member SET ready = FALSE WHERE room_id = ?",
        "UPDATE room SET status = 'OPEN', revision = revision + 1, last_activity_at = now() " +
            "WHERE room_id = ? AND status = 'READY_FOR_MATCH'",
    )
    ) {
        connection.prepareStatement(sql).use {
            it.setObject(1, roomId)
            it.executeUpdate()
        }
    }
}
