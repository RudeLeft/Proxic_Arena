package net.barnflix.proxic.match

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.ServerConfig
import net.barnflix.proxic.deck.DeckEntry
import java.io.File
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Spec 0098 -- the test-only deal: the store, the worker's switch, the frame. */
class TestDealsTest {
    private val host = UUID.randomUUID()
    private val guest = UUID.randomUUID()

    private fun config(testDeals: Boolean) =
        ServerConfig(
            host = "0.0.0.0",
            port = 0,
            databaseUrl = null,
            forgeWorkerJar = "worker.jar",
            dataRoot = "data",
            forgeResRoot = "res",
            testDeals = testDeals,
        )

    @Test
    fun `a deal is for the next match between exactly those players, once`() {
        val deals = TestDeals()
        deals.queue(mapOf(host to SeatDeal(hand = listOf("Plains")), guest to SeatDeal()))

        assertNull(deals.take(setOf(host, UUID.randomUUID())), "another pair took it")
        assertNotNull(deals.take(setOf(guest, host)))
        assertNull(deals.take(setOf(host, guest)), "taken twice")
    }

    @Test
    fun `a deal nobody took is forgotten`() {
        var now = Instant.parse("2026-11-16T12:00:00Z")
        val deals = TestDeals(clock = { now }, keep = Duration.ofMinutes(10))
        deals.queue(mapOf(host to SeatDeal(hand = listOf("Plains")), guest to SeatDeal()))
        now = now.plus(Duration.ofMinutes(11))

        assertNull(deals.take(setOf(host, guest)))
    }

    @Test
    fun `a deal must name two players and at most seven for a hand`() {
        val two = listOf(TestDealSeat("RudeLeft"), TestDealSeat("Pat"))
        assertNull(testDealProblem(TestDealRequest(two)))
        assertNotNull(testDealProblem(TestDealRequest(two.take(1))))
        assertNotNull(testDealProblem(TestDealRequest(listOf(TestDealSeat("Pat"), TestDealSeat("pat")))))
        val eight = TestDealSeat("RudeLeft", hand = List(8) { "Plains" })
        assertNotNull(testDealProblem(TestDealRequest(listOf(eight, two[1]))))
        val blank = TestDealSeat("RudeLeft", top = listOf(" "))
        assertNotNull(testDealProblem(TestDealRequest(listOf(blank, two[1]))))
    }

    /** The worker refuses any deal unless started with --lab-deal; the server passes it only with the switch on. */
    @Test
    fun `the worker is started with --lab-deal only with the switch on`() {
        val jar = File("worker.jar")
        val off = workerCommand(config(false), jar)
        assertFalse("--lab-deal" in off, "switch off: $off")
        val on = workerCommand(config(true), jar)
        // After the resource root: the worker reads its first argument as that.
        assertEquals(listOf("res", "--lab-deal"), on.takeLast(2))
    }

    @Test
    fun `the switch is off unless the environment says true`() {
        assertFalse(ServerConfig.fromEnvironment { null }.testDeals)
        assertFalse(ServerConfig.fromEnvironment { if (it == "PROXIC_TEST_DEALS") "yes" else null }.testDeals)
        assertTrue(ServerConfig.fromEnvironment { if (it == "PROXIC_TEST_DEALS") "true" else null }.testDeals)
    }

    @Test
    fun `a dealt seat carries labDeal and an undealt one does not`() {
        val cards = listOf(DeckEntry(60, "Plains", null, null, "60 Plains", 1))
        val frame =
            startGameFrame(
                UUID.randomUUID(),
                listOf(
                    WorkerSeat("RudeLeft", 1, cards, deal = SeatDeal(listOf("Plains"), listOf("Plains", "Plains"))),
                    WorkerSeat("Pat", 2, cards),
                ),
            )
        val players = frame.getValue("players") as JsonArray
        assertEquals(
            """{"hand":["Plains"],"top":["Plains","Plains"]}""",
            (players[0] as JsonObject)["labDeal"].toString(),
        )
        assertNull((players[1] as JsonObject)["labDeal"])
    }
}
