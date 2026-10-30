package net.barnflix.proxic.report

import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.AppenderBase
import net.barnflix.proxic.LogContext
import java.time.Instant
import java.util.ArrayDeque

/**
 * Spec 0039 — the server's recent log lines, kept in memory so a report
 * can carry the ones about its game and its player.
 *
 * The lines already carry their match and player (LogContext, §1.41);
 * they only went to the container's output, where a report could not
 * reach them. This keeps the newest [CAPACITY] of them, oldest dropped
 * first. Registered in logback.xml beside STDOUT.
 */
class RecentLogLines : AppenderBase<ILoggingEvent>() {
    override fun append(event: ILoggingEvent) {
        val mdc = event.mdcPropertyMap
        val line =
            Line(
                at = event.timeStamp,
                matchId = mdc[LogContext.MATCH_ID],
                playerId = mdc[LogContext.PLAYER_ID],
                text =
                    buildString {
                        append(Instant.ofEpochMilli(event.timeStamp)).append(' ')
                        append(event.level).append(' ')
                        append(event.loggerName.substringAfterLast('.')).append(" - ")
                        append(event.formattedMessage)
                        event.throwableProxy?.let { append(" [${it.className}: ${it.message}]") }
                    },
            )
        synchronized(lines) {
            lines.addLast(line)
            while (lines.size > CAPACITY) lines.removeFirst()
        }
    }

    data class Line(val at: Long, val matchId: String?, val playerId: String?, val text: String)

    companion object {
        const val CAPACITY = 20_000
        private val lines = ArrayDeque<Line>()

        /** The kept lines about this match or this player, since [sinceMillis], oldest first. */
        fun about(
            matchId: String?,
            playerId: String,
            sinceMillis: Long,
        ): List<String> =
            synchronized(lines) {
                lines
                    .filter { it.at >= sinceMillis }
                    .filter { it.playerId == playerId || (matchId != null && it.matchId == matchId) }
                    .map { it.text }
            }

        /** For tests: a line as if logged. */
        internal fun add(line: Line) =
            synchronized(lines) {
                lines.addLast(line)
                while (lines.size > CAPACITY) lines.removeFirst()
            }
    }
}
