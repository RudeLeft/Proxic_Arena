package net.barnflix.proxic.report

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import net.barnflix.proxic.match.GameRecords
import java.io.File
import java.io.OutputStream
import java.util.Base64
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.sql.DataSource

// Bug reports and ideas — spec 0039.
//
// A player's report is a row (what they answered, what their page knew)
// and a folder of files beside it: the picture, the page's log, and
// COPIES of the game record, the server's lines and the engine's errors
// as they were when it was sent, so the report outlives the 30-day
// record sweep. The game record holds both players' hidden cards, so
// none of this ever goes back to a player: administrators only, as game
// records are (§7.56).

/** What the page sends. */
@Serializable
data class ReportSubmission(
    /** "PROBLEM" or "IDEA". */
    val kind: String = "",
    /** The form's answers, as the page names them; strings, or lists of strings. */
    val answers: JsonObject = JsonObject(emptyMap()),
    /** What the page knew: the page, the game and its moment, version, browser, screen. */
    val context: JsonObject = JsonObject(emptyMap()),
    /** The game being played, when there is one. */
    val matchId: String? = null,
    /** Attach that game's record (the player may untick it). */
    val includeRecord: Boolean = true,
    /** The picture, as a data URL ("data:image/png;base64,..."), or none. */
    val picture: String? = null,
    /** The page's log: one JSON object a line. */
    val browserLog: String? = null,
)

@Serializable
data class ReportSent(val number: Int)

@Serializable
data class ReportListItem(
    val number: Int,
    val kind: String,
    val status: String,
    val summary: String,
    val username: String,
    val createdAt: String,
    /** "In a game · turn 7 · Main 1", "Lobby"... */
    val where: String,
    val attached: List<String>,
)

@Serializable
data class ReportsResponse(val reports: List<ReportListItem>, val newCount: Int)

@Serializable
data class ReportFile(val name: String, val bytes: Long)

@Serializable
data class ReportDetail(
    val number: Int,
    val kind: String,
    val status: String,
    val summary: String,
    val username: String,
    val createdAt: String,
    val answers: JsonObject,
    val context: JsonObject,
    val matchId: String?,
    val adminNote: String,
    val files: List<ReportFile>,
)

@Serializable
data class ReportChange(val status: String? = null, val adminNote: String? = null)

/** Why a submission was refused, in the player's words. */
class ReportRefused(message: String) : Exception(message)

/** Refused, in the player's words, unless [ok]. */
private fun check(
    ok: Boolean,
    message: String,
) {
    if (!ok) throw ReportRefused(message)
}

/** A submission, checked: what is saved. */
internal class ValidReport(
    val kind: String,
    val summary: String,
    val answers: JsonObject,
    val picture: ByteArray?,
    val log: String?,
)

/** A new report's row. */
internal data class NewReport(
    val userId: UUID,
    val kind: String,
    val summary: String,
    val answers: JsonObject,
    val context: JsonObject,
    val matchId: UUID?,
)

class Reports(
    private val dataSource: DataSource,
    dataRoot: String,
    private val records: GameRecords,
) {
    private val rows = ReportRows(dataSource)
    private val folder = File(dataRoot, "bug-reports")
    private val engineLogs = File(dataRoot, "match-logs")

    fun folderOf(number: Int): File = File(folder, number.toString())

    /** Save a player's report and its files; its number. Refused whole, never half-saved. */
    fun submit(
        userId: UUID,
        submission: ReportSubmission,
        now: Long = System.currentTimeMillis(),
    ): Int {
        val valid = validated(submission)
        val matchId = submission.matchId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
        // Only a game the reporter played in: anything else is not theirs to point at.
        val game = matchId?.takeIf { rows.playedIn(userId, it) }
        val number = rows.insert(NewReport(userId, valid.kind, valid.summary, valid.answers, submission.context, game))
        try {
            val dir = folderOf(number).apply { mkdirs() }
            val attached = mutableListOf<String>()
            valid.picture?.let {
                File(dir, PICTURE).writeBytes(it)
                attached += "picture"
            }
            valid.log?.let {
                File(dir, BROWSER_LOG).writeText(it)
                attached += "log"
            }
            if (game != null && valid.kind == "PROBLEM") attached += copyGame(dir, game, submission.includeRecord)
            val lines = RecentLogLines.about(game?.toString(), userId.toString(), now - SERVER_WINDOW_MS)
            if (lines.isNotEmpty()) File(dir, SERVER_LOG).writeText(lines.joinToString("\n", postfix = "\n"))
            rows.setAttached(number, attached)
            return number
        } catch (e: java.io.IOException) {
            delete(number)
            throw ReportRefused("Your report could not be saved. Try again.").also { it.initCause(e) }
        }
    }

    /** The game record (when the player left it ticked) and the engine's errors, copied. */
    private fun copyGame(
        dir: File,
        matchId: UUID,
        includeRecord: Boolean,
    ): List<String> {
        val engine = File(engineLogs, "$matchId.log")
        if (engine.isFile && engine.length() > 0) File(dir, ENGINE_ERRORS).writeText(tail(engine))
        val record = records.fileFor(matchId)
        if (!includeRecord || !record.isFile) return emptyList()
        copyRecordSealed(record, File(dir, GAME_RECORD))
        return listOf("record")
    }

    fun list(): ReportsResponse =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT r.number, r.kind, r.status, r.summary, u.username, r.created_at, r.context, r.attached
                  FROM bug_report r JOIN app_user u ON u.user_id = r.user_id
                 ORDER BY r.created_at DESC
                 LIMIT $LIST
                """.trimIndent(),
            ).use { statement ->
                statement.executeQuery().use { rows ->
                    val items =
                        buildList {
                            while (rows.next()) {
                                add(
                                    ReportListItem(
                                        number = rows.getInt("number"),
                                        kind = rows.getString("kind"),
                                        status = rows.getString("status"),
                                        summary = rows.getString("summary"),
                                        username = rows.getString("username"),
                                        createdAt = rows.getTimestamp("created_at").toInstant().toString(),
                                        where = whereOf(contextOf(rows.getString("context"))),
                                        attached = rows.getString("attached").split(',').filter { it.isNotEmpty() },
                                    ),
                                )
                            }
                        }
                    ReportsResponse(items, items.count { it.status == "NEW" })
                }
            }
        }

    fun detail(number: Int): ReportDetail? =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                SELECT r.*, u.username FROM bug_report r JOIN app_user u ON u.user_id = r.user_id
                 WHERE r.number = ?
                """.trimIndent(),
            ).use { statement ->
                statement.setInt(1, number)
                statement.executeQuery().use { rows ->
                    if (!rows.next()) return null
                    ReportDetail(
                        number = number,
                        kind = rows.getString("kind"),
                        status = rows.getString("status"),
                        summary = rows.getString("summary"),
                        username = rows.getString("username"),
                        createdAt = rows.getTimestamp("created_at").toInstant().toString(),
                        answers = json.parseToJsonElement(rows.getString("answers")) as JsonObject,
                        context = json.parseToJsonElement(rows.getString("context")) as JsonObject,
                        matchId = rows.getObject("match_id", UUID::class.java)?.toString(),
                        adminNote = rows.getString("admin_note"),
                        files =
                            FILES.mapNotNull { name ->
                                File(folderOf(number), name).takeIf { it.isFile }?.let { ReportFile(name, it.length()) }
                            },
                    )
                }
            }
        }

    /** Status and the private note; false when there is no such report or the status is not one. */
    fun change(
        number: Int,
        change: ReportChange,
    ): Boolean {
        if (change.status != null && change.status !in STATUSES) return false
        val note = change.adminNote?.take(MAX_ANSWER)
        return dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                UPDATE bug_report SET status = COALESCE(?, status), admin_note = COALESCE(?, admin_note)
                 WHERE number = ?
                """.trimIndent(),
            ).use {
                it.setString(1, change.status)
                it.setString(2, note)
                it.setInt(3, number)
                it.executeUpdate() == 1
            }
        }
    }

    /** The row and its folder; false when there was none. */
    fun delete(number: Int): Boolean {
        folderOf(number).deleteRecursively()
        return dataSource.connection.use { connection ->
            connection.prepareStatement("DELETE FROM bug_report WHERE number = ?").use {
                it.setInt(1, number)
                it.executeUpdate() == 1
            }
        }
    }

    /** One of the report's files, by its known name only. */
    fun file(
        number: Int,
        name: String,
    ): File? = name.takeIf { it in FILES }?.let { File(folderOf(number), it) }?.takeIf { it.isFile }

    /** The zip: README.md first, the report as data, then every file it has. */
    fun zip(
        number: Int,
        out: OutputStream,
    ): Boolean {
        val report = detail(number) ?: return false
        ZipOutputStream(out).use { zip ->
            fun put(
                name: String,
                bytes: ByteArray,
            ) {
                zip.putNextEntry(ZipEntry("proxic-report-$number/$name"))
                zip.write(bytes)
                zip.closeEntry()
            }
            put("README.md", ReportReadme.of(report).toByteArray())
            put("report.json", json.encodeToString(ReportDetail.serializer(), report).toByteArray())
            for (file in report.files) put(file.name, File(folderOf(number), file.name).readBytes())
        }
        return true
    }

    companion object {
        val KINDS = setOf("PROBLEM", "IDEA")
        val STATUSES = setOf("NEW", "SEEN", "FIXED", "WONT_FIX", "PLANNED")
        const val PICTURE = "screen.png"
        const val BROWSER_LOG = "browser-log.jsonl"
        const val GAME_RECORD = "game-record.jsonl.gz"
        const val SERVER_LOG = "server-log.txt"
        const val ENGINE_ERRORS = "engine-errors.txt"
        val FILES = listOf(PICTURE, BROWSER_LOG, GAME_RECORD, SERVER_LOG, ENGINE_ERRORS)

        private const val MAX_ANSWER = 4_000
        private const val MAX_ANSWERS = 30
        private const val MAX_CONTEXT = 8_000
        private const val MAX_LOG = 3_000_000
        private const val MAX_PICTURE = 6_000_000
        private const val MAX_ENGINE = 2_000_000L
        private const val SUMMARY = 200
        private const val LIST = 200
        private const val SERVER_WINDOW_MS = 30 * 60 * 1000L

        private val json = Json { ignoreUnknownKeys = true }

        /** A submission checked whole: refused, in the player's words, or what to save. */
        internal fun validated(submission: ReportSubmission): ValidReport {
            val kind = submission.kind.uppercase()
            check(kind in KINDS, "That is not a kind of report.")
            val answers = cleaned(submission.answers)
            val key = if (kind == "PROBLEM") "happened" else "title"
            val summary = (answers[key] as? JsonPrimitive)?.contentOrNull?.trim().orEmpty()
            check(summary.isNotEmpty(), if (kind == "PROBLEM") "Say what happened." else "Give your idea a few words.")
            check(submission.context.toString().length <= MAX_CONTEXT, "Too much was sent with it.")
            val log = submission.browserLog?.takeIf { it.isNotBlank() }
            check(log == null || log.length <= MAX_LOG, "The page's log is too large to send.")
            return ValidReport(kind, summary.take(SUMMARY), answers, submission.picture?.let(::pictureBytes), log)
        }

        /** Strings (and lists of them) only, each bounded. */
        internal fun cleaned(answers: JsonObject): JsonObject {
            check(answers.size <= MAX_ANSWERS, "Too many answers.")
            return JsonObject(
                answers.mapValues { (_, value) ->
                    when (value) {
                        is JsonPrimitive -> JsonPrimitive((value.contentOrNull ?: "").take(MAX_ANSWER))
                        is JsonArray ->
                            JsonArray(
                                value.take(MAX_ANSWERS).map {
                                    JsonPrimitive((it as? JsonPrimitive)?.contentOrNull.orEmpty().take(MAX_ANSWER))
                                },
                            )
                        else -> throw ReportRefused("That answer is not one the form gives.")
                    }
                },
            )
        }

        /** A data URL's image, checked to be a PNG or JPEG, bounded. */
        internal fun pictureBytes(dataUrl: String): ByteArray {
            val base64 = dataUrl.substringAfter("base64,", "")
            check(base64.isNotEmpty() && base64.length <= MAX_PICTURE * 4 / 3 + 4, "That picture is too large.")
            val bytes = runCatching { Base64.getDecoder().decode(base64) }.getOrNull() ?: ByteArray(0)
            val png = bytes.size > 8 && bytes[0] == 0x89.toByte() && bytes[1] == 'P'.code.toByte()
            val jpeg = bytes.size > 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte()
            check(png || jpeg, "Pictures can be PNG or JPEG.")
            return bytes
        }

        private fun tail(file: File): String {
            val length = file.length()
            if (length <= MAX_ENGINE) return file.readText()
            java.io.RandomAccessFile(file, "r").use { raf ->
                raf.seek(length - MAX_ENGINE)
                val bytes = ByteArray(MAX_ENGINE.toInt())
                raf.readFully(bytes)
                return "… (earlier lines left out)\n" + String(bytes)
            }
        }

        private fun contextOf(text: String): JsonObject = json.parseToJsonElement(text) as JsonObject

        /** "In a game · turn 7 · Main 1", from what the page sent. */
        internal fun whereOf(context: JsonObject): String {
            fun field(key: String) = (context[key] as? JsonPrimitive)?.contentOrNull
            return listOfNotNull(field("page") ?: "Somewhere", field("turn")?.let { "turn $it" }, field("step"))
                .joinToString(" · ")
        }
    }
}

/** The rows that are not a query of the Admin page. */
private class ReportRows(
    private val dataSource: DataSource,
) {
    fun insert(report: NewReport): Int =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                """
                INSERT INTO bug_report (user_id, kind, summary, answers, context, match_id)
                VALUES (?, ?, ?, ?::jsonb, ?::jsonb, ?) RETURNING number
                """.trimIndent(),
            ).use {
                it.setObject(1, report.userId)
                it.setString(2, report.kind)
                it.setString(3, report.summary)
                it.setString(4, report.answers.toString())
                it.setString(5, report.context.toString())
                it.setObject(6, report.matchId)
                it.executeQuery().use { row ->
                    row.next()
                    row.getInt(1)
                }
            }
        }

    fun setAttached(
        number: Int,
        attached: List<String>,
    ) = dataSource.connection.use { connection ->
        connection.prepareStatement("UPDATE bug_report SET attached = ? WHERE number = ?").use {
            it.setString(1, attached.joinToString(","))
            it.setInt(2, number)
            it.executeUpdate()
        }
    }

    fun playedIn(
        userId: UUID,
        matchId: UUID,
    ): Boolean =
        dataSource.connection.use { connection ->
            connection.prepareStatement("SELECT 1 FROM match_participant WHERE match_id = ? AND user_id = ?").use {
                it.setObject(1, matchId)
                it.setObject(2, userId)
                it.executeQuery().use { row -> row.next() }
            }
        }
}
