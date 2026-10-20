package net.barnflix.proxic.match

import net.barnflix.proxic.BuildInfo
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.deck.DeckEntry
import java.io.File
import java.nio.file.Files
import java.util.UUID
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

/**
 * The server checks WHAT it launched before it trusts it with a
 * match — PHASE_06 §6.26, acceptance P6-AU and P6-AV.
 *
 * Run, not reasoned about: each test launches a real process, an
 * impostor worker compiled here, that greets the server with an
 * identity of the test's choosing and writes down every line the
 * server sends it. "Launch fails safely" then means two facts: the
 * start is refused as WORKER_INCOMPATIBLE, and START_GAME never
 * reached the impostor -- it was not asked to play anything.
 *
 * The control greets correctly, and the impostor answers START_GAME
 * with an error: it proves the impostor really does hear START_GAME
 * when one is sent, so the refusals below are not passing because
 * the recording never worked.
 */
class WorkerIdentityTest {
    private val scratch = Files.createTempDirectory("proxic-impostor").toFile()
    private val workers = mutableListOf<MatchWorker>()

    @AfterTest
    fun cleanUp() {
        workers.forEach { it.stop() }
        scratch.deleteRecursively()
    }

    @Test
    fun `a worker speaking another protocol version is refused before it is asked to play`() {
        val (result, heard) = launch(BuildInfo.PROTOCOL_VERSION + 1, BuildInfo.FORGE_COMMIT)

        val failed = assertIs<WorkerStart.Failed>(result)
        assertEquals("WORKER_INCOMPATIBLE", failed.code)
        assertTrue(failed.detail.contains("protocol version"), failed.detail)
        assertTrue(heard.none { it.contains("START_GAME") }, "it was asked to play: $heard")
    }

    @Test
    fun `a worker greeting with no protocol version is refused`() {
        val (result, heard) = launch(null, BuildInfo.FORGE_COMMIT)

        assertEquals("WORKER_INCOMPATIBLE", assertIs<WorkerStart.Failed>(result).code)
        assertTrue(heard.none { it.contains("START_GAME") }, "it was asked to play: $heard")
    }

    @Test
    fun `a worker built against another Forge is refused before it is asked to play`() {
        val (result, heard) = launch(BuildInfo.PROTOCOL_VERSION, "0000000000000000000000000000000000000000")

        val failed = assertIs<WorkerStart.Failed>(result)
        assertEquals("WORKER_INCOMPATIBLE", failed.code)
        assertTrue(failed.detail.contains("different Forge"), failed.detail)
        assertTrue(heard.none { it.contains("START_GAME") }, "it was asked to play: $heard")
    }

    /** The control: the right identity IS asked to play. */
    @Test
    fun `a worker with the right identity is sent the game`() {
        val (result, heard) = launch(BuildInfo.PROTOCOL_VERSION, BuildInfo.FORGE_COMMIT)

        val failed = assertIs<WorkerStart.Failed>(result)
        assertNotEquals("WORKER_INCOMPATIBLE", failed.code)
        assertEquals("IMPOSTOR_HEARD_START", failed.code)
        assertTrue(heard.any { it.contains("START_GAME") }, "START_GAME never arrived: $heard")
    }

    /**
     * Start a match against an impostor greeting with [protocol]
     * (absent when null) and [commit]; returns the start's result
     * and what the impostor heard.
     */
    private fun launch(
        protocol: Int?,
        commit: String,
    ): Pair<WorkerStart, List<String>> {
        val heard = File(scratch, "heard-${UUID.randomUUID()}.txt")
        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = null,
                forgeWorkerJar = impostor(protocol, commit).path,
                dataRoot = File(scratch, "data").path,
                // The worker's one argument is its resource root; the
                // impostor takes it as the file to write down into.
                forgeResRoot = heard.path,
            )
        val worker = MatchWorker(config, UUID.randomUUID())
        workers += worker
        val result =
            worker.start(
                listOf(
                    WorkerSeat("Alice", 1, listOf(DeckEntry(60, "Mountain", null, null, "60 Mountain", 1))),
                    WorkerSeat("Bob", 2, listOf(DeckEntry(60, "Mountain", null, null, "60 Mountain", 1))),
                ),
            )
        worker.stop()
        return result to ImpostorWorker.linesHeard(heard)
    }

    private fun impostor(
        protocol: Int?,
        commit: String,
    ): File {
        val version = protocol?.let { "\"protocolVersion\":$it," } ?: ""
        return ImpostorWorker.jar(
            scratch,
            greeting = "{$version\"type\":\"WORKER_READY\",\"forgeCommit\":\"$commit\"}",
            afterStart =
                listOf(
                    "{\"protocolVersion\":${BuildInfo.PROTOCOL_VERSION},\"type\":\"ERROR\"," +
                        "\"errorCode\":\"IMPOSTOR_HEARD_START\",\"detail\":\"impostor\"}",
                ),
        )
    }
}
