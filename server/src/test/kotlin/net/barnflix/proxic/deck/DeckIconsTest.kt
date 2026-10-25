package net.barnflix.proxic.deck

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Spec 0012 — the icon names, and a deck's colours. */
class DeckIconsTest {
    @Test
    fun `the server knows exactly the icons the Deck Depot ships`() {
        // The Gradle test runs in server/; the files are the frontend's.
        val shipped =
            File("../frontend/src/assets/deck-icons").listFiles()!!
                .map { it.name.removeSuffix(".webp") }
                .toSet()
        assertEquals(100, DeckIcons.NAMES.size)
        assertEquals(DeckIcons.NAMES, shipped)
    }

    private fun card(colors: String?) = CardResolution("x", CardResolution.Status.RESOLVED, null, colors = colors)

    @Test
    fun `a deck's colours are every colour of its cards, in WUBRG order`() {
        assertEquals("WR", DeckIcons.deckColors(listOf(card("R"), card("W"), card(""))))
        assertEquals("WUBRG", DeckIcons.deckColors(listOf(card("GW"), card("UB"), card("R"))))
        assertEquals("", DeckIcons.deckColors(listOf(card(""), card(""))), "colourless")
        assertNull(DeckIcons.deckColors(listOf(card(null))), "Forge said nothing: unknown")
    }
}
