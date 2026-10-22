package net.barnflix.proxic.match

import org.slf4j.Logger
import java.io.File
import java.io.Writer
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.zip.GZIPOutputStream

// The game record -- PHASE_07 §7.56, P7-U.
//
// Every frame between the server and a match's worker, in order, with
// the milliseconds since the match started: every question to whom
// with every option, every answer and whether it was taken (the
// worker's DECISION_ACCEPTED or its refusal, and the server's own
// refusals, written as notes), every snapshot each seat was sent,
// Forge's game log (GAME_LOG frames) and the timings. The worker's
// stderr stays where Phase 6 put it, beside this.
//
// It holds BOTH players' hidden information, so nothing here is ever
// sent to a player: the only way out is the administrator's download
// (AdminRoutes). It is the production equivalent of the Mechanics Lab
// traces that found most of Phase 6's bugs.
//
// One gzip file per match. Each line is flushed as it is written, so a
// match whose server died still has its record up to that moment.

/** Where match records live, and how long they are kept. */
class GameRecords(
    dataRoot: String,
    /** §7.56 — "a bounded, configurable period" (PROXIC_MATCH_RECORD_DAYS). */
    val keep: Duration = Duration.ofDays(DEFAULT_DAYS),
) {
    val directory = File(dataRoot, "match-records")

    fun fileFor(matchId: UUID): File = File(directory, "$matchId.jsonl.gz")

    /** Records older than [keep], deleted. Returns how many went. */
    fun sweep(now: Instant = Instant.now()): Int {
        val cutoff = now.minus(keep).toEpochMilli()
        val old = directory.listFiles { file -> file.name.endsWith(".jsonl.gz") && file.lastModified() < cutoff }
        return old.orEmpty().count { it.delete() }
    }

    companion object {
        const val DEFAULT_DAYS = 30L
    }
}

/** One match's record. Never throws: a record that cannot be written must not stop a game. */
class GameRecord private constructor(
    private val writer: Writer?,
) {
    private val started = System.nanoTime()

    /** A frame the worker sent, exactly as it arrived. */
    fun fromWorker(frameJson: String) = write("worker", frameJson)

    /** A frame the server sent the worker. */
    fun toWorker(frameJson: String) = write("server", frameJson)

    /** Something the server decided without the worker -- a refused answer. */
    fun note(noteJson: String) = write("note", noteJson)

    @Synchronized
    fun close() {
        runCatching { writer?.close() }
    }

    @Synchronized
    private fun write(
        from: String,
        json: String,
    ) {
        val out = writer ?: return
        val ms = (System.nanoTime() - started) / NANOS_PER_MILLI
        runCatching {
            out.write("{\"ms\":$ms,\"from\":\"$from\",\"frame\":$json}\n")
            out.flush()
        }
    }

    companion object {
        private const val NANOS_PER_MILLI = 1_000_000L

        /** A record for this match, or one that writes nothing if the file cannot be made. */
        fun open(
            records: GameRecords?,
            matchId: UUID,
            log: Logger,
        ): GameRecord {
            if (records == null) return GameRecord(null)
            val writer =
                runCatching {
                    records.directory.mkdirs()
                    // syncFlush: each flush() reaches the file, so a crash
                    // loses at most the line being written.
                    GZIPOutputStream(records.fileFor(matchId).outputStream(), true).bufferedWriter()
                }.onFailure { log.warn("match $matchId: no game record; it is not being kept", it) }
                    .getOrNull()
            return GameRecord(writer)
        }
    }
}
