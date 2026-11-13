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

    /** Spec 0058, item 8 -- each card of a mutated creature wears its own picture. */
    @Test
    fun `the cards of a mutated creature each carry their art`() {
        val art = art()
        val pile =
            """{"id":"card:1","seat":1,"owner":1,"name":"Lightning Bolt","known":true,"merged":[""" +
                """{"id":"card:1","name":"Lightning Bolt","known":true,"seat":1,"owner":1},""" +
                """{"id":"card:2","name":"Plains","known":true,"seat":1,"owner":1}]}"""

        val seen = art.annotate(snapshot(pile), bob)
        val parts = seen["battlefield"]!!.jsonArray[0].jsonObject["merged"]!!.jsonArray

        assertEquals(bolt, parts[0].jsonObject["art"]?.jsonPrimitive?.content)
        assertEquals(plains, parts[1].jsonObject["art"]?.jsonPrimitive?.content)
        assertTrue(art.mayFetch(bob, plains), "shown in the pile, so fetchable")
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
     * Spec 0045 — the cards Forge revealed to this seat carry their pictures
     * (Goblin Ringleader's four), and so does the card being cast (missed in
     * spec 0042); only for the seat the snapshot is for.
     */
    @Test
    fun `revealed cards and the card being cast carry their art`() {
        val art = art()
        val state =
            Json.parseToJsonElement(
                """{"seat":1,"battlefield":[],"hand":[],"players":[],
                "casting":[${card("card:3", alice, "Lightning Bolt")}],
                "reveal":{"key":"reveal:1","title":"Goblin Ringleader revealed:",
                "cards":[${card("card:9", bob, "Black Lotus")}]}}""",
            ).jsonObject

        val seen = art.annotate(state, alice)
        assertEquals(bolt, seen["casting"]!!.jsonArray[0].jsonObject["art"]?.jsonPrimitive?.content)
        val reveal = seen["reveal"]!!.jsonObject
        assertEquals("Goblin Ringleader revealed:", reveal["title"]?.jsonPrimitive?.content)
        assertEquals(secret, reveal["cards"]!!.jsonArray[0].jsonObject["art"]?.jsonPrimitive?.content)
        assertTrue(art.mayFetch(alice, secret), "shown, so fetchable")
        assertFalse(art.mayFetch(bob, secret), "only the seat it was shown to")
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
     * Spec 0001 D3 — the cards a question shows (a surveil's top cards)
     * wear their pictures, and being shown them authorises exactly those
     * -- for the seat asked, not the other.
     */
    @Test
    fun `the cards a question shows carry their art for the asked seat only`() {
        val art = art()
        val looking =
            listOf(card("card:20", bob, "Black Lotus"), card("card:21", bob, "Plains", known = false))
                .map { Json.parseToJsonElement(it).jsonObject }

        val shown = art.annotateCards(looking, bob)

        assertEquals(secret, shown[0]["art"]?.jsonPrimitive?.content)
        assertNull(shown[1]["art"], "a card the asker may not identify gets none")
        assertTrue(art.mayFetch(bob, secret))
        assertFalse(art.mayFetch(alice, secret), "the other player was shown nothing")
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

    /**
     * PHASE_07 §7.59, P7-W — the Deck Builder bundles a back face's own
     * picture, filed by that face's name. Turned over, the card wears it;
     * the front's picture is never used for it, by printing or by name.
     */
    @Test
    fun `a card turned over wears its back face's own picture when the deck carried one`() {
        val back = "d".repeat(64)
        val art =
            MatchArt(
                mapOf(
                    alice to
                        mapOf(
                            "Reckless Stormseeker // Storm-Charged Slasher" to bolt,
                            "${MatchArt.PRINTING}MID/157|Reckless Stormseeker // Storm-Charged Slasher" to bolt,
                            "${MatchArt.FACE}storm-charged slasher" to back,
                        ),
                ),
            )

        val front = art.annotate(snapshot(printed("card:1", alice, "Reckless Stormseeker", "MID/157")), alice)
        val turned = art.annotate(snapshot(printed("card:1", alice, "Storm-Charged Slasher", "MID/157")), alice)

        assertEquals(bolt, artOf(front))
        assertEquals(back, artOf(turned), "the back face's own picture")
        assertTrue(art.mayFetch(alice, back), "being shown it is what authorises it")
        // Bob was never shown the back: he may not fetch it.
        assertEquals(false, art.mayFetch(bob, back))
    }

    /** Spec 0022 — a token wears only a TOKEN picture, never a card's or a face's of its name. */
    @Test
    fun `a token gets no picture even when one is filed under its name`() {
        val art = MatchArt(mapOf(alice to mapOf("${MatchArt.FACE}goblin" to bolt, "Goblin" to bolt)))
        val token = """{"id":"card:9","seat":$alice,"name":"Goblin","known":true,"token":true}"""

        assertNull(artOf(art.annotate(snapshot(token), alice)))
        assertEquals(false, art.mayFetch(alice, bolt))
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

    private fun token(
        id: String,
        controller: Int,
        name: String,
    ) = """{"id":"$id","seat":$controller,"name":"$name","known":true,"token":true}"""

    /**
     * Spec 0022, F-0022-B, owner S4 — Pongify gives Bob an Ape. Bob's deck
     * brought no Ape picture, so his "Ape Token" wears the Ape Alice's deck
     * brought, on both players' screens, and each may fetch it once shown.
     */
    @Test
    fun `a token wears a picture by name, from the other deck when its controller brought none`() {
        val ape = "d".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("${MatchArt.TOKEN}ape" to ape), bob to mapOf("Plains" to plains)))

        assertEquals(ape, artOf(art.annotate(snapshot(token("card:5", bob, "Ape Token")), bob)))
        assertEquals(ape, artOf(art.annotate(snapshot(token("card:5", bob, "Ape Token")), alice)))
        assertTrue(art.mayFetch(bob, ape) && art.mayFetch(alice, ape))
        assertNull(artOf(art.annotate(snapshot(token("card:6", bob, "Goblin Token")), bob)), "nobody brought a Goblin")
    }

    /** F-0022-C — when both decks brought one, each token wears its controller's. */
    @Test
    fun `the controller's token picture comes first`() {
        val alicesApe = "d".repeat(64)
        val bobsApe = "e".repeat(64)
        val art =
            MatchArt(
                mapOf(
                    alice to mapOf("${MatchArt.TOKEN}ape" to alicesApe),
                    bob to mapOf("${MatchArt.TOKEN}ape" to bobsApe),
                ),
            )
        val both = snapshot(token("card:5", alice, "Ape Token"), token("card:6", bob, "Ape Token"))

        val seen = art.annotate(both, alice)
        assertEquals(alicesApe, artOf(seen, 0))
        assertEquals(bobsApe, artOf(seen, 1))
    }

    /** A token Forge names by its own name ("Avacyn") matches as it is. */
    @Test
    fun `a token with its own name matches by that name`() {
        val avacyn = "f".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("${MatchArt.TOKEN}avacyn" to avacyn)))

        assertEquals(avacyn, artOf(art.annotate(snapshot(token("card:7", alice, "Avacyn")), alice)))
    }

    private fun owned(
        id: String,
        controller: Int,
        owner: Int,
        name: String,
        known: Boolean = true,
    ) = """{"id":"$id","seat":$controller,"owner":$owner,"name":"$name",""" +
        """"known":$known,"tapped":false,"faceDown":false}"""

    /**
     * Spec 0049 — a creature Alice took from Bob (Control Magic) sits on
     * Alice's side, `seat` 1, and is still Bob's card: its picture is in
     * Bob's deck. It was looked for in Alice's and came out bare.
     */
    @Test
    fun `a stolen card wears its owner's picture, not its controller's`() {
        val art = art()

        val seen = art.annotate(snapshot(owned("card:9", alice, bob, "Black Lotus")), alice)

        assertEquals(secret, artOf(seen), "Bob's card, from Bob's deck")
        assertTrue(art.mayFetch(alice, secret))
    }

    /**
     * Spec 0049 — the same card name in both decks: the stolen copy wears
     * the OWNER's printing, not the thief's.
     */
    @Test
    fun `a stolen card does not borrow the thief's copy of the same card`() {
        val alicesGuide = "d".repeat(64)
        val bobsGuide = "e".repeat(64)
        val art =
            MatchArt(
                mapOf(
                    alice to mapOf("Goblin Guide" to alicesGuide),
                    bob to mapOf("Goblin Guide" to bobsGuide),
                ),
            )

        val seen = art.annotate(snapshot(owned("card:9", alice, bob, "Goblin Guide")), alice)

        assertEquals(bobsGuide, artOf(seen))
        assertFalse(art.mayFetch(alice, alicesGuide), "the thief's own copy was never shown")
    }

    /** Spec 0049 — a spell Alice cast from Bob's library is Bob's card on the stack. */
    @Test
    fun `a spell cast from an opponent's library wears its owner's picture`() {
        val art = art()
        val state =
            Json.parseToJsonElement(
                """{"seat":1,"battlefield":[],"hand":[],"players":[],"stack":[
                {"id":"stack:1","name":"Black Lotus","controller":1,"owner":2,"kind":"spell"}]}""",
            ).jsonObject

        val stack = art.annotate(state, alice)["stack"]!!.jsonArray
        assertEquals(secret, stack[0].jsonObject["art"]?.jsonPrimitive?.content)
    }

    /**
     * Spec 0049 — an opponent's hand Forge lets this viewer see
     * (Telepathy, Mindslaver), the graveyards and exile carry pictures,
     * and being shown them is what authorises them. A face-down exiled
     * card (foretell) still carries none.
     */
    @Test
    fun `a revealed hand, the graveyards and exile carry their pictures`() {
        val art = art()
        val state =
            Json.parseToJsonElement(
                """{"seat":1,"battlefield":[],"hand":[],"players":[],
                "otherHands":[${owned("card:1", bob, bob, "Black Lotus")}],
                "graveyard":[${owned("card:2", alice, alice, "Lightning Bolt")}],
                "exile":[${owned("card:3", bob, bob, "Plains")},
                         ${owned("card:4", bob, bob, "Black Lotus", known = false)}]}""",
            ).jsonObject

        val seen = art.annotate(state, alice)

        fun artIn(
            zone: String,
            index: Int = 0,
        ) = seen[zone]!!.jsonArray[index].jsonObject["art"]?.jsonPrimitive?.content

        assertEquals(secret, artIn("otherHands"))
        assertEquals(bolt, artIn("graveyard"))
        assertEquals(plains, artIn("exile"))
        assertNull(artIn("exile", 1), "a face-down exiled card names nothing")
        assertTrue(art.mayFetch(alice, secret) && art.mayFetch(alice, bolt) && art.mayFetch(alice, plains))
        assertFalse(art.mayFetch(bob, secret), "only the seat it was shown to")
    }

    private val boltCrop = "1".repeat(64)
    private val delverCrop = "2".repeat(64)
    private val apeCrop = "3".repeat(64)
    private val lotusCrop = "4".repeat(64)

    private fun cropped() =
        MatchArt(
            mapOf(
                alice to
                    mapOf(
                        "Lightning Bolt" to bolt,
                        "${MatchArt.CROP}lightning bolt" to boltCrop,
                        "Delver of Secrets // Insectile Aberration" to plains,
                        "${MatchArt.CROP}delver of secrets" to delverCrop,
                        "${MatchArt.TOKEN}ape" to secret,
                        "${MatchArt.CROP}ape" to apeCrop,
                    ),
                bob to mapOf("${MatchArt.CROP}black lotus" to lotusCrop),
            ),
        )

    private fun cropOf(
        state: JsonObject,
        index: Int = 0,
    ): String? = state["battlefield"]!!.jsonArray[index].jsonObject["crop"]?.jsonPrimitive?.content

    /** Spec 0051, F-0051-E — a card wears its art crop beside its picture, and may fetch both. */
    @Test
    fun `a card wears its art crop beside its picture`() {
        val art = cropped()

        val seen = art.annotate(snapshot(card("card:1", alice, "Lightning Bolt")), bob)

        assertEquals(bolt, artOf(seen))
        assertEquals(boltCrop, cropOf(seen))
        assertTrue(art.mayFetch(bob, boltCrop), "shown, so fetchable")
        assertFalse(art.mayFetch(alice, boltCrop), "only the seat it was shown to")
    }

    /**
     * Spec 0051 — a crop goes only where its picture goes: Bob's deck
     * brought a Black Lotus crop and no picture, so a Lotus wears neither,
     * and a hidden card never names one.
     */
    @Test
    fun `a crop without its picture, or on a hidden card, is not shown`() {
        val art = cropped()

        val seen =
            art.annotate(
                snapshot(card("card:2", bob, "Black Lotus"), card("card:3", alice, "Lightning Bolt", known = false)),
                alice,
            )

        assertNull(cropOf(seen, 0))
        assertNull(cropOf(seen, 1))
        assertFalse(art.mayFetch(alice, lotusCrop))
        assertFalse(art.mayFetch(alice, boltCrop))
    }

    /** Spec 0051 — a card turned over does not borrow its front's crop. */
    @Test
    fun `a card turned over does not wear its front's crop`() {
        val art = cropped()

        val front = art.annotate(snapshot(card("card:4", alice, "Delver of Secrets")), alice)
        assertEquals(delverCrop, cropOf(front))
        val back = art.annotate(snapshot(card("card:4", alice, "Insectile Aberration")), alice)
        assertNull(cropOf(back))
    }

    /** Spec 0051 — a token wears the crop its deck brought for that token picture; a spell on the stack its own. */
    @Test
    fun `a token and a spell on the stack wear their crops`() {
        val art = cropped()

        val seen = art.annotate(snapshot(token("card:5", bob, "Ape Token")), bob)
        assertEquals(secret, artOf(seen))
        assertEquals(apeCrop, cropOf(seen))

        val state =
            Json.parseToJsonElement(
                """{"seat":2,"battlefield":[],"hand":[],"players":[],"stack":[
                {"id":"stack:1","name":"Lightning Bolt","controller":1,"owner":1,"kind":"spell"}]}""",
            ).jsonObject
        val stack = art.annotate(state, bob)["stack"]!!.jsonArray
        assertEquals(boltCrop, stack[0].jsonObject["crop"]?.jsonPrimitive?.content)
    }

    /**
     * Spec 0053, F-0053-B (unit half) -- each printing wears its own picture
     * and its own art crop; a printing the deck brought no crop for wears the
     * name's crop, and a card on the stack (no printing) the name's.
     */
    @Test
    fun `each printing wears its own picture and art crop`() {
        val m59 = "1".repeat(64)
        val m60 = "2".repeat(64)
        val nameCrop = "3".repeat(64)
        val crop60 = "4".repeat(64)
        val art =
            MatchArt(
                mapOf(
                    alice to
                        mapOf(
                            "Mountain" to m59,
                            "${MatchArt.PRINTING}EVG/59|Mountain" to m59,
                            "${MatchArt.PRINTING}EVG/60|Mountain" to m60,
                            "${MatchArt.CROP}mountain" to nameCrop,
                            MatchArt.cropOfPrinting("EVG/60", "Mountain") to crop60,
                        ),
                ),
            )

        val seen =
            art.annotate(
                snapshot(
                    printed("card:1", alice, "Mountain", "EVG/59"),
                    printed("card:2", alice, "Mountain", "EVG/60"),
                ),
                alice,
            )

        assertEquals(m59, artOf(seen, 0))
        assertEquals(nameCrop, cropOf(seen, 0), "no crop of its own: the name's")
        assertEquals(m60, artOf(seen, 1))
        assertEquals(crop60, cropOf(seen, 1), "its own printing's crop")
        assertTrue(art.mayFetch(alice, crop60))
    }

    /**
     * Spec 0079 -- a copy wears the picture of what it copied. Found by
     * reading the lookup (no Lab game runs through the server): Alice's
     * Clone of Bob's Serra Angel is "Serra Angel" with Clone's printing and
     * Alice as its owner, and her deck brought no Angel, so it showed no
     * picture. The worker says whose deck the copied card's picture is in
     * (`artOwner`); the copy wears it, on both screens.
     */
    @Test
    fun `a copy wears the copied card's picture from that card's owner's deck`() {
        val angel = "f".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("Clone" to plains), bob to mapOf("Serra Angel" to angel)))
        val before =
            """{"id":"card:7","seat":$alice,"owner":$alice,"name":"Serra Angel","known":true,""" +
                """"printing":"M14/47","copy":true}"""
        assertNull(artOf(art.annotate(snapshot(before), alice)), "Alice's deck has no Serra Angel")
        val clone = before.removeSuffix("}") + ""","artOwner":$bob}"""
        assertEquals(angel, artOf(art.annotate(snapshot(clone), alice)))
        assertEquals(angel, artOf(art.annotate(snapshot(clone), bob)))
        assertTrue(art.mayFetch(alice, angel), "shown, so fetchable")
    }

    /** Spec 0079 -- Fork's copy of Bob's Bolt, Alice's spell, wears Bob's Bolt. */
    @Test
    fun `a copied spell wears the picture of the spell it copies`() {
        val bobsBolt = "9".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("Fork" to plains), bob to mapOf("Lightning Bolt" to bobsBolt)))
        val state =
            Json.parseToJsonElement(
                """{"seat":1,"battlefield":[],"hand":[],"players":[],"stack":[
                {"id":"stack:3","name":"Lightning Bolt","owner":1,"controller":1,"kind":"spell","copy":true,
                 "artOwner":2},
                {"id":"stack:2","name":"Lightning Bolt","owner":2,"controller":2,"kind":"spell"}]}""",
            ).jsonObject
        val stack = art.annotate(state, alice)["stack"]!!.jsonArray
        assertEquals(bobsBolt, stack[0].jsonObject["art"]?.jsonPrimitive?.content)
        assertEquals(bobsBolt, stack[1].jsonObject["art"]?.jsonPrimitive?.content)
    }

    /** Spec 0082 -- a copy on its way onto the stack (`copying`) wears its picture as it will there. */
    @Test
    fun `a copy on its way onto the stack wears the picture of the spell it copies`() {
        val bobsBolt = "9".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("Fork" to plains), bob to mapOf("Lightning Bolt" to bobsBolt)))
        val state =
            Json.parseToJsonElement(
                """{"seat":1,"battlefield":[],"hand":[],"players":[],"stack":[],"copying":[
                {"id":"copying:40","source":"card:90","name":"Lightning Bolt","owner":1,"controller":1,
                 "kind":"spell","copy":true,"copyOf":"stack:2","artOwner":2,"aiming":true}]}""",
            ).jsonObject
        val copying = art.annotate(state, alice)["copying"]!!.jsonArray
        assertEquals(bobsBolt, copying[0].jsonObject["art"]?.jsonPrimitive?.content)
        assertTrue(art.mayFetch(alice, bobsBolt), "shown, so fetchable")
    }

    /**
     * Spec 0079 -- a token copy (Cackling Counterpart's Serra Angel) wears
     * the copied card's picture; a token that is no copy still never borrows
     * a card's (spec 0022), and a copy with no card picture keeps its token one.
     */
    @Test
    fun `a token copy wears the card it copies, other tokens only token pictures`() {
        val angel = "f".repeat(64)
        val tokenAngel = "8".repeat(64)
        val art = MatchArt(mapOf(alice to mapOf("Serra Angel" to angel, "${MatchArt.TOKEN}goblin" to tokenAngel)))
        val copy =
            """{"id":"card:9","seat":$alice,"owner":$alice,"name":"Serra Angel","known":true,""" +
                """"token":true,"copy":true}"""
        assertEquals(angel, artOf(art.annotate(snapshot(copy), alice)))
        assertNull(artOf(art.annotate(snapshot(token("card:10", alice, "Serra Angel")), alice)))
        val goblin =
            """{"id":"card:11","seat":$alice,"owner":$alice,"name":"Goblin","known":true,""" +
                """"token":true,"copy":true}"""
        assertEquals(tokenAngel, artOf(art.annotate(snapshot(goblin), alice)))
    }
}
