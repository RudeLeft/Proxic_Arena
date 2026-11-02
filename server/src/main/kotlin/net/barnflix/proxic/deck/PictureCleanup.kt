package net.barnflix.proxic.deck

import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.log
import io.ktor.server.routing.Route
import io.ktor.server.routing.application
import org.slf4j.Logger
import java.io.File
import java.sql.Timestamp
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.sql.DataSource

// The weekly picture clean-up — spec 0052 (owner D4, 2026-11-01).
//
// Pictures are shared by content hash, and nothing ever deleted one:
// deleting a deck left its pictures (the foreign keys are RESTRICT and
// nothing swept), and a failed send left the ones it had stored with no
// row at all. So the art folder only grew.
//
// Once a week: a picture no deck uses (card, back face, token, art crop)
// is marked unused from that day; one used again loses the mark; one
// unused for [keep] that no running game shows is deleted, row and files.
// Files no picture row knows (a failed send) are deleted once they are
// [keep] old. A picture is never deleted while a deck uses it: its row is
// deleted first, by a statement that re-checks that, and its files only
// after; and a picture stored again since (a send of it in flight) has a
// fresh file time, which keeps it.

/** What one clean-up did. */
data class PictureCleanupReport(
    val markedUnused: Int,
    val inUseAgain: Int,
    val deleted: Int,
    val orphanFiles: Int,
    val bytesFreed: Long,
)

class PictureCleanup(
    private val dataSource: DataSource,
    private val dataRoot: File,
    /** The pictures the games now running may show (MatchRuntime). */
    private val inPlay: () -> Set<String>,
    private val clock: Clock = Clock.systemUTC(),
    private val keep: Duration = KEEP,
) {
    private val folders = listOf("original", "display", "zoom").map { File(File(dataRoot, "art"), it) }

    fun run(): PictureCleanupReport {
        val now = clock.instant()
        val (marked, again) = mark(now)
        val playing = inPlay()
        var bytes = 0L
        var deleted = 0
        for (sha in unusedSince(now.minus(keep)) - playing) {
            if (recentlyStored(sha, now)) continue
            if (deleteRow(sha)) {
                bytes += deleteFiles(sha)
                deleted++
            }
        }
        val (orphans, orphanBytes) = deleteOrphans(now, playing)
        return PictureCleanupReport(marked, again, deleted, orphans, bytes + orphanBytes)
    }

    /** Mark the pictures no deck uses; clear the mark of those used again. */
    private fun mark(now: Instant): Pair<Int, Int> =
        dataSource.connection.use { connection ->
            val again =
                connection.prepareStatement(
                    "UPDATE art_asset a SET unused_since = NULL WHERE unused_since IS NOT NULL AND $USED",
                ).use { it.executeUpdate() }
            val marked =
                connection.prepareStatement(
                    "UPDATE art_asset a SET unused_since = ? WHERE unused_since IS NULL AND NOT $USED",
                ).use { statement ->
                    statement.setTimestamp(1, Timestamp.from(now))
                    statement.executeUpdate()
                }
            marked to again
        }

    private fun unusedSince(before: Instant): Set<String> =
        dataSource.connection.use { connection ->
            connection.prepareStatement(
                "SELECT content_sha256 FROM art_asset WHERE unused_since IS NOT NULL AND unused_since < ?",
            ).use { statement ->
                statement.setTimestamp(1, Timestamp.from(before))
                statement.executeQuery().use { rows ->
                    buildSet { while (rows.next()) add(rows.getString(1)) }
                }
            }
        }

    /** The row goes only while still unused, checked in the same statement. */
    private fun deleteRow(sha: String): Boolean =
        dataSource.connection.use { connection ->
            runCatching {
                connection.prepareStatement(
                    "DELETE FROM art_asset a WHERE content_sha256 = ? AND unused_since IS NOT NULL AND NOT $USED",
                ).use { statement ->
                    statement.setString(1, sha)
                    statement.executeUpdate() == 1
                }
            }.getOrDefault(false)
        }

    /** A send of this picture in flight stores it again, which renews the original's time. */
    private fun recentlyStored(
        sha: String,
        now: Instant,
    ): Boolean = filesOf(sha).any { Instant.ofEpochMilli(it.lastModified()) > now.minus(keep) }

    private fun filesOf(sha: String): List<File> =
        folders.flatMap { folder ->
            listOf("png", "jpg").map { File(File(folder, sha.substring(0, 2)), "$sha.$it") }
        }.filter { it.isFile }

    private fun deleteFiles(sha: String): Long =
        filesOf(sha).sumOf { file ->
            val size = file.length()
            if (file.delete()) size else 0L
        }

    /** Files no picture row knows, [keep] old and not in a running game: a failed send's. */
    private fun deleteOrphans(
        now: Instant,
        playing: Set<String>,
    ): Pair<Int, Long> {
        val known = knownHashes()
        var count = 0
        var bytes = 0L
        for (folder in folders) {
            folder.walkTopDown().filter { it.isFile }.forEach { file ->
                val sha = file.name.substringBefore('.')
                val unknown = SHA.matches(sha) && sha !in known
                val old = Instant.ofEpochMilli(file.lastModified()) < now.minus(keep)
                if (unknown && sha !in playing && old) {
                    val size = file.length()
                    if (file.delete()) {
                        count++
                        bytes += size
                    }
                }
            }
        }
        return count to bytes
    }

    private fun knownHashes(): Set<String> =
        dataSource.connection.use { connection ->
            connection.prepareStatement("SELECT content_sha256 FROM art_asset").use { statement ->
                statement.executeQuery().use { rows -> buildSet { while (rows.next()) add(rows.getString(1)) } }
            }
        }

    companion object {
        /** How long a picture nothing uses is kept (owner D4). */
        val KEEP: Duration = Duration.ofDays(30)

        private val SHA = Regex("[0-9a-f]{64}")

        /** Some deck uses picture `a`: as a card, a back face, a token or an art crop. */
        private const val USED =
            "(EXISTS (SELECT 1 FROM deck_entry e WHERE e.art_sha256 = a.content_sha256)" +
                " OR EXISTS (SELECT 1 FROM deck_face_art f WHERE f.art_sha256 = a.content_sha256)" +
                " OR EXISTS (SELECT 1 FROM deck_token t WHERE t.art_sha256 = a.content_sha256)" +
                " OR EXISTS (SELECT 1 FROM deck_crop_art c WHERE c.art_sha256 = a.content_sha256))"
    }
}

/** Runs the clean-up a few minutes after start and then weekly (spec 0052, F-0052-E). */
class PictureCleanupSchedule(
    private val cleanup: PictureCleanup,
    private val log: Logger,
    private val firstMinutes: Long = FIRST_RUN_MINUTES,
    private val everyMinutes: Long = Duration.ofDays(7).toMinutes(),
) {
    private val executor: ScheduledExecutorService =
        Executors.newSingleThreadScheduledExecutor { runnable ->
            Thread(runnable, "proxic-picture-cleanup").apply { isDaemon = true }
        }

    fun start() {
        executor.scheduleWithFixedDelay(::runQuietly, firstMinutes, everyMinutes, TimeUnit.MINUTES)
    }

    fun stop() {
        executor.shutdownNow()
    }

    /** One run, logged; a failure is logged and the next week tries again. */
    fun runQuietly() {
        runCatching { cleanup.run() }
            .onSuccess { report ->
                log.info(
                    "picture clean-up: {} newly unused, {} used again, {} deleted, {} orphan files, {} KB freed",
                    report.markedUnused,
                    report.inUseAgain,
                    report.deleted,
                    report.orphanFiles,
                    report.bytesFreed / 1024,
                )
            }.onFailure { log.warn("picture clean-up failed: {}", it.toString()) }
    }

    companion object {
        const val FIRST_RUN_MINUTES = 10L
    }
}

/**
 * Start the weekly clean-up with the server and stop it with the server:
 * started beside the other upkeep, so it runs (TEST-010).
 */
fun Route.startPictureCleanup(
    dataSource: DataSource,
    dataRoot: File,
    inPlay: () -> Set<String>,
) {
    val schedule = PictureCleanupSchedule(PictureCleanup(dataSource, dataRoot, inPlay), application.log)
    schedule.start()
    application.environment.monitor.subscribe(ApplicationStopped) { schedule.stop() }
}
