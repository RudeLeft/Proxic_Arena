package net.barnflix.proxic.admin

import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondFile
import kotlinx.serialization.Serializable
import net.barnflix.proxic.ErrorResponse
import net.barnflix.proxic.match.GameRecords
import java.util.UUID
import javax.sql.DataSource

// Game records, for an administrator — PHASE_07 §7.56, P7-U.
//
// The recent matches, each with its record if one is still kept, and
// the record itself as a download. A record holds BOTH players' hidden
// information, which is exactly why this is the only way out of the
// server for it: administrators only, never a player.

@Serializable
data class AdminMatchView(
    val matchId: String,
    val status: String,
    val createdAt: String,
    val endedAt: String?,
    /** "RudeLeft vs Pat", in seat order. */
    val players: String,
    /** The record's size in bytes; null when none is kept (too old, or never written). */
    val recordBytes: Long?,
    /** How it ended, in a line: Forge's result, or why it stopped. Admin only. */
    val ending: String? = null,
)

@Serializable
data class AdminMatchesResponse(val matches: List<AdminMatchView>, val keepDays: Long)

class AdminMatches(
    private val dataSource: DataSource,
    private val records: GameRecords,
) {
    /** The most recent matches, newest first. */
    fun list(limit: Int = RECENT): List<AdminMatchView> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT m.match_id, m.status, m.created_at, m.ended_at,
                       m.result_summary, m.failure_code, m.failure_detail,
                       string_agg(p.display_name_snapshot, ' vs ' ORDER BY p.seat_number) AS players
                  FROM match m
                  LEFT JOIN match_participant p ON p.match_id = m.match_id
                 GROUP BY m.match_id
                 ORDER BY m.created_at DESC
                 LIMIT ?
                """.trimIndent(),
            ).use { statement ->
                statement.setInt(1, limit)
                statement.executeQuery().use { rows ->
                    buildList {
                        while (rows.next()) {
                            val id = rows.getObject("match_id", UUID::class.java)
                            val file = records.fileFor(id)
                            add(
                                AdminMatchView(
                                    matchId = id.toString(),
                                    status = rows.getString("status"),
                                    createdAt = rows.getTimestamp("created_at").toInstant().toString(),
                                    endedAt = rows.getTimestamp("ended_at")?.toInstant()?.toString(),
                                    players = rows.getString("players").orEmpty(),
                                    recordBytes = file.takeIf { it.isFile }?.length(),
                                    ending =
                                        endingOf(
                                            rows.getString("status"),
                                            rows.getString("result_summary"),
                                            rows.getString("failure_code"),
                                            rows.getString("failure_detail"),
                                        ),
                                ),
                            )
                        }
                    }
                }
            }
        }

    val keepDays: Long get() = records.keep.toDays()

    /** The record as a download, or 404 when none is kept. */
    suspend fun download(
        call: ApplicationCall,
        matchId: UUID,
    ) {
        val file = records.fileFor(matchId)
        if (!file.isFile) {
            call.respond(
                HttpStatusCode.NotFound,
                ErrorResponse("NO_RECORD", "No record is kept for that match.", null),
            )
            return
        }
        call.response.header(
            HttpHeaders.ContentDisposition,
            ContentDisposition.Attachment
                .withParameter(ContentDisposition.Parameters.FileName, "proxic-match-$matchId.jsonl.gz")
                .toString(),
        )
        call.response.header(HttpHeaders.ContentType, ContentType.Application.GZip.toString())
        call.respondFile(file)
    }

    internal companion object {
        private const val RECENT = 50

        /**
         * How a match ended, for the Admin list (owner 2026-10-22): a game
         * that stopped at Eldrazi Monument's trigger said only "Stopped".
         */
        fun endingOf(
            status: String,
            summary: String?,
            failureCode: String?,
            failureDetail: String?,
        ): String? =
            when (status) {
                "ENDED" -> summary
                "FAILED_RUNTIME" -> "Stopped: " + (failureDetail ?: failureCode ?: "no reason recorded")
                "FAILED_STARTUP" -> "Did not start: " + (failureCode ?: "no reason recorded")
                else -> null
            }
    }
}
