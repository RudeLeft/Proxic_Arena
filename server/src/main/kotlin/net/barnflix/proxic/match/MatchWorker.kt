package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.deck.DeckEntry
import org.slf4j.LoggerFactory
import java.io.File
import java.util.UUID
import java.util.concurrent.TimeUnit

// One worker process, one match — PHASE_06 §6.15, §6.17, §6.24-§6.29.
//
// Phase 0A chose ONE JVM PER MATCH with no pre-warming, and measured
// what that costs: ~611 MB flat and ~2.8 s to start. This is that
// process, and unlike CardResolver's workers it is NOT
// request-and-exit — a match lives for as long as the game does, so
// the process is held and the streams stay open.
//
// §6.24's trust boundary: the browser never speaks to this. It is a
// child process on a pipe, with no port and nothing listening.

private const val START_TIMEOUT_SECONDS = 180L

/**
 * A seat's deck, as the worker needs it.
 *
 * Card NAMES and printings, not a deck id: the worker has no
 * database and §6.107 keeps it that way. The server resolves the
 * id to a list, which is also where Phase 2's stored resolution
 * gets reused rather than re-derived.
 */
data class WorkerSeat(
    val displayName: String,
    /**
     * The identity everything downstream routes on.
     *
     * Not the display name: Arena only makes usernames unique, so
     * two players in one match may share a display name and an
     * answer routed by name could reach the wrong human.
     */
    val seatNumber: Int,
    val cards: List<DeckEntry>,
)

sealed interface WorkerStart {
    data class Running(val turn: Int) : WorkerStart

    /** §6.15 — it did not start, and this is why. */
    data class Failed(val code: String, val detail: String) : WorkerStart
}

class MatchWorker(
    private val config: ServerConfig,
    private val matchId: UUID,
    /**
     * Where a decision goes.
     *
     * Called from the pump thread, so it must return quickly: the
     * worker's stdout is not being read while this runs, and
     * behind it sits a Forge thread blocked on an answer.
     */
    private val onEvent: (WorkerEvent) -> Unit = {},
) {
    private val log = LoggerFactory.getLogger(MatchWorker::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    private var process: Process? = null
    private var toWorker: java.io.BufferedWriter? = null

    /**
     * How the start result gets back from the pump thread.
     *
     * A queue rather than a return value because of a RACE the
     * first version of this lost: the worker publishes its first
     * DECISION_REQUEST from Forge's thread the moment a priority
     * window opens, and writes GAME_STARTED from its main thread
     * just after awaitRunning returns. Those are two threads
     * behind one synchronized send, so either frame can be first.
     * The old code read exactly one frame and treated anything
     * that was not GAME_STARTED as a failed start, so a perfectly
     * good game would have been reported FAILED_STARTUP depending
     * on which thread won.
     *
     * The pump reads everything and files it by type instead.
     */
    private val startResult = java.util.concurrent.ArrayBlockingQueue<WorkerStart>(1)

    /**
     * Spawn, handshake, and start the game.
     *
     * Blocks until Forge reaches the running milestone or fails.
     * That is deliberate: the CALLER decides whether to wait on a
     * thread, and a method that returned early would hand back a
     * "running" match whose game throws a second later.
     */
    fun start(seats: List<WorkerSeat>): WorkerStart {
        val jarPath = config.forgeWorkerJar
        if (jarPath.isNullOrBlank()) {
            // §6.15 — a server with no worker cannot run matches,
            // and must say so rather than appear to start one.
            return WorkerStart.Failed("WORKER_UNCONFIGURED", "No Forge worker is configured.")
        }
        val jar = File(jarPath)
        if (!jar.isFile) {
            return WorkerStart.Failed("WORKER_MISSING", "The Forge worker jar is not there.")
        }

        val command =
            buildList {
                add(javaExecutable())
                add("-jar")
                add(jar.absolutePath)
                config.forgeResRoot?.let { add(it) }
            }

        return try {
            val started =
                ProcessBuilder(command)
                    .redirectError(stderrTarget(config.dataRoot, matchId, log))
                    .start()
            process = started
            greetAndStart(started, seats)
        } catch (e: Exception) {
            // §1.66's rule, carried here: a worker that cannot be
            // spawned is a RESULT, never an exception escaping into
            // a route.
            log.warn("match $matchId: worker could not be spawned", e)
            WorkerStart.Failed("WORKER_UNREACHABLE", e.javaClass.simpleName)
        }
    }

    private fun greetAndStart(
        started: Process,
        seats: List<WorkerSeat>,
    ): WorkerStart {
        val reader = started.inputStream.bufferedReader()
        val writer = started.outputStream.bufferedWriter()
        toWorker = writer

        // §6.26 — verify what we are talking to BEFORE trusting it
        // with a match. A worker built against a different Forge
        // would run a different game.
        val ready =
            readFrame(reader) ?: return WorkerStart.Failed(
                "WORKER_UNREACHABLE",
                "The worker said nothing.",
            )
        if (ready["type"]?.jsonPrimitive?.content != "WORKER_READY") {
            return WorkerStart.Failed("WORKER_UNREACHABLE", "The worker did not greet us.")
        }
        val commit = ready["forgeCommit"]?.jsonPrimitive?.content
        if (commit != BuildInfo.FORGE_COMMIT) {
            // Not a warning. A mismatch here means the match would
            // be played under rules the server does not think it
            // pinned.
            return WorkerStart.Failed(
                "WORKER_INCOMPATIBLE",
                "The worker is built against a different Forge.",
            )
        }

        // The pump starts BEFORE the request, so nothing the
        // worker says in reply can be missed.
        startPump(reader)

        send(startGameFrame(matchId, seats))

        return startResult.poll(START_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            ?: WorkerStart.Failed("GAME_START_TIMEOUT", "Forge did not start a game in time.")
    }

    /**
     * Read the worker's stdout for as long as it lives.
     *
     * One thread per match, daemon, named for thread dumps. It
     * does no work beyond parsing and handing off: a slow consumer
     * here stops the server reading the pipe, the pipe's buffer
     * fills, and Forge blocks on its own println -- a deadlock
     * that would look like "the game froze".
     */
    private fun startPump(reader: java.io.BufferedReader) {
        val thread =
            Thread({
                runCatching { reader.forEachLine { line -> dispatch(line) } }
                    .onFailure { log.warn("match $matchId: reading the worker stopped", it) }
                // The worker died without answering. Nobody should
                // be left waiting on the start queue for three
                // minutes to find that out.
                startResult.offer(
                    WorkerStart.Failed("WORKER_UNREACHABLE", "The worker stopped talking."),
                )
                // And if it was already RUNNING, that offer goes
                // nowhere -- nobody is polling any more. §6.154 is
                // a separate event for exactly that case.
                raise(WorkerEvent.Stopped)
            }, "proxic-match-pump-$matchId")
        thread.isDaemon = true
        thread.start()
    }

    private fun dispatch(line: String) {
        // Forge's own chatter ("Read cards: 33980 files") shares
        // this stream, so a line that is not a frame is skipped
        // rather than treated as a malformed one.
        if (!line.trimStart().startsWith("{")) return
        val frame =
            runCatching { json.parseToJsonElement(line) as JsonObject }.getOrNull() ?: return

        when (frame["type"]?.jsonPrimitive?.content) {
            "GAME_STARTED" ->
                startResult.offer(WorkerStart.Running(frame["turn"]?.jsonPrimitive?.int ?: 0))

            "DECISION_REQUEST" ->
                readDecisionFrame(frame)?.let { raise(WorkerEvent.Decision(it)) }

            "GAME_ENDED" ->
                readOutcomeFrame(frame)?.let { raise(WorkerEvent.Ended(it)) }

            "DECISION_ACCEPTED" ->
                readDecisionId(frame)?.let { raise(WorkerEvent.Answered(it)) }

            "ERROR" -> {
                val code = frame["errorCode"]?.jsonPrimitive?.content ?: "GAME_START_FAILED"
                if (code == "DECISION_REFUSED") {
                    // The GATE's verdict, which outranks the
                    // server's pre-filter: only the gate can see
                    // whether this is still the pending decision.
                    readDecisionId(frame)?.let { id ->
                        raise(WorkerEvent.Refused(id, readRefusal(frame)))
                    }
                    return
                }
                // A safe application-level message. The worker's
                // detail is a class name, never a stack trace, and
                // nothing from Forge's internals travels further
                // than this log line.
                val detail = frame["detail"]?.jsonPrimitive?.content ?: "unknown"
                log.warn("match $matchId: worker error $code $detail")
                // Only meaningful while a start is outstanding;
                // offer() on a full queue is a no-op, which is
                // exactly right once the game is running.
                startResult.offer(WorkerStart.Failed(code, detail))
            }

            else -> Unit
        }
    }

    private fun raise(event: WorkerEvent) {
        runCatching { onEvent(event) }
            .onFailure { log.warn("match $matchId: event not delivered", it) }
    }

    /**
     * Forward an answer the server has already authorised.
     *
     * `seat` is the server's conclusion about who is allowed to
     * answer, never anything the browser said. The worker checks
     * it again at the gate, which is not redundancy for its own
     * sake: the gate is the only thing that can see whether the
     * decision is still the pending one.
     */
    fun answer(
        decisionId: Long,
        seat: Int,
        stateVersion: Long,
        actionId: String?,
    ): Boolean =
        runCatching {
            send(decisionResponseFrame(decisionId, seat, stateVersion, actionId))
            true
        }.getOrElse {
            log.warn("match $matchId: could not send an answer", it)
            false
        }

    @Synchronized
    private fun send(frame: JsonObject) {
        val writer = toWorker ?: error("the worker is not started")
        writer.write(frame.toString())
        writer.newLine()
        writer.flush()
    }

    /** Is the process still there? §6.17's RUNNING depends on it. */
    fun isAlive(): Boolean = process?.isAlive == true

    /**
     * §6.162 — stop this match without touching any other.
     *
     * destroyForcibly rather than destroy: a JVM inside a Forge
     * game is not reliably interruptible, and a terminate that
     * leaves a 611 MB process running is not a terminate.
     */
    fun stop() {
        process?.let { running ->
            runCatching {
                running.destroyForcibly()
                running.waitFor(10, TimeUnit.SECONDS)
            }
        }
        process = null
    }

    private fun readFrame(
        reader: java.io.BufferedReader,
        timeoutSeconds: Long = 60,
    ): JsonObject? {
        val deadline = System.currentTimeMillis() + timeoutSeconds * 1000
        while (System.currentTimeMillis() < deadline) {
            if (!reader.ready()) {
                if (process?.isAlive != true) return null
                Thread.sleep(50)
                continue
            }
            val line = reader.readLine() ?: return null
            // The worker's stdout also carries Forge's own chatter
            // ("Read cards: 33980 files"), so a line that is not a
            // frame is skipped rather than treated as a malformed
            // answer.
            if (!line.trimStart().startsWith("{")) continue
            return runCatching { json.parseToJsonElement(line) as JsonObject }.getOrNull()
                ?: continue
        }
        return null
    }
}

// Not class members: these touch nothing the worker owns, and
// detekt counts what a class does. A process launcher that also
// knows how to spell java.exe is two jobs.

private fun javaExecutable(): String {
    val home = System.getProperty("java.home")
    val candidate = File(home, if (isWindows()) "bin/java.exe" else "bin/java")
    return if (candidate.isFile) candidate.absolutePath else "java"
}

private fun isWindows(): Boolean = System.getProperty("os.name").orEmpty().startsWith("Windows", ignoreCase = true)

/**
 * §6.155 — where the worker's stderr goes.
 *
 * NOT /dev/null, which is where it went until a real game
 * stopped mid-turn and the only evidence of why had already
 * been thrown away. Forge's own stack traces and the
 * adapter's "[STUB REACHED] PlayerController.<method>" lines
 * are written there, and §6.106 requires exact evidence to
 * be recorded for future implementation.
 *
 * One file per match, named by match id, so a failure can be
 * read without untangling three concurrent games. Falls back
 * to discarding if the directory cannot be made: a worker
 * that refused to start because a log file could not be
 * opened would be a worse failure than the one this exists
 * to diagnose.
 */
private fun stderrTarget(
    dataRoot: String,
    matchId: UUID,
    log: org.slf4j.Logger,
): ProcessBuilder.Redirect =
    runCatching {
        val directory = File(dataRoot, "match-logs")
        directory.mkdirs()
        ProcessBuilder.Redirect.to(File(directory, "$matchId.log"))
    }.getOrElse {
        log.warn("match $matchId: no worker log; stderr is being discarded", it)
        ProcessBuilder.Redirect.DISCARD
    }
