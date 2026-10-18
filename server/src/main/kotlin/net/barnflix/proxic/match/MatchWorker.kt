package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
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
) {
    private val log = LoggerFactory.getLogger(MatchWorker::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    private var process: Process? = null

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
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start()
            process = started
            handshakeAndStart(started, seats)
        } catch (e: Exception) {
            // §1.66's rule, carried here: a worker that cannot be
            // spawned is a RESULT, never an exception escaping into
            // a route.
            log.warn("match $matchId: worker could not be spawned", e)
            WorkerStart.Failed("WORKER_UNREACHABLE", e.javaClass.simpleName)
        }
    }

    private fun handshakeAndStart(
        started: Process,
        seats: List<WorkerSeat>,
    ): WorkerStart {
        val reader = started.inputStream.bufferedReader()
        val writer = started.outputStream.bufferedWriter()

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

        writer.write(startGameMessage(seats).toString())
        writer.newLine()
        writer.flush()

        val answer =
            readFrame(reader, START_TIMEOUT_SECONDS)
                ?: return WorkerStart.Failed(
                    "GAME_START_TIMEOUT",
                    "Forge did not start a game in time.",
                )

        return when (answer["type"]?.jsonPrimitive?.content) {
            "GAME_STARTED" ->
                WorkerStart.Running(answer["turn"]?.jsonPrimitive?.int ?: 0)

            else ->
                WorkerStart.Failed(
                    answer["errorCode"]?.jsonPrimitive?.content ?: "GAME_START_FAILED",
                    // §6.99 — a safe application-level message. The
                    // worker's own detail is a class name, not a
                    // stack trace, and nothing from Forge's
                    // internals travels further than this log line.
                    answer["detail"]?.jsonPrimitive?.content ?: "unknown",
                )
        }
    }

    private fun startGameMessage(seats: List<WorkerSeat>): JsonObject =
        buildJsonObject {
            put("protocolVersion", BuildInfo.PROTOCOL_VERSION)
            put("type", "START_GAME")
            put("messageId", UUID.randomUUID().toString())
            put("matchId", matchId.toString())
            putJsonArray("players") {
                seats.forEach { seat ->
                    add(
                        buildJsonObject {
                            put("displayName", seat.displayName)
                            put(
                                "cards",
                                buildJsonArray {
                                    seat.cards.forEach { card ->
                                        add(
                                            buildJsonObject {
                                                put("name", card.name)
                                                card.setCode?.let { put("set", it) }
                                                card.collectorNumber?.let { put("number", it) }
                                                put("quantity", card.quantity)
                                            },
                                        )
                                    }
                                },
                            )
                        },
                    )
                }
            }
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

    private fun javaExecutable(): String {
        val home = System.getProperty("java.home")
        val candidate = File(home, if (isWindows()) "bin/java.exe" else "bin/java")
        return if (candidate.isFile) candidate.absolutePath else "java"
    }

    private fun isWindows(): Boolean = System.getProperty("os.name").orEmpty().startsWith("Windows", ignoreCase = true)
}
