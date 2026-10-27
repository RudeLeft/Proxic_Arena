package net.barnflix.proxic.hall

import java.time.Duration
import java.time.Instant
import java.util.UUID

// The Champion's Belt — spec 0018 H4, H7.
//
// One title that changes hands in a single game, so a player who seldom
// plays can still hold something. From BELT_START it belongs to spec
// 0011's champion (the most wins before then). Whoever beats the holder
// in a finished game takes it; a win by the holder is a defence. A
// holder who plays no finished game for 14 days hands it to the season
// leader at that moment, so it never sits with somebody who has gone.

enum class BeltChange { TAKEN, VACATED }

data class BeltEvent(
    val at: Instant,
    val change: BeltChange,
    val from: UUID?,
    val to: UUID?,
)

data class BeltState(
    val holder: UUID?,
    val since: Instant?,
    val defences: Int,
    val events: List<BeltEvent>,
)

class Belt(
    private val games: List<HallGame>,
    private val seasons: Seasons,
    private val counted: (UUID) -> Boolean,
) {
    private var holder: UUID? = null
    private var since: Instant? = null
    private var defences = 0
    private val events = mutableListOf<BeltEvent>()
    private val lastPlayed = HashMap<UUID, Instant>()

    fun at(now: Instant): BeltState {
        holder = firstHolder()
        since = holder?.let { START }
        for (game in games.filter { !it.endedAt.isBefore(START) && !it.endedAt.isAfter(now) }) {
            vacateIfIdle(game.endedAt)
            play(game)
        }
        vacateIfIdle(now)
        return BeltState(holder, since, defences, events.toList())
    }

    /** Spec 0011's champion before the Belt began: most wins, then fewer games, then first there. */
    private fun firstHolder(): UUID? {
        val before = games.filter { it.endedAt.isBefore(START) }
        val wins = before.mapNotNull { it.winner?.userId }.groupingBy { it }.eachCount()
        val played = before.flatMap { game -> game.seats.map { it.userId } }.groupingBy { it }.eachCount()
        val lastWin = before.mapNotNull { game -> game.winner?.let { it.userId to game.endedAt } }.toMap()
        return wins.keys
            .filter(counted)
            .sortedWith(
                compareByDescending<UUID> { wins.getValue(it) }
                    .thenBy { played.getValue(it) }
                    .thenBy { lastWin.getValue(it) }
                    .thenBy { it },
            ).firstOrNull()
    }

    private fun play(game: HallGame) {
        for (seat in game.seats) lastPlayed[seat.userId] = game.endedAt
        val winner = game.winner?.userId ?: return
        val current = holder
        when {
            current == null -> take(winner, game.endedAt, BeltChange.TAKEN)
            current == winner -> defences++
            game.seatOf(current) != null -> take(winner, game.endedAt, BeltChange.TAKEN)
        }
    }

    /** Hands an idle holder's Belt to the season leader, as often as idleness says (nobody may be ranked). */
    private fun vacateIfIdle(now: Instant) {
        while (true) {
            val current = holder ?: return
            val active = listOfNotNull(since, lastPlayed[current]).maxOrNull() ?: return
            val due = active.plus(IDLE)
            if (due.isAfter(now)) return
            // The leader when it fell due; if nobody had played that season
            // yet, the leader now. With nobody at all, it stays for now.
            val (leader, at) =
                leaderAt(due, current)?.let { it to due }
                    ?: leaderAt(now, current)?.let { it to now }
                    ?: return
            take(leader, at, BeltChange.VACATED)
        }
    }

    /** The season's leader at [at], other than [holder]: the best rating among those who have played. */
    private fun leaderAt(
        at: Instant,
        holder: UUID,
    ): UUID? = seasons.table(seasons.monthOf(at), at).ranked(1, counted).firstOrNull { it.userId != holder }?.userId

    private fun take(
        to: UUID,
        at: Instant,
        change: BeltChange,
    ) {
        events += BeltEvent(at, change, holder, to)
        holder = to
        since = at
        defences = 0
    }

    companion object {
        /** When the Belt began (spec 0018's release). */
        val START: Instant = Instant.parse("2026-10-27T00:00:00Z")

        /** A holder who plays nothing for this long hands it on (owner H7). */
        val IDLE: Duration = Duration.ofDays(14)
    }
}
