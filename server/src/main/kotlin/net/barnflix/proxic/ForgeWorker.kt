package net.barnflix.proxic

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import org.slf4j.LoggerFactory
import java.io.File
import java.util.concurrent.TimeUnit

/**
 * Forge worker lifecycle and handshake — PHASE_01 §1.65, §1.66.
 *
 * The server spawns the worker as a CHILD PROCESS and talks
 * line-delimited JSON to it. Phase 0A chose one JVM per match with no
 * pre-warming, and proved the isolation that buys: a worker killed
 * mid-run left the others untouched.
 *
 * Phase 1 does one handshake, at startup, and caches the result
 * (§1.64 — diagnostics only, no gameplay). It deliberately does NOT
 * probe per readiness request: a worker costs ~611 MB and ~2.8 s to
 * start, so a health check that spawned one would be a self-inflicted
 * load generator. Phase 6 owns per-match spawning.
 *
 * §1.66 requires the server to survive all of: worker could not
 * start, worker exited unexpectedly, worker incompatible, Forge
 * resources missing, protocol mismatch. Every one of those is a
 * [Result] here, not an exception that escapes.
 */
class ForgeWorker(private val config: ServerConfig) {

    private val log = LoggerFactory.getLogger(ForgeWorker::class.java)
    private val json = Json { ignoreUnknownKeys = true }

    sealed interface Result {
        /** No worker jar configured. Expected during Phase 1. */
        data object Unconfigured : Result

        data class Ready(
            val forgeCommit: String,
            val forgeRelease: String,
            val workerVersion: String,
            val javaVersion: String,
        ) : Result

        /** The jar is configured but not where it was said to be. */
        data object Missing : Result

        /** Spawned, but never answered, or died first. */
        data class Unreachable(val detail: String) : Result

        /**
         * It answered, and we must not use it. Kept separate from
         * [Unreachable] because the operator action is different:
         * a mismatch is "you shipped the wrong jar", not "it is down".
         */
        data class Incompatible(val detail: String) : Result

        /** It runs, but Forge's own data files are not usable. */
        data class ResourcesMissing(val detail: String) : Result
    }

    @Volatile
    private var cached: Result = Result.Unconfigured

    fun lastResult(): Result = cached

    /** The state readiness reports (§1.69 vocabulary). */
    fun state(): String = when (val result = cached) {
        is Result.Unconfigured -> "unconfigured"
        is Result.Ready -> "ok"
        is Result.Missing -> "missing"
        is Result.Unreachable -> "unreachable"
        is Result.Incompatible -> "incompatible"
        is Result.ResourcesMissing -> "resources-missing"
    }

    /**
     * Start a worker, read its WORKER_READY, shut it down again.
     *
     * Never throws. A diagnostic that can take the server down with
     * it is not a diagnostic.
     */
    fun probe(timeoutSeconds: Long = 60): Result {
        val result = runCatching { doProbe(timeoutSeconds) }
            .getOrElse { Result.Unreachable(it.javaClass.simpleName) }
        cached = result
        log.info("forge worker probe: {}", state())
        return result
    }

    private fun doProbe(timeoutSeconds: Long): Result {
        val jarPath = config.forgeWorkerJar
        if (jarPath.isNullOrBlank()) return Result.Unconfigured
        val jar = File(jarPath)
        if (!jar.isFile) return Result.Missing

        val command = buildList {
            add(javaExecutable())
            add("-jar")
            add(jar.absolutePath)
            config.forgeResRoot?.let { add(it) }
        }

        val process = ProcessBuilder(command)
            // Forge logs to stderr in the worker (it redirects its
            // own stdout away from the protocol stream). Discarding
            // it here keeps a 33,980-script load out of our log;
            // Phase 6 will want it captured per match.
            .redirectError(ProcessBuilder.Redirect.DISCARD)
            .start()

        try {
            val reader = process.inputStream.bufferedReader()
            // A worker that starts and says nothing is the failure
            // mode a naive readLine() turns into a hung server.
            val line = readLineWithTimeout(reader, process, timeoutSeconds)
                ?: return if (process.isAlive) {
                    Result.Unreachable("no WORKER_READY within ${timeoutSeconds}s")
                } else {
                    Result.Unreachable("worker exited (code ${process.exitValue()}) before handshake")
                }

            val frame = runCatching { json.parseToJsonElement(line) as JsonObject }
                .getOrNull() ?: return Result.Incompatible("first frame was not JSON")

            val type = frame["type"]?.jsonPrimitive?.content
            if (type != "WORKER_READY") {
                return Result.Incompatible("first frame was $type, not WORKER_READY")
            }

            val workerProtocol = frame["protocolVersion"]?.jsonPrimitive?.int
            if (workerProtocol != BuildInfo.PROTOCOL_VERSION) {
                return Result.Incompatible(
                    "protocol ${workerProtocol ?: "absent"}, server speaks ${BuildInfo.PROTOCOL_VERSION}"
                )
            }

            val commit = frame["forgeCommit"]?.jsonPrimitive?.content
            if (commit != BuildInfo.FORGE_COMMIT) {
                // §1.61: an unknown or mismatched Forge revision must
                // not silently become the production build. A jar
                // built months ago against another checkout is
                // otherwise indistinguishable from a current one.
                return Result.Incompatible(
                    "forge commit ${commit?.take(10) ?: "absent"}, pinned ${BuildInfo.FORGE_COMMIT.take(10)}"
                )
            }

            val resourcesUsable = frame["resourcesUsable"]?.jsonPrimitive?.boolean ?: false
            if (!resourcesUsable) {
                return Result.ResourcesMissing(
                    frame["resourceProblems"]?.jsonPrimitive?.content ?: "unspecified"
                )
            }

            return Result.Ready(
                forgeCommit = commit,
                forgeRelease = frame["forgeRelease"]?.jsonPrimitive?.content ?: "unknown",
                workerVersion = frame["workerVersion"]?.jsonPrimitive?.content ?: "unknown",
                javaVersion = frame["javaVersion"]?.jsonPrimitive?.content ?: "unknown",
            )
        } finally {
            shutdown(process)
        }
    }

    /**
     * Ask politely, then insist.
     *
     * §1.67 forbids match-state recovery in Phase 1, but a diagnostic
     * worker left running would leak ~611 MB per probe.
     */
    private fun shutdown(process: Process) {
        runCatching {
            process.outputStream.use { it.write("{\"type\":\"SHUTDOWN\"}\n".toByteArray()) }
        }
        if (!process.waitFor(5, TimeUnit.SECONDS)) {
            process.destroyForcibly()
        }
    }

    private fun readLineWithTimeout(
        reader: java.io.BufferedReader,
        process: Process,
        seconds: Long,
    ): String? {
        val deadline = System.currentTimeMillis() + seconds * 1000
        while (System.currentTimeMillis() < deadline) {
            if (reader.ready()) return reader.readLine()
            if (!process.isAlive && !reader.ready()) return null
            Thread.sleep(50)
        }
        return null
    }

    private fun javaExecutable(): String {
        val home = System.getProperty("java.home")
        val name = if (System.getProperty("os.name").startsWith("Windows")) "java.exe" else "java"
        val candidate = File(File(home, "bin"), name)
        return if (candidate.isFile) candidate.absolutePath else "java"
    }
}
