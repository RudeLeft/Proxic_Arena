package net.barnflix.proxic.match

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Phase 9 Amendment 21 — what the asked player is doing, for the others' waiting line. */
class AskingWordsTest {
    private fun question(
        kind: String,
        arrange: kotlinx.serialization.json.JsonObject? = null,
    ) = DecisionRequest(
        decisionId = 1,
        actedForSeat = 2,
        authorisedSeat = 2,
        kind = kind,
        stateVersion = 1,
        options = listOf(DecisionOption("card:7", "Secret Card")),
        prompt = "Divide cards into two piles: Secret Card, Another Secret",
        arrange = arrange,
    )

    @Test
    fun `public choices get their own words, priority none, the rest a plain choosing`() {
        val split = buildJsonObject { put("split", "two") }
        val piles = buildJsonObject { put("piles", "x") }
        assertEquals("Splitting the cards", doingWord(question("chooseEntitiesForEffect", split)))
        assertEquals("Choosing a pile", doingWord(question("chooseCardsPile", piles)))
        assertEquals("Choosing blockers", doingWord(question("declareBlockers")))
        assertEquals("Choosing a sector", doingWord(question("chooseSector")))
        assertNull(doingWord(question("chooseSpellAbilityToPlay")))
        assertEquals("Choosing", doingWord(question("chooseEntitiesForEffect")))
    }

    @Test
    fun `a choice from your own hand says so to you, and only to you`() {
        // Spec 0104: Alice (seat 2 here) chooses from Bob's (seat 1) hand.
        val hand =
            buildJsonObject {
                put("zone", "hand")
                put("owner", 1)
            }
        val asked = question("chooseSingleEntityForEffect", hand)
        assertEquals("Choosing from your hand", doingWord(asked, 1))
        // A spectator, or nobody named: the plain word.
        assertEquals("Choosing", doingWord(asked, null))
        assertEquals("Choosing", doingWord(asked, 3))
        // A library search is not a hand.
        val library = buildJsonObject { put("zone", "library") }
        assertEquals("Choosing", doingWord(question("chooseSingleEntityForEffect", library), 1))
    }

    @Test
    fun `an each-player sacrifice tells the next chooser, and only them`() {
        // Spec 0112: Alice (seat 2 here) chooses first; Bob (seat 1) is next.
        val asked = question("choosePermanentsToSacrifice").copy(nextSeats = listOf(1))
        assertEquals("Choosing what to sacrifice\u00A0· you choose next", doingWord(asked, 1))
        // Another reader, a spectator, the reconnect path (no reader): the plain words.
        assertEquals("Choosing what to sacrifice", doingWord(asked, 3))
        assertEquals("Choosing what to sacrifice", doingWord(asked, null))
        assertEquals("Choosing what to sacrifice", doingWord(asked, 2))
        // Nobody after them (Bob choosing last, a Diabolic Edict): never "next".
        val last = question("choosePermanentsToSacrifice")
        assertEquals("Choosing what to sacrifice", doingWord(last, 1))
        assertEquals("Choosing what to sacrifice", doingWord(last, 2))
    }

    @Test
    fun `the message carries the seat and the word, never the question`() {
        val split = buildJsonObject { put("split", "two") }
        val message = askingMessage(2, doingWord(question("chooseEntitiesForEffect", split)))
        assertEquals(setOf("protocolVersion", "type", "messageId", "seat", "doing"), message.keys)
        assertTrue("Secret" !in message.toString(), "the question's words never travel: $message")
        assertTrue("chooseEntitiesForEffect" !in message.toString(), "nor its kind: $message")
        // Nobody asked: no word either.
        assertEquals(setOf("protocolVersion", "type", "messageId", "seat"), askingMessage(null, "Choosing").keys)
    }
}
