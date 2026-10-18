package net.barnflix.proxic.match

import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * Who is told what — PHASE_06 §6.37, §6.38, §6.103.
 *
 * §6.38's four lines are the whole subject of this class, and the
 * last of them is the one a real game caught: "viewer receiving
 * private decision data". The first build told the new holder and
 * nobody else, so the PREVIOUS holder kept a prompt on screen for
 * a question that no longer existed. Both players appeared to
 * have priority at once, which cannot happen in Magic.
 */
class MatchDecisionsTest {
    private val alice = UUID.randomUUID()
    private val bob = UUID.randomUUID()

    /** Every message, as "who/what", in the order it was sent. */
    private val told = mutableListOf<String>()

    private val announcer =
        object : DecisionAnnouncer {
            override suspend fun ask(
                matchId: UUID,
                userId: UUID,
                request: DecisionRequest,
            ) {
                told += "${name(userId)}/ASK:${request.decisionId}"
            }

            override suspend fun snapshot(
                matchId: UUID,
                userId: UUID,
                state: kotlinx.serialization.json.JsonObject,
            ) {
                told += "${name(userId)}/SNAPSHOT"
            }

            override suspend fun cleared(
                matchId: UUID,
                userId: UUID,
            ) {
                told += "${name(userId)}/CLEARED"
            }

            override suspend fun refused(
                matchId: UUID,
                userId: UUID,
                decisionId: Long,
                reason: DecisionRefusal,
            ) {
                told += "${name(userId)}/REFUSED:$reason"
            }
        }

    private fun name(userId: UUID) = if (userId == alice) "alice" else "bob"

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

    private fun live() = LiveMatch(match(), worker = NO_WORKER) { _, _, _, _ -> true }

    private fun question(
        decisionId: Long,
        authorised: Int,
        actedFor: Int = authorised,
    ) = DecisionRequest(
        decisionId = decisionId,
        actedForSeat = actedFor,
        authorisedSeat = authorised,
        kind = "chooseSpellAbilityToPlay",
        stateVersion = decisionId,
        options = listOf(DecisionOption("action:0:card:7", "Staggershock - cast")),
    )

    /**
     * THE REPORTED BUG. Priority moves from seat 2 to seat 1, and
     * seat 2 must be told their prompt is gone.
     *
     * Without the clear, both browsers show "Your move": one with
     * Forge's real actions and one with a dead prompt that is
     * refused when clicked.
     */
    @Test
    fun `the other seat is told when priority moves`() {
        val decisions = MatchDecisions(announcer)
        val live = live()

        decisions.handle(live, WorkerEvent.Decision(question(1, authorised = 2)))
        decisions.handle(live, WorkerEvent.Answered(1))
        decisions.handle(live, WorkerEvent.Decision(question(2, authorised = 1)))

        assertEquals(
            listOf(
                "bob/ASK:1",
                "alice/CLEARED",
                "alice/ASK:2",
                "bob/CLEARED",
            ),
            told,
        )
    }

    /** The one being asked is never also told it is not theirs. */
    @Test
    fun `the player being asked gets the question and nothing else`() {
        val decisions = MatchDecisions(announcer)

        decisions.handle(live(), WorkerEvent.Decision(question(1, authorised = 1)))

        assertEquals(listOf("alice/ASK:1", "bob/CLEARED"), told)
    }

    /**
     * §6.37 — under a control effect the CONTROLLER is asked, and
     * the controlled player is the one told it is not theirs.
     *
     * Exactly inverted from the seat the decision is about, which
     * is the whole reason both seats travel.
     */
    @Test
    fun `under a control effect the controlled player is the one cleared`() {
        val decisions = MatchDecisions(announcer)

        // About seat 1 (Alice); Bob answers.
        decisions.handle(live(), WorkerEvent.Decision(question(1, authorised = 2, actedFor = 1)))

        assertEquals(listOf("bob/ASK:1", "alice/CLEARED"), told)
    }

    /**
     * A seat nobody holds is an error, and NOBODY is told.
     *
     * The tempting recovery is to fall back to the seat being
     * acted for. That is right in every ordinary decision and
     * wrong in the only case the field exists for, so the
     * decision is dropped and logged instead.
     */
    @Test
    fun `a decision for a seat nobody holds reaches nobody`() {
        val decisions = MatchDecisions(announcer)

        decisions.handle(live(), WorkerEvent.Decision(question(1, authorised = 9)))

        assertTrue(told.isEmpty(), "somebody was asked a decision that is not theirs")
    }

    @Test
    fun `a refusal goes to the player who could have answered`() {
        val decisions = MatchDecisions(announcer)
        val live = live()
        decisions.handle(live, WorkerEvent.Decision(question(1, authorised = 2)))
        told.clear()

        decisions.handle(live, WorkerEvent.Refused(1, DecisionRefusal.STALE_STATE))

        assertEquals(listOf("bob/REFUSED:STALE_STATE"), told)
    }

    /** §6.103 — an accepted answer closes the question. */
    @Test
    fun `an acceptance clears the pending question`() {
        val decisions = MatchDecisions(announcer)
        val live = live()
        decisions.handle(live, WorkerEvent.Decision(question(1, authorised = 1)))

        decisions.handle(live, WorkerEvent.Answered(1))

        assertEquals(null, live.pending())
    }

    private companion object {
        /** Never started, never spoken to; the send seam is used instead. */
        val NO_WORKER =
            MatchWorker(
                net.barnflix.proxic.ServerConfig(
                    host = "0.0.0.0",
                    port = 0,
                    databaseUrl = null,
                    forgeWorkerJar = null,
                    dataRoot = "build/test-match-decisions",
                ),
                UUID.randomUUID(),
            )
    }
}
