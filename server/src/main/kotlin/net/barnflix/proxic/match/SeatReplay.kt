package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.longOrNull

// P11-D6 (spec 0119, catch-up after a stall; owner 2026-11-26, "Approve both").
//
// A page whose connection dropped comes back saying which board it holds
// (`?resume=<gameEpoch>.<stateRevision>`, its delta base). Before this, a
// reconnect was always sent the seat's latest board whole, with the whole
// play log, and every moment in between was lost: the table jumped.
//
// So each seat keeps the last [REPLAY_KEPT] boards it was sent, and the steps
// between them, AS THEY WERE SENT: the hub's own messages (one messageId each,
// stamped `sentAt` once), each board after the worker's HiddenIds and the
// pictures (MatchArt.annotate), with that round's play log lines only. A
// resume finds the page's board among them and sends the ones after it, in
// order, through the new connection's BoardStream (the first whole: a new
// connection has no base; then deltas, D4's one rule). The page replays them
// (catchUp.ts), or jumps to now past its limit.
//
// Hidden information (P11-R4): a seat's list holds only messages that seat
// was sent; a resume reads only its own seat's list (MatchSocket: the seat is
// the session's, never the page's). The public view's list is the
// spectators'. Nothing is built from the whole game or another seat's view.
// Kept across Karn's restart (each board has its own gameEpoch); dropped with
// the match (it lives in LiveMatch).

/** P11-D6 -- how many boards each seat keeps for a resume (spec 0119: 40; the page's limit is 20). */
const val REPLAY_KEPT = 40

/** Where a resume starts: the board the page holds, by game and revision. */
data class ResumePoint(
    val gameEpoch: Long,
    val stateRevision: Long,
) {
    companion object {
        /**
         * The socket address's `resume=<gameEpoch>.<stateRevision>`, or null
         * when absent or malformed (two whole numbers, nothing else). A
         * number is only ever used to choose among this seat's own kept
         * boards (§6.100): a wrong one costs the page a whole board.
         */
        fun parse(text: String?): ResumePoint? {
            if (text == null || text.length > MAX_RESUME_TEXT) return null
            val parts = text.split('.')
            if (parts.size != 2 || parts.any { part -> part.isEmpty() || !part.all(Char::isDigit) }) return null
            val epoch = parts[0].toLongOrNull() ?: return null
            val revision = parts[1].toLongOrNull() ?: return null
            return ResumePoint(epoch, revision)
        }

        private const val MAX_RESUME_TEXT = 40
    }
}

/** What a resume sends, chosen from the seat's kept messages. */
sealed interface Resume {
    /** The page's board was kept and newer messages follow it: MATCH_CATCHUP, then [after], oldest first. */
    data class Catchup(
        val from: ResumePoint,
        val after: List<JsonObject>,
    ) : Resume

    /** The page holds the newest board this seat was sent: no board at all. */
    data object Newest : Resume

    /** Not among the kept boards (too old, another game, never sent, malformed): today's whole board. */
    data object Whole : Resume
}

/**
 * Each seat's last [kept] boards and the steps between them, as sent (see the
 * file comment). Guarded by itself: the pump keeps and sends under this lock
 * (MatchDecisions), and a resuming connection registers and reads under it
 * (MatchSocket), so no live message can fall between what a resume reads and
 * what reaches the new connection afterwards.
 */
class SeatReplay(
    private val kept: Int = REPLAY_KEPT,
) {
    private class Entry(
        val message: JsonObject,
        val board: ResumePoint?,
    )

    private val bySeat = HashMap<Int, ArrayDeque<Entry>>()

    /** Keep [message] (a MATCH_SNAPSHOT or MATCH_STEP this seat was sent). */
    fun keep(
        seat: Int,
        message: JsonObject,
    ) = synchronized(this) {
        val list = bySeat.getOrPut(seat) { ArrayDeque() }
        list.addLast(Entry(message, boardOf(message)))
        // At most [kept] boards: the oldest go, with the steps before the first kept one.
        while (list.count { it.board != null } > kept || (list.isNotEmpty() && list.first().board == null)) {
            list.removeFirst()
        }
    }

    /** What a resume from [point] is sent, from [seat]'s own list only. */
    fun resume(
        seat: Int,
        point: ResumePoint?,
    ): Resume =
        synchronized(this) {
            val list = bySeat[seat] ?: return Resume.Whole
            if (point == null) return Resume.Whole
            val at = list.indexOfLast { it.board == point }
            when {
                at < 0 -> Resume.Whole
                at == list.size - 1 -> Resume.Newest
                else -> Resume.Catchup(point, list.subList(at + 1, list.size).map { it.message })
            }
        }

    /** How many messages (boards and steps) [seat] keeps now: tests and the log. */
    fun size(seat: Int): Int = synchronized(this) { bySeat[seat]?.size ?: 0 }

    private fun boardOf(message: JsonObject): ResumePoint? {
        if ((message["type"] as? JsonPrimitive)?.content != SNAPSHOT_TYPE) return null
        val state = message["state"] as? JsonObject ?: return null
        val epoch = (state["gameEpoch"] as? JsonPrimitive)?.longOrNull ?: return null
        val revision = (state["stateRevision"] as? JsonPrimitive)?.longOrNull ?: return null
        return ResumePoint(epoch, revision)
    }
}
