package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import net.barnflix.proxic.deck.DeckEntry
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Reading the worker's wire — PHASE_06 §6.37, §6.99, §6.100.
 *
 * The server and the worker are built together and pinned
 * together, so these are not tests about hostile input. They are
 * tests about what the server does when a frame is NOT what it
 * expects, and the answer has to be "drop it" rather than "fill
 * in the blanks" — because the blank that matters here is which
 * human is allowed to answer.
 */
class WorkerFramesTest {
    private val json = Json

    private fun frame(text: String): JsonObject = json.parseToJsonElement(text) as JsonObject

    @Test
    fun `a decision frame reads into both seats`() {
        val request =
            readDecisionFrame(
                frame(
                    """
                    {"type":"DECISION_REQUEST","decisionId":"12","actedForSeat":1,
                     "authorisedSeat":2,"kind":"chooseSpellAbilityToPlay","stateVersion":"8",
                     "options":[{"actionId":"action:0:card:7","label":"Mountain - tap"}]}
                    """.trimIndent(),
                ),
            )

        assertEquals(12L, request?.decisionId)
        assertEquals(1, request?.actedForSeat)
        assertEquals(2, request?.authorisedSeat)
        assertEquals(8L, request?.stateVersion)
        assertEquals("action:0:card:7", request?.options?.single()?.actionId)
        assertEquals("Mountain - tap", request?.options?.single()?.label)
    }

    @Test
    fun `a mandatory decision is read as mandatory, and absence means optional`() {
        val base = """"decisionId":"1","actedForSeat":1,"authorisedSeat":1,"stateVersion":"1""""
        val mandatory = readDecisionFrame(frame("{$base,\"mandatory\":true,\"options\":[]}"))
        assertEquals(true, mandatory?.mandatory)

        // An older worker that does not send the field must not
        // accidentally make a decision unrefusable.
        val silent = readDecisionFrame(frame("{$base,\"options\":[]}"))
        assertEquals(false, silent?.mandatory)
    }

    /**
     * THE ONE THAT MATTERS. A frame with no authorised seat is
     * unreadable, not half-understood.
     *
     * The tempting recovery is to fall back to the seat being
     * acted for, which is right in every ordinary decision and
     * wrong in exactly the case the field exists for (§6.37).
     * Dropping the frame leaves Forge blocked and a human
     * looking at a stuck game, which is visible; guessing hands
     * somebody their opponent's decisions, which is not.
     */
    @Test
    fun `a decision with no authorised seat is dropped, not guessed`() {
        val request =
            readDecisionFrame(
                frame(
                    """
                    {"type":"DECISION_REQUEST","decisionId":"12","actedForSeat":1,
                     "kind":"chooseSpellAbilityToPlay","stateVersion":"8","options":[]}
                    """.trimIndent(),
                ),
            )

        assertNull(request)
    }

    /**
     * PHASE_07 §7.61 B5, B8 — found by the first live game on the new
     * board: the worker sent each option's object and payability, and
     * the server dropped both on the way to the browser, so no card in
     * hand could be clicked to play it.
     */
    @Test
    fun `an option's object and payability reach the browser`() {
        val request =
            readDecisionFrame(
                frame(
                    """
                    {"decisionId":"3","actedForSeat":1,"authorisedSeat":1,"kind":"chooseSpellAbilityToPlay",
                     "stateVersion":"2","options":[
                       {"actionId":"action:0:card:7","label":"Mountain","objectId":"card:7"},
                       {"actionId":"action:1:card:9","label":"Bolt","objectId":"card:9","payable":false},
                       {"actionId":"mode:0","label":"Mode"}]}
                    """.trimIndent(),
                ),
            )!!
        val sent = decisionMessage(request).toString()
        val mountain = "\"actionId\":\"action:0:card:7\",\"label\":\"Mountain\",\"objectId\":\"card:7\"}"
        assertTrue(sent.contains(mountain), sent)
        assertTrue(sent.contains("\"objectId\":\"card:9\",\"payable\":false}"), sent)
        // Absent stays absent: no object invented, payable not written.
        assertTrue(sent.contains("{\"actionId\":\"mode:0\",\"label\":\"Mode\"}"), sent)
    }

    @Test
    fun `an option with no action id is dropped rather than offered blank`() {
        val request =
            readDecisionFrame(
                frame(
                    """
                    {"decisionId":"1","actedForSeat":1,"authorisedSeat":1,"kind":"k",
                     "stateVersion":"1","options":[{"label":"no id here"},
                     {"actionId":"action:0:card:3","label":null}]}
                    """.trimIndent(),
                ),
            )

        assertEquals(1, request?.options?.size)
        assertEquals("action:0:card:3", request?.options?.single()?.actionId)
        // A label is a presentation hint (§6.49) and may be absent;
        // an action id is the thing the answer names and may not.
        assertNull(request?.options?.single()?.label)
    }

    @Test
    fun `an unknown refusal reason is not invented`() {
        assertEquals(
            DecisionRefusal.WRONG_SEAT,
            readRefusal(frame("""{"detail":"WRONG_SEAT"}""")),
        )
        assertEquals(
            DecisionRefusal.NOT_PENDING,
            readRefusal(frame("""{"detail":"SOMETHING_NEW"}""")),
        )
        assertEquals(DecisionRefusal.NOT_PENDING, readRefusal(frame("{}")))
    }

    /** §6.36 — the seat number travels, because the name cannot. */
    @Test
    fun `the start frame carries a seat number for every player`() {
        val built =
            startGameFrame(
                java.util.UUID.randomUUID(),
                listOf(
                    WorkerSeat("Pat", 1, listOf(entry("Mountain", 30))),
                    // The SAME display name, which Arena permits:
                    // only usernames are unique. The seat numbers
                    // are what keep these two apart.
                    WorkerSeat("Pat", 2, listOf(entry("Forest", 30))),
                ),
            )

        val players = built["players"] as kotlinx.serialization.json.JsonArray
        val seats =
            players.map { (it as JsonObject).getValue("seatNumber").toString().toInt() }
        assertEquals(listOf(1, 2), seats)
    }

    /**
     * §6.33, P6-BD — the PRINTING travels, not just the name: two
     * printings of one card stay two entries, each with its own set
     * and collector number, which the worker builds exactly
     * (scripts/check-printings.py). A name with no printing sends
     * none rather than an empty one.
     */
    @Test
    fun `the start frame carries each entry's printing`() {
        val built =
            startGameFrame(
                java.util.UUID.randomUUID(),
                listOf(
                    WorkerSeat(
                        "Pat",
                        1,
                        listOf(
                            DeckEntry(15, "Lightning Bolt", "M10", "146", "15 Lightning Bolt (M10) 146", 1),
                            DeckEntry(15, "Lightning Bolt", "A25", "141", "15 Lightning Bolt (A25) 141", 2),
                            DeckEntry(30, "Mountain", null, null, "30 Mountain", 3),
                        ),
                    ),
                ),
            )

        val cards =
            ((built["players"] as kotlinx.serialization.json.JsonArray)[0] as JsonObject)
                .getValue("cards") as kotlinx.serialization.json.JsonArray
        val printings =
            cards.map {
                val card = it as JsonObject
                listOf("name", "set", "number").map { key -> card[key]?.toString()?.trim('"') }
            }
        assertEquals(
            listOf(
                listOf("Lightning Bolt", "M10", "146"),
                listOf("Lightning Bolt", "A25", "141"),
                listOf("Mountain", null, null),
            ),
            printings,
        )
    }

    /**
     * §6.100 — a pass is an absent actionId, not an empty one.
     *
     * The worker turns a missing field into Forge's `null`, which
     * is the pass. An empty string would be an action id that
     * matches nothing, and the gate would refuse it.
     */
    @Test
    fun `a pass leaves the action out`() {
        val passing = decisionResponseFrame(7, 1, 42, null)
        val playing = decisionResponseFrame(7, 1, 42, "action:0:card:7")

        assertTrue("actionId" !in passing.keys, "a pass carried an action")
        assertEquals("action:0:card:7", playing.getValue("actionId").toString().trim('"'))
        assertEquals("1", passing.getValue("seat").toString())
        assertEquals("42", passing.getValue("stateVersion").toString())
    }

    // --- how a game ends — §6.149, §6.151, §6.154 ---------------------

    @Test
    fun `a winner is read as a seat`() {
        val outcome =
            readOutcomeFrame(frame("""{"outcome":"WINNER","winningSeat":2,"turn":11}"""))

        assertEquals("WINNER", outcome?.kind)
        assertEquals(2, outcome?.winningSeat)
        assertEquals(11, outcome?.turn)
    }

    /** A draw has no winning seat, and absent is not seat zero. */
    @Test
    fun `a draw names nobody`() {
        val outcome = readOutcomeFrame(frame("""{"outcome":"DRAW","turn":7}"""))

        assertEquals("DRAW", outcome?.kind)
        assertNull(outcome?.winningSeat)
    }

    /**
     * §6.154 — a failure names nobody either.
     *
     * The temptation is to treat the surviving player as the
     * winner. Nothing in this path can produce one: the frame
     * carries no seat and nothing here supplies a default.
     */
    @Test
    fun `a failure names nobody`() {
        val outcome = readOutcomeFrame(frame("""{"outcome":"FAILED","turn":3}"""))

        assertEquals(GameOutcome.FAILED, outcome?.kind)
        assertNull(outcome?.winningSeat)
    }

    /**
     * §6.105, §6.106 — the EVIDENCE survives the trip.
     *
     * A real game stopped after one land was played and the only
     * record of why went to the worker's stderr, which the
     * server was discarding. The players got "the game stopped",
     * which is true and useless. §6.106 requires the source
     * method and message to be recorded, and for the adapter's
     * own loud failure the exception message names the exact
     * interaction that is not implemented yet.
     */
    @Test
    fun `a failure carries the reason it failed`() {
        val detail =
            "UnsupportedOperationException: " +
                "Phase 0A adapter does not implement chooseTargets"
        val outcome =
            readOutcomeFrame(
                frame("""{"outcome":"FAILED","turn":2,"detail":"$detail"}"""),
            )

        assertEquals(GameOutcome.FAILED, outcome?.kind)
        assertTrue(
            outcome?.detail?.contains("chooseTargets") == true,
            "the method name did not survive: ${outcome?.detail}",
        )
    }

    /** A clean ending carries no detail, because there is none. */
    @Test
    fun `a winner carries no failure detail`() {
        val outcome =
            readOutcomeFrame(frame("""{"outcome":"WINNER","winningSeat":1,"turn":9}"""))

        assertNull(outcome?.detail)
    }

    /**
     * P6-AP — an alternate win says which rule won it, in Forge's
     * words. Both players were on 20 life when Laboratory Maniac
     * won; without this the result line could only say "You won".
     */
    @Test
    fun `a winner carries Forge's reason`() {
        val outcome =
            readOutcomeFrame(
                frame(
                    "{\"outcome\":\"WINNER\",\"winningSeat\":1,\"turn\":8," +
                        "\"reason\":\"has won due to effect of 'Laboratory Maniac'\"}",
                ),
            )

        assertEquals("has won due to effect of 'Laboratory Maniac'", outcome?.reason)
        assertNull(outcome?.detail)
    }

    @Test
    fun `an outcome frame with no outcome is dropped`() {
        assertNull(readOutcomeFrame(frame("""{"turn":3}""")))
    }

    private fun entry(
        name: String,
        quantity: Int,
    ) = net.barnflix.proxic.deck.DeckEntry(quantity, name, null, null, "$quantity $name", 1)

    /**
     * §6.70 — a question says which game of the match it is in,
     * and the browser is told. An older worker that never restarts
     * sends nothing, which is the first game.
     */
    @Test
    fun `the game epoch is read and passed on, and absence means the first game`() {
        val base = """"decisionId":"9","actedForSeat":1,"authorisedSeat":1,"stateVersion":"9","options":[]"""
        val second = readDecisionFrame(frame("{$base,\"gameEpoch\":2}"))
        assertEquals(2, second?.gameEpoch)
        assertEquals("2", decisionMessage(second!!)["gameEpoch"].toString())

        assertEquals(1, readDecisionFrame(frame("{$base}"))?.gameEpoch)
    }

    /** PHASE_07 §7.55 — who conceded, by seat, as Forge recorded it; absent is nobody. */
    @Test
    fun `a concession names the seat that conceded`() {
        val conceded =
            readOutcomeFrame(frame("""{"outcome":"WINNER","winningSeat":2,"concededSeat":1,"turn":6}"""))
        assertEquals(2, conceded?.winningSeat)
        assertEquals(1, conceded?.concededSeat)

        assertNull(readOutcomeFrame(frame("""{"outcome":"WINNER","winningSeat":2,"turn":6}"""))?.concededSeat)

        val sent = concedeFrame(2)
        assertEquals("\"CONCEDE\"", sent["type"].toString())
        assertEquals("2", sent["seat"].toString())
    }
}
