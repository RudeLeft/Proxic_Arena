package net.barnflix.proxic.match

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Match-time artwork, and who may fetch it — PHASE_06 §6.121–§6.131.
 *
 * Acceptance tests P6-X, P6-Y and P6-Z in one place, because they
 * are three questions about one rule: a viewer may fetch exactly
 * the images they have been shown.
 *
 * The privacy half is not tested by inspecting a page. §6.42's
 * standard is what reaches the wire, so these assert on the
 * annotated snapshot itself and on the authorization that goes
 * with it.
 */
class MatchArtTest {
    private val alice = 1
    private val bob = 2

    private val bolt = "a".repeat(64)
    private val plains = "b".repeat(64)
    private val secret = "c".repeat(64)

    private fun art() =
        MatchArt(
            mapOf(
                alice to mapOf("Lightning Bolt" to bolt, "Plains" to plains),
                // In Bob's deck and never played: the asset that
                // P6-Z says Alice must not be able to reach.
                bob to mapOf("Black Lotus" to secret, "Plains" to plains),
            ),
        )

    private fun snapshot(vararg cards: String): JsonObject =
        Json.parseToJsonElement(
            """{"seat":1,"battlefield":[${cards.joinToString(",")}],"hand":[],"players":[]}""",
        ).jsonObject

    private fun card(
        id: String,
        seat: Int,
        name: String,
        known: Boolean = true,
    ) = """{"id":"$id","seat":$seat,"name":"$name","known":$known,"tapped":false,"faceDown":false}"""

    private fun artOf(
        state: JsonObject,
        index: Int = 0,
    ): String? = state["battlefield"]!!.jsonArray[index].jsonObject["art"]?.jsonPrimitive?.content

    /** P6-X — a visible card maps to its owner's imported artwork. */
    @Test
    fun `a card the viewer can see carries its owner's art`() {
        val art = art()

        val seen = art.annotate(snapshot(card("card:1", alice, "Lightning Bolt")), alice)

        assertEquals(bolt, artOf(seen))
        assertTrue(art.mayFetch(alice, bolt), "being shown it is what authorises it")
    }

    /**
     * P6-X, and the reason §6.122 is a MATCH route.
     *
     * Bob's card on the battlefield is Alice's to look at, and the
     * art comes from BOB's deck. A Deck Depot check would refuse
     * this, which is the whole point of the section.
     */
    @Test
    fun `an opponent's visible card carries the opponent's art`() {
        val art = art()

        val seen = art.annotate(snapshot(card("card:9", bob, "Plains")), alice)

        assertEquals(plains, artOf(seen))
        assertTrue(art.mayFetch(alice, plains))
    }

    /**
     * PHASE_07 (owner 2026-10-21) — a spell on the stack is drawn as its
     * card: it wears the caster's art, and that is what authorises it. A
     * face-down spell, named "Face-down" to the opponent, carries none.
     */
    @Test
    fun `a spell on the stack carries its caster's art, and a face-down one none`() {
        val art = art()
        val state =
            Json.parseToJsonElement(
                """{"seat":2,"battlefield":[],"hand":[],"players":[],"stack":[
                {"id":"stack:1","name":"Lightning Bolt","controller":1,"kind":"spell"},
                {"id":"stack:2","name":"Face-down","controller":1,"kind":"spell"}]}""",
            ).jsonObject

        val seen = art.annotate(state, bob)
        val stack = seen["stack"]!!.jsonArray
        assertEquals(bolt, stack[0].jsonObject["art"]?.jsonPrimitive?.content)
        assertNull(stack[1].jsonObject["art"])
        assertTrue(art.mayFetch(bob, bolt))
        assertFalse(art.mayFetch(bob, plains), "only what was shown")
    }

    /**
     * P6-Y, §6.124, §6.125 — a card the viewer may not identify
     * carries no reference, so there is nothing to ask for.
     *
     * This is the face-down case too: the worker sends `known:
     * false` and no usable name, and an opponent cannot retrieve
     * the front face of something they were never told the name
     * of.
     */
    @Test
    fun `a hidden card carries no art and authorises nothing`() {
        val art = art()

        val seen =
            art.annotate(snapshot(card("card:4", bob, "Black Lotus", known = false)), alice)

        assertNull(artOf(seen), "§6.124 — no real reference for a hidden identity")
        assertFalse(art.mayFetch(alice, secret))
    }

    /**
     * P6-Z, §6.129 — seeing one card does not open the package.
     *
     * Alice has been shown a Plains from Bob's deck. The Black
     * Lotus is in the same deck, in the same art map, and she has
     * never seen it. Guessing its hash must get her nothing.
     */
    @Test
    fun `being shown one card does not authorise the rest of that deck`() {
        val art = art()

        art.annotate(snapshot(card("card:9", bob, "Plains")), alice)

        assertTrue(art.mayFetch(alice, plains))
        assertFalse(art.mayFetch(alice, secret), "§6.129 — not enumerable")
    }

    /**
     * §6.129 again, from the other side: authorization is PER
     * VIEWER, not per match.
     *
     * Bob being shown his own card does not let Alice fetch it.
     * Both are participants, so a check that only asked "is this
     * person in the match" would pass here and be wrong.
     */
    @Test
    fun `one player's view does not authorise the other player`() {
        val art = art()

        art.annotate(snapshot(card("card:9", bob, "Black Lotus")), bob)

        assertTrue(art.mayFetch(bob, secret))
        assertFalse(art.mayFetch(alice, secret))
    }

    /**
     * §6.128 — a token is in nobody's deck package.
     *
     * It must not crash, must not invent a lookup, and must not
     * reach the Internet. It simply has no reference and the page
     * falls back to its own presentation.
     */
    @Test
    fun `a token has no art and nothing breaks`() {
        val art = art()

        val seen = art.annotate(snapshot(card("card:77", alice, "Goblin Token")), alice)

        assertNull(artOf(seen))
    }

    /** A card with no art in the deck is left exactly as it was. */
    @Test
    fun `a card whose deck carried no art is untouched`() {
        val art = art()
        val state = snapshot(card("card:3", alice, "Mountain"))

        val seen = art.annotate(state, alice)

        assertNull(artOf(seen))
        assertEquals(
            state["battlefield"]!!.jsonArray[0].jsonObject.keys,
            seen["battlefield"]!!.jsonArray[0].jsonObject.keys,
        )
    }

    /** Everything else in the snapshot survives the rewrite. */
    @Test
    fun `annotating keeps the rest of the snapshot`() {
        val art = art()
        val state = snapshot(card("card:1", alice, "Lightning Bolt"))

        val seen = art.annotate(state, alice)

        assertEquals(state["seat"], seen["seat"])
        assertEquals(state["players"], seen["players"])
        assertEquals(1, seen["battlefield"]!!.jsonArray.size)
        assertEquals(
            "card:1",
            seen["battlefield"]!!.jsonArray[0].jsonObject["id"]?.jsonPrimitive?.content,
        )
    }

    /**
     * A two-faced card: the deck stores "A // B", Forge names "A".
     *
     * Found by LOOKING at a running match: Reckless Stormseeker sat
     * in hand as a blank tile while every other card had its art.
     * The lookup trimmed the name Forge sent, which is already the
     * front face, instead of the name the deck stored.
     */
    @Test
    fun `a two-faced card is matched by its front face`() {
        val slasher = "d".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("Reckless Stormseeker // Storm-Charged Slasher" to slasher)))

        val seen = art.annotate(snapshot(card("card:1", alice, "Reckless Stormseeker")), alice)

        assertEquals(slasher, artOf(seen))
        assertTrue(art.mayFetch(alice, slasher))
    }

    /**
     * P6-BD, owner decision 2026-10-20 — two printings of one card,
     * two pictures. Each copy carries the printing Forge built it from,
     * and the deck filed each printing's art under it.
     */
    @Test
    fun `each printing of a card shows its own picture`() {
        val m10 = "e".repeat(64)
        val a25 = "f".repeat(64)
        val art =
            MatchArt(
                mapOf(
                    alice to
                        mapOf(
                            "Lightning Bolt" to a25,
                            "${MatchArt.PRINTING}M10/146|Lightning Bolt" to m10,
                            "${MatchArt.PRINTING}A25/141|Lightning Bolt" to a25,
                        ),
                ),
            )

        val seen =
            art.annotate(
                snapshot(
                    printed("card:1", alice, "Lightning Bolt", "M10/146"),
                    printed("card:2", alice, "Lightning Bolt", "A25/141"),
                    // A printing the deck carried no art for falls back to the name.
                    printed("card:3", alice, "Lightning Bolt", "2XM/129"),
                ),
                alice,
            )

        assertEquals(m10, artOf(seen, 0))
        assertEquals(a25, artOf(seen, 1))
        assertEquals(a25, artOf(seen, 2))
    }

    /**
     * And a printing is never a back door to a front face: a two-faced
     * card has ONE printing for both faces, so a transformed card does
     * not wear its front's picture through it.
     */
    @Test
    fun `a transformed card does not borrow its front's art by printing`() {
        val art =
            MatchArt(
                mapOf(
                    alice to
                        mapOf(
                            "Reckless Stormseeker // Storm-Charged Slasher" to bolt,
                            "${MatchArt.PRINTING}MID/157|Reckless Stormseeker // Storm-Charged Slasher" to bolt,
                        ),
                ),
            )

        val front = art.annotate(snapshot(printed("card:1", alice, "Reckless Stormseeker", "MID/157")), alice)
        val back = art.annotate(snapshot(printed("card:1", alice, "Storm-Charged Slasher", "MID/157")), alice)

        assertEquals(bolt, artOf(front))
        assertNull(artOf(back))
    }

    private fun printed(
        id: String,
        seat: Int,
        name: String,
        printing: String,
    ) = """{"id":"$id","seat":$seat,"name":"$name","known":true,"printing":"$printing"}"""

    /**
     * And not by its back. The stored image is the FRONT, so a
     * transformed card showing it would be showing the wrong card;
     * no art is the honest answer until the package carries backs.
     */
    @Test
    fun `a transformed card does not borrow its front's art`() {
        val art = MatchArt(mapOf(alice to mapOf("Reckless Stormseeker // Storm-Charged Slasher" to bolt)))

        val seen = art.annotate(snapshot(card("card:1", alice, "Storm-Charged Slasher")), alice)

        assertNull(artOf(seen))
    }
}
