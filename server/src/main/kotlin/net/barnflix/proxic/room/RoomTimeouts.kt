package net.barnflix.proxic.room

import java.time.Duration
import java.time.Instant
import java.util.UUID

// Spec 0054 (owner 2026-11-03) -- how long a room in the lobby may sit.
//
// Replaces owner decision D4's 24 hours. A room in the lobby closes after
// [alone] with nothing happening while the host is by themselves (an
// invitation may be waiting), [together] once a second player is in it;
// a host offline for [away] closes it, a guest offline for [away] is taken
// out. The page warns [warning] before an idle close. A room with a game
// in it is never touched: these are lobby rules, not game rules.
//
// Server settings, so the owner can change them without a release
// (PROXIC_ROOM_ALONE_MINUTES and friends, ServerConfig).

data class RoomTimeouts(
    val alone: Duration = Duration.ofMinutes(30),
    val together: Duration = Duration.ofMinutes(120),
    val away: Duration = Duration.ofMinutes(10),
    val warning: Duration = Duration.ofMinutes(5),
) {
    /** How long this room may sit with nothing happening. */
    fun idleLimit(memberCount: Int): Duration = if (memberCount <= 1) alone else together

    companion object {
        /**
         * The settings the server started with. Set once at startup
         * (Application); the room list reads it to say when each room
         * closes, so it must match the sweep's.
         */
        @Volatile
        var active: RoomTimeouts = RoomTimeouts()
    }
}

/** What the sweep does to one room in the lobby this minute. */
sealed interface IdleStep {
    /** The host has been offline too long: the room closes. */
    data object HostAway : IdleStep

    /** A guest has been offline too long: they leave the room. */
    data class GuestAway(val userId: UUID) : IdleStep

    /** Nothing happened for [limit]: the room closes. */
    data class Idle(val limit: Duration) : IdleStep
}

/**
 * Spec 0054 -- what happens to [room] at [now]. Pure, so every row of the
 * owner's table can be tested with a clock. A room with a game in it is
 * never anything.
 */
fun idleSteps(
    room: Room,
    now: Instant,
    offlineSince: (UUID) -> Instant?,
    timeouts: RoomTimeouts,
): List<IdleStep> {
    if (room.status != RoomStatus.OPEN && room.status != RoomStatus.READY_FOR_MATCH) return emptyList()
    val gone = { userId: UUID ->
        offlineSince(userId)?.let { !it.plus(timeouts.away).isAfter(now) } ?: false
    }
    if (gone(room.hostUserId)) return listOf(IdleStep.HostAway)
    val guests = room.members.filter { !it.isHost && gone(it.userId) }
    // Taking a guest out is something happening: the clock starts again,
    // as a host-alone room, from the removal.
    if (guests.isNotEmpty()) return guests.map { IdleStep.GuestAway(it.userId) }
    val limit = timeouts.idleLimit(room.members.size)
    return if (!room.lastActivityAt.plus(limit).isAfter(now)) listOf(IdleStep.Idle(limit)) else emptyList()
}
