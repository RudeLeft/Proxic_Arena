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
import kotlin.test.assertTrue

/**
 * §6.29: "Human gameplay decisions do not use this startup timeout."
 *
 * Found in CI, 2026-10-20: a host mulliganing for a Delver of Secrets
 * took longer than the fixed start window, and the match was failed
 * mid-mulligan -- the pregame questions come BEFORE the first priority
 * window, so a player thinking was being counted as Forge hanging.
 *
 * Run against an impostor worker (see [ImpostorWorker]) with the
 * silence window shortened to one second.
 */
class StartTimeoutTest {
    private val scratch = Files.createTempDirectory("proxic-start").toFile()
    private val workers = mutableListOf<MatchWorker>()

    @AfterTest
    fun cleanUp() {
        workers.forEach { it.stop() }
        scratch.deleteRecursively()
    }

    private val v = BuildInfo.PROTOCOL_VERSION
    private val greeting =
        "{\"protocolVersion\":$v,\"type\":\"WORKER_READY\",\"forgeCommit\":\"${BuildInfo.FORGE_COMMIT}\"}"
    private val question =
        "{\"protocolVersion\":$v,\"type\":\"DECISION_REQUEST\",\"decisionId\":1,\"actedForSeat\":1," +
            "\"authorisedSeat\":1,\"kind\":\"mulliganKeepHand\",\"stateVersion\":1,\"gameEpoch\":1," +
            "\"mandatory\":true,\"options\":[{\"actionId\":\"mulligan:keep\",\"label\":\"Keep this hand\"}]}"
    private val started = "{\"protocolVersion\":$v,\"type\":\"GAME_STARTED\",\"turn\":1}"

    /** A player asked a question, and taking three times the window to answer. */
    @Test
    fun `a start waiting on a player is not timed out`() {
        val result = start(listOf(question, started), pauseMillis = 3_000)

        assertIs<WorkerStart.Running>(result, "a pregame question counted against the start: $result")
    }

    /** The safety net still holds: silence with nobody being asked fails. */
    @Test
    fun `a start that goes silent with no question open fails`() {
        val began = System.nanoTime()

        val result = start(emptyList(), pauseMillis = 0)

        assertEquals("GAME_START_TIMEOUT", assertIs<WorkerStart.Failed>(result).code)
        val seconds = (System.nanoTime() - began) / 1_000_000_000.0
        assertTrue(seconds < 10, "took $seconds s to notice the silence")
    }

    private fun start(
        afterStart: List<String>,
        pauseMillis: Long,
    ): WorkerStart {
        val jar = ImpostorWorker.jar(scratch, greeting, afterStart, pauseMillis)
        val config =
            ServerConfig(
                host = "0.0.0.0",
                port = 0,
                databaseUrl = null,
                forgeWorkerJar = jar.path,
                dataRoot = File(scratch, "data").path,
                forgeResRoot = File(scratch, "heard-${UUID.randomUUID()}.txt").path,
            )
        val worker = MatchWorker(config, UUID.randomUUID(), startSilenceSeconds = 1)
        workers += worker
        return worker.start(
            listOf(WorkerSeat("Alice", 1, listOf(DeckEntry(60, "Mountain", null, null, "60 Mountain", 1)))),
        )
    }
}
