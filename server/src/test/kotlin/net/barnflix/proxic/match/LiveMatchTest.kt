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

    /**
     * P6-R — the same player in two tabs answers the same question.
     *
     * Measured in a browser before this existed: both tabs were told
     * DECISION_ACCEPTED. The worker's gate refused the second and
     * Forge applied the answer once, but the second tab had already
     * been told its answer took. The question stays pending until
     * the worker acknowledges, so nothing else here could tell the
     * two answers apart.
     */
    @Test
    fun `a second answer to a forwarded decision is refused, not forwarded`() {
        val live = live()
        live.nowAsking(question())

        assertNull(live.answer(alice, 7, "action:0:card:7"))
        assertEquals(DecisionRefusal.DUPLICATE, live.answer(alice, 7, "action:0:card:7"))
        assertEquals(1, sent.size, "the duplicate was forwarded to Forge")
    }

    /**
     * And a refusal from the worker gives the decision back — a
     * stale state version is a reason to answer again, not to be
     * locked out of the question.
     */
    @Test
    fun `a decision the worker refused can be answered again`() {
        val live = live()
        live.nowAsking(question())

        assertNull(live.answer(alice, 7, "action:0:card:7"))
        live.release(7)
        assertNull(live.answer(alice, 7, "action:0:card:7"))
        assertEquals(2, sent.size)
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
     * Some decisions have no "no", and the SERVER refuses one too.
     *
     * The gate refuses it as well, and that is not duplication:
     * §6.100 says the browser's word is not authority, and a pass
     * forwarded to Forge for a mandatory decision would be a
     * question nobody answered. Nothing reaches the worker.
     */
    @Test
    fun `a pass is refused when the decision is mandatory`() {
        val live = live()
        live.nowAsking(question().copy(mandatory = true))

        assertEquals(DecisionRefusal.PASS_NOT_ALLOWED, live.answer(alice, 7, null))
        assertTrue(sent.isEmpty(), "a pass was forwarded for a decision that forbids one")

        // A real choice still goes through, so the refusal is
        // about the pass and not about the decision.
        assertNull(live.answer(alice, 7, "action:0:card:7"))
        assertEquals(listOf("7/1/42/action:0:card:7"), sent)
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

    // --- P6-AG: naming a card, by searching ---------------------------

    /** What reached the worker as a search, if anything. */
    private val searched = mutableListOf<String>()

    private fun searchable(): LiveMatch {
        val live =
            LiveMatch(
                match(),
                worker = NO_WORKER,
                find = { decisionId, seat, query ->
                    searched += "$decisionId/$seat/$query"
                    true
                },
            ) { decisionId, seat, version, actionId ->
                sent += "$decisionId/$seat/$version/$actionId"
                true
            }
        live.nowAsking(question().copy(kind = "chooseCardName", options = emptyList(), searchable = true))
        return live
    }

    /** The asked player may search; nobody else may, and nothing reaches Forge for them. */
    @Test
    fun `only the asked player can search`() {
        val live = searchable()

        assertEquals(DecisionRefusal.NOT_YOURS, live.search(bob, 7, "bolt"))
        assertEquals(DecisionRefusal.NOT_YOURS, live.search(stranger, 7, "bolt"))
        assertNull(live.search(alice, 7, " bolt "))
        assertEquals(listOf("7/1/bolt"), searched)
    }

    @Test
    fun `an ordinary question cannot be searched`() {
        val live = live()
        live.nowAsking(question())

        assertEquals(DecisionRefusal.NOT_SEARCHABLE, live.search(alice, 7, "bolt"))
    }

    @Test
    fun `a search for an old question is refused`() {
        val live = searchable()

        assertEquals(DecisionRefusal.STALE_DECISION, live.search(alice, 6, "bolt"))
        assertTrue(searched.isEmpty())
    }

    /** A card name is short; a megabyte of query is not forwarded. */
    @Test
    fun `a long query is cut, not forwarded whole`() {
        val live = searchable()

        live.search(alice, 7, "x".repeat(100_000))

        assertEquals("7/1/" + "x".repeat(64), searched.single())
    }

    /**
     * §6.101 for a searchable question: the answer must be a name
     * this player was SHOWN. Forge would accept any of ~30,000; a
     * client that guesses an id it never received is refused here,
     * before the worker is asked.
     */
    @Test
    fun `only a name the player was shown can be the answer`() {
        val live = searchable()

        assertEquals(DecisionRefusal.STALE_DECISION, live.answer(alice, 7, "name:4410"))
        assertTrue(sent.isEmpty(), "an unshown name was forwarded")

        live.offered(7, listOf(DecisionOption("name:4410", "Lightning Bolt")))
        assertNull(live.answer(alice, 7, "name:4410"))
        assertEquals(listOf("7/1/42/name:4410"), sent)
    }

    /** Results that arrive for a question already gone are not carried into the next. */
    @Test
    fun `results for an old question do not become answers to a new one`() {
        val live = searchable()

        live.offered(6, listOf(DecisionOption("name:4410", "Lightning Bolt")))

        assertEquals(DecisionRefusal.STALE_DECISION, live.answer(alice, 7, "name:4410"))
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
