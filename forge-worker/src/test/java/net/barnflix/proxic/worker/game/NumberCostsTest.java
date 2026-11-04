package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Phase 9 W-11 (Amendment 14) -- the dial's words: what each number costs,
 * and the card's sentence about it. Words only; Forge prices the real cost.
 */
class NumberCostsTest {

    @Test
    void xIsFilledIn() {
        assertEquals("{3}{R}", NumberCosts.withX("{X}{R}", 3));
        assertEquals("{R}{R}", NumberCosts.withX("{X}{R}{R}", 0));
        // Two X's (Crackle with Power): each counts.
        assertEquals("{8}{R}{R}", NumberCosts.withX("{X}{X}{R}{R}", 4));
        assertEquals("{4}", NumberCosts.withX("{X}", 4));
        assertEquals("{0}", NumberCosts.withX("{X}", 0));
    }

    @Test
    void aKickerIsAddedEachTime() {
        // Everflowing Chalice: {0}, multikicker {2}.
        assertEquals("{0}", NumberCosts.plus("{0}", "{2}", 0));
        assertEquals("{6}", NumberCosts.plus("{0}", "{2}", 3));
        // Comet Storm: {X}{R}{R}, multikicker {1} -- its X is still to come.
        assertEquals("{X}{2}{R}{R}", NumberCosts.plus("{X}{R}{R}", "{1}", 2));
        // A coloured kicker keeps its colour each time.
        assertEquals("{1}{G}{G}{G}", NumberCosts.plus("{1}{G}", "{G}", 2));
    }

    @Test
    void manaValueCountsEverySymbolButX() {
        assertEquals(4, NumberCosts.manaValue("{3}{R}"));
        assertEquals(2, NumberCosts.manaValue("{X}{R}{R}"));
        assertEquals(0, NumberCosts.manaValue("{0}"));
        assertEquals(3, NumberCosts.manaValue("{W/U}{2}"));
    }

    @Test
    void theCardsSentenceAboutTheNumber() {
        assertEquals("Fireball deals X damage divided evenly, rounded down, among any number of targets.",
                NumberCosts.sentence("This spell costs {1} more to cast for each target beyond the first.\\n"
                        + "Fireball deals X damage divided evenly, rounded down, among any number of targets.",
                        "\\bX\\b"));
        assertEquals("Harnessed Lightning deals that much damage to that creature.",
                NumberCosts.sentence("Choose target creature. You get {E}{E}{E} (three energy counters), "
                        + "then you may pay any amount of {E}. Harnessed Lightning deals that much damage to "
                        + "that creature.", "that much"));
        // Reminder text is not the card's sentence.
        assertNull(NumberCosts.sentence("Flying (This creature can't be blocked except by X.)", "\\bX\\b"));
        assertNull(NumberCosts.sentence(null, "X"));
    }
}
