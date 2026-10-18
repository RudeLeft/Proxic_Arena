package net.barnflix.proxic.match

import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.deck.DeckEntry
import org.junit.jupiter.api.Assumptions.assumeTrue
import java.io.File
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/**
 * A real Forge game, started by the server — PHASE_06 §6.15,
 * §6.17, §6.26, acceptance P6-D.
 *
 * This exists because the first version of this slice was verified
 * by running the image by hand and reading the output. That is the
 * "I looked at it once" evidence this project does not accept, and
 * it is how two classes shipped wired to nothing in Phase 5.
 *
 * P6-D's claim is that RUNNING is reached only after an ACTUAL
 * game. Nothing here is mocked: a real worker process, the real
 * pinned Forge, a real two-player game that reaches a real
 * priority window.
 *
 * Skips without the worker jar and Forge resources, which CI
 * supplies by extracting them from the image under test.
 */
class MatchRuntimeTest {
    private val workerJar = File("../forge-worker/target/forge-worker-0.1.0.jar")
    private val resRoot = File("../spikes/forge-phase0a/forge-upstream/forge-gui/res")

    private fun config(): ServerConfig {
        assumeTrue(
            workerJar.isFile,
            "SKIPPED: build the worker (cd forge-worker && mvn package)",
        )
        assumeTrue(resRoot.isDirectory, "SKIPPED: no Forge resource checkout")
        return ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = null,
            forgeWorkerJar = workerJar.path,
            dataRoot = "build/test-match-runtime",
            forgeResRoot = resRoot.path,
        )
    }

    private fun basics(
        name: String,
        count: Int,
    ) = listOf(DeckEntry(count, name, null, null, "$count $name", 1))

    /**
     * P6-D — a real game, reaching a real priority window.
     *
     * Sixty basic lands a side. Not a good deck: a deliberately
     * boring one, so what is proved is the RUNTIME rather than
     * anything about card behaviour. Forge still has to load its
     * whole pool, construct the game, deal opening hands, resolve
     * mulligans and offer priority before this passes.
     */
    @Test
    fun `the worker starts a real two-player game`() {
        val worker = MatchWorker(config(), UUID.randomUUID())
        try {
            val result =
                worker.start(
                    listOf(
                        WorkerSeat("Alice", 1, basics("Mountain", 60)),
                        WorkerSeat("Bob", 2, basics("Forest", 60)),
                    ),
                )

            val running = assertIs<WorkerStart.Running>(result, "did not start: $result")
            // Turn 1 means the game is PLAYING, not merely built.
            assertTrue(running.turn >= 1, "reported running at turn ${running.turn}")
            assertTrue(worker.isAlive(), "the worker exited after reporting running")
        } finally {
            worker.stop()
        }
    }

    /**
     * §6.15 — a worker that is not there is a RESULT, not a crash.
     *
     * The server must survive every one of §1.66's cases, and this
     * is the one an operator meets: a deployment where the jar
     * never made it into the image.
     */
    @Test
    fun `a missing worker jar fails cleanly`() {
        val broken = config().copy(forgeWorkerJar = "no/such/worker.jar")
        val worker = MatchWorker(broken, UUID.randomUUID())

        val result = worker.start(listOf(WorkerSeat("Alice", 1, basics("Mountain", 60))))

        val failed = assertIs<WorkerStart.Failed>(result)
        assertEquals("WORKER_MISSING", failed.code)
    }

    /** And a server configured with no worker at all. */
    @Test
    fun `an unconfigured worker fails cleanly`() {
        val none = config().copy(forgeWorkerJar = null)
        val worker = MatchWorker(none, UUID.randomUUID())

        val result = worker.start(listOf(WorkerSeat("Alice", 1, basics("Mountain", 60))))

        assertEquals("WORKER_UNCONFIGURED", assertIs<WorkerStart.Failed>(result).code)
    }

    /**
     * §6.96, §6.98 — a deck Forge cannot build does not start a
     * match.
     *
     * The preflight should have caught this at preparation. If it
     * reaches the runtime, starting anyway would mean playing a
     * game with cards silently missing.
     */
    @Test
    fun `a deck Forge cannot resolve stops the start`() {
        val worker = MatchWorker(config(), UUID.randomUUID())
        try {
            val result =
                worker.start(
                    listOf(
                        WorkerSeat("Alice", 1, basics("Definitely Not A Real Card", 60)),
                        WorkerSeat("Bob", 2, basics("Forest", 60)),
                    ),
                )

            val failed = assertIs<WorkerStart.Failed>(result, "it started anyway: $result")
            assertEquals("DECK_UNRESOLVED", failed.code)
        } finally {
            worker.stop()
        }
    }
}
