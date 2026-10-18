package net.barnflix.proxic.match

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Who may answer a decision — PHASE_06 §6.37, §6.38, §6.100-§6.104.
 *
 * This is the class that decides whether one player can answer
 * another player's decision, which makes it the most
 * security-relevant code in the phase and the cheapest to test:
 * no database, no worker, no Forge. The seam exists so these
 * run in milliseconds and therefore run on every build.
 *
 * §6.38's last line is what every test here is really checking:
 * "The client never decides this mapping."
 */
class LiveMatchTest {
    private val alice = UUID.randomUUID()
    private val bob = UUID.randomUUID()
    private val stranger = UUID.randomUUID()

    /** What actually reached the worker, if anything. */
    private val sent = mutableListOf<String>()

    private fun match() =
        Match(
            matchId = UUID.randomUUID(),
            setupId = UUID.randomUUID(),
            roomId = UUID.randomUUID(),
            status = MatchStatus.RUNNING,
            presetId = "OPEN_FORMAT_1V1",
            participants =
                listOf(
                    MatchParticipant(alice, 1, UUID.randomUUID(), "Mono Red", "Alice"),
                    MatchParticipant(bob, 2, UUID.randomUUID(), "Mono Blue", "Bob"),
                ),
        )

    private fun live(): LiveMatch =
        LiveMatch(match(), worker = NO_WORKER) { decisionId, seat, version, actionId ->
            sent += "$decisionId/$seat/$version/$actionId"
            true
        }

    private fun question(
        actedFor: Int = 1,
        authorised: Int = 1,
        decisionId: Long = 7,
        version: Long = 42,
    ) = DecisionRequest(
        decisionId = decisionId,
        actedForSeat = actedFor,
        authorisedSeat = authorised,
        kind = "chooseSpellAbilityToPlay",
        stateVersion = version,
        options = listOf(DecisionOption("action:0:card:7", "Mountain - tap")),
    )

    @Test
    fun `the authorised player's answer reaches the worker`() {
        val live = live()
        live.nowAsking(question())

        assertNull(live.answer(alice, 7, "action:0:card:7"))
        assertEquals(listOf("7/1/42/action:0:card:7"), sent)
    }

    /** §6.102 — and nothing is forwarded to Forge. */
    @Test
    fun `the other player cannot answer`() {
        val live = live()
        live.nowAsking(question())

        assertEquals(DecisionRefusal.NOT_YOURS, live.answer(bob, 7, "action:0:card:7"))
        assertTrue(sent.isEmpty(), "a wrong-user answer was forwarded to Forge")
    }

    /** Not a participant at all. Same answer, nothing forwarded. */
    @Test
    fun `somebody who is not in the match cannot answer`() {
        val live = live()
        live.nowAsking(question())

        assertEquals(DecisionRefusal.NOT_YOURS, live.answer(stranger, 7, "action:0:card:7"))
        assertTrue(sent.isEmpty())
    }

    /**
     * §6.37 — MINDSLAVER. The decision is about Alice's player;
     * Bob is the one who answers it.
     *
     * The natural implementation routes on the seat the decision
     * concerns and gets this exactly backwards, handing the
     * controlled player their own decisions back — which is the
     * whole effect, undone.
     */
    @Test
    fun `under a control effect the controller answers, not the controlled`() {
        val live = live()
        live.nowAsking(question(actedFor = 1, authorised = 2))

        assertEquals(
            DecisionRefusal.NOT_YOURS,
            live.answer(alice, 7, "action:0:card:7"),
            "the controlled player answered for themselves",
        )
        assertNull(live.answer(bob, 7, "action:0:card:7"))
        // Seat 2 is what the worker is told, because that is who
        // the gate will check against.
        assertEquals(listOf("7/2/42/action:0:card:7"), sent)
    }

    @Test
    fun `an answer to a question that is no longer outstanding is refused`() {
        val live = live()

        assertEquals(DecisionRefusal.NOT_PENDING, live.answer(alice, 7, "action:0:card:7"))

        live.nowAsking(question(decisionId = 8))
        assertEquals(DecisionRefusal.STALE_DECISION, live.answer(alice, 7, "action:0:card:7"))
        assertTrue(sent.isEmpty())
    }

    /** §6.101 — the choice must be one THIS decision offered. */
    @Test
    fun `an action that was not offered is refused`() {
        val live = live()
        live.nowAsking(question())

        assertEquals(DecisionRefusal.STALE_DECISION, live.answer(alice, 7, "action:9:card:99"))
        assertTrue(sent.isEmpty())
    }

    /** Passing is an answer, and it is always available. */
    @Test
    fun `a pass is forwarded`() {
        val live = live()
        live.nowAsking(question())

        assertNull(live.answer(alice, 7, null))
        assertEquals(listOf("7/1/42/null"), sent)
    }

    /**
     * §6.100, §6.104 — the state version is the QUESTION's.
     *
     * Nothing in `answer`'s signature lets a caller supply one,
     * and that is the point: a client that could name its own
     * version could defeat the staleness check by naming whatever
     * the server currently holds.
     */
    @Test
    fun `the state version comes from the question, not the caller`() {
        val live = live()
        live.nowAsking(question(version = 99))

        assertNull(live.answer(alice, 7, "action:0:card:7"))
        assertEquals(listOf("7/1/99/action:0:card:7"), sent)
    }

    /**
     * Clearing is BY ID.
     *
     * The worker writes DECISION_ACCEPTED from its main thread
     * and the next DECISION_REQUEST from Forge's, so they can
     * arrive in either order. An unconditional clear would
     * discard a live question and leave both players staring at a
     * game that was waiting for one of them.
     */
    @Test
    fun `a late acceptance does not discard the next question`() {
        val live = live()
        live.nowAsking(question(decisionId = 7))
        live.nowAsking(question(decisionId = 8))

        live.answered(7)

        assertEquals(8, live.pending()?.decisionId, "the next question was thrown away")
    }

    @Test
    fun `an acceptance for the outstanding question clears it`() {
        val live = live()
        live.nowAsking(question(decisionId = 7))

        live.answered(7)

        assertNull(live.pending())
    }

    @Test
    fun `the authorised user is resolved from the authorised seat`() {
        val live = live()
        assertNull(live.authorisedUser(), "a match with no question has nobody to ask")

        live.nowAsking(question(actedFor = 1, authorised = 2))
        assertEquals(bob, live.authorisedUser())
    }

    private companion object {
        /**
         * Never started, never spoken to.
         *
         * Present only because [LiveMatch] holds one; every test
         * here goes through the send seam instead. A worker that
         * were touched would throw rather than quietly pass, so
         * the tests cannot be lying about that.
         */
        val NO_WORKER =
            MatchWorker(
                net.barnflix.proxic.ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = null,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-live-match",
                ),
                UUID.randomUUID(),
            )
    }
}
