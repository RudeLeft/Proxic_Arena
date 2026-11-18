package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/**
 * Spec 0074, Amendment 1 (owner 2026-11-12) -- who is shown the report
 * window for a mill, a counter, or cards out of a graveyard or exile. Spec
 * 0097, item 7 (owner 2026-11-16): never the player who did it, whoever it
 * happened to (F-0097-E). The other kinds keep Amendment 13 item 7: not the
 * player who made the choices.
 */
class ActionReportsTest {

    private static final String ALICE = "Alice";
    private static final String BOB = "Bob";

    @Test
    void yourMillOnBobIsShownToBobOnly() {
        // Glimpse the Unthinkable: Alice acts, Bob's library. Spec 0097: no
        // window for Alice, who did it.
        assertFalse(ActionReports.tells(ActionReports.Kind.MILL, ALICE, ALICE, BOB, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.MILL, BOB, ALICE, BOB, ALICE));
    }

    @Test
    void millingYourselfIsShownOnlyToTheOtherPlayer() {
        assertFalse(ActionReports.tells(ActionReports.Kind.MILL, ALICE, ALICE, ALICE, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.MILL, BOB, ALICE, ALICE, ALICE));
    }

    @Test
    void bobsCounterspellOnYourSpellIsShownToYouOnly() {
        assertTrue(ActionReports.tells(ActionReports.Kind.COUNTER, ALICE, BOB, ALICE, BOB));
        // Spec 0097: Bob countered it -- no window for Bob.
        assertFalse(ActionReports.tells(ActionReports.Kind.COUNTER, BOB, BOB, ALICE, BOB));
        // Countering your own spell: the other player only.
        assertFalse(ActionReports.tells(ActionReports.Kind.COUNTER, BOB, BOB, BOB, BOB));
    }

    @Test
    void bobsRaiseDeadIsShownToYouNotToBob() {
        assertTrue(ActionReports.tells(ActionReports.Kind.RETURN, ALICE, BOB, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.RETURN, BOB, BOB, BOB, BOB));
        // Bojuka Bog: Alice exiles Bob's graveyard -- Bob only (spec 0097).
        assertFalse(ActionReports.tells(ActionReports.Kind.RETURN, ALICE, ALICE, BOB, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.RETURN, BOB, ALICE, BOB, ALICE));
    }

    @Test
    void aRestartIsToldToTheOtherPlayerOnly() {
        // Spec 0097, item 4: Bob's Karn Liberated.
        assertTrue(ActionReports.tells(ActionReports.Kind.RESTART, ALICE, BOB, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.RESTART, BOB, BOB, BOB, BOB));
        assertEquals("Bob restarted the game. This is game 2.", ActionReports.restartWords(BOB, 2));
    }

    @Test
    void anUnpaidTriggerSaysWhoCouldNotPay() {
        // Spec 0097, item 3: the fizzle window, both players (a FIZZLE).
        assertEquals("Bob's Lightning Rift did nothing: they couldn't pay {1}.",
                ActionReports.unpaidSentence(BOB, "Lightning Rift", "{1}"));
        assertEquals("Your Lightning Rift did nothing: you couldn't pay {1}.",
                ActionReports.unpaidSentence(null, "Lightning Rift", "{1}"));
    }

    @Test
    void theOtherKindsStillSpareTheOneWhoChose() {
        // Mind Rot on Bob: Bob chose his discards; Alice is shown them.
        assertTrue(ActionReports.tells(ActionReports.Kind.DISCARD, ALICE, ALICE, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.DISCARD, BOB, ALICE, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.SEARCH, ALICE, ALICE, ALICE, ALICE));
    }

    // --- spec 0075: the remaining card actions -------------------------------------

    @Test
    void bobsUnsummonOnYourCreatureIsShownToYouAlone() {
        // F-0075-A: Bob acts, the Bears were yours (the subject).
        assertTrue(ActionReports.tells(ActionReports.Kind.BOUNCE, ALICE, BOB, ALICE, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, BOB, BOB, ALICE, BOB));
        // Your Unsummon on his: his window only.
        assertTrue(ActionReports.tells(ActionReports.Kind.BOUNCE, BOB, ALICE, BOB, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, ALICE, ALICE, BOB, ALICE));
        // Bouncing your own creature: nobody.
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, ALICE, ALICE, ALICE, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.BOUNCE, BOB, ALICE, ALICE, ALICE));
    }

    @Test
    void cyclingIsShownOnlyToTheOtherPlayer() {
        // F-0075-B: Bob cycles -- your window; you cycle -- none.
        assertTrue(ActionReports.tells(ActionReports.Kind.CYCLE, ALICE, BOB, BOB, BOB));
        assertFalse(ActionReports.tells(ActionReports.Kind.CYCLE, BOB, BOB, BOB, BOB));
    }

    @Test
    void choicesAndFlipsAreTheOtherPlayers() {
        // F-0075-C: a choice report is told by its values: Bob's colour to you,
        // your own colour or flip to nobody.
        assertFalse(ActionReports.tells(ActionReports.Kind.CHOICE, ALICE, BOB, BOB, BOB));
        assertTrue(ActionReports.showsValue(ALICE, BOB, "color"));
        assertFalse(ActionReports.showsValue(BOB, BOB, "color"));
        assertFalse(ActionReports.showsValue(BOB, BOB, null));
        // Owner 2026-11-12: a flip is luck -- the flipper sees their own too.
        assertTrue(ActionReports.showsValue(BOB, BOB, "coin"));
        assertTrue(ActionReports.showsValue(ALICE, BOB, "coin"));
        // The empty look is made for its one reader (ActionReports#emptyLook), never by kind.
        assertFalse(ActionReports.tells(ActionReports.Kind.EMPTY_LOOK, ALICE, ALICE, BOB, ALICE));
    }

    // --- spec 0079: a spell that fizzled ------------------------------------------------

    @Test
    void aFizzleIsShownToBothPlayersTheCasterToo() {
        // F-0079-D (owner Q4 A): Alice's Bolt fizzled -- Alice's window and Bob's.
        assertTrue(ActionReports.tells(ActionReports.Kind.FIZZLE, ALICE, ALICE, ALICE, ALICE));
        assertTrue(ActionReports.tells(ActionReports.Kind.FIZZLE, BOB, ALICE, ALICE, ALICE));
        assertTrue(ActionReports.toBoth(ActionReports.Kind.FIZZLE));
    }

    @Test
    void theFizzleSentenceIsTheCanvasOne() {
        assertEquals("Alice's Lightning Bolt did nothing: its target was gone.",
                ActionReports.fizzleSentence("Alice", "Lightning Bolt", false, true, false));
        assertEquals("Your Lightning Bolt did nothing: its target was gone.",
                ActionReports.fizzleSentence(null, "Lightning Bolt", false, true, false));
        // A copy (Fork's) says so; several targets are plural.
        assertEquals("Your copy of Lightning Bolt did nothing: its target was gone.",
                ActionReports.fizzleSentence(null, "Lightning Bolt", true, true, false));
        assertEquals("Bob's Electrolyze did nothing: its targets were gone.",
                ActionReports.fizzleSentence("Bob", "Electrolyze", false, true, true));
        // A target still there but no longer allowed (it gained protection).
        assertEquals("Bob's Lightning Bolt did nothing: its target could no longer be chosen.",
                ActionReports.fizzleSentence("Bob", "Lightning Bolt", false, false, false));
    }

    // --- spec 0100, item 8: a beam that changes target -------------------------------

    @Test
    void bobsSpellskiteOnYourBoltIsToldToYouOnly() {
        // F-0100-B: Bob (actor) changed Alice's (subject) Bolt: Alice, the caster, is told.
        assertTrue(ActionReports.tells(ActionReports.Kind.RETARGET, ALICE, BOB, ALICE, BOB));
        // Bob, who did it, gets no window.
        assertFalse(ActionReports.tells(ActionReports.Kind.RETARGET, BOB, BOB, ALICE, BOB));
    }

    @Test
    void redirectingYourOwnSpellTellsNobody() {
        // F-0100-B: Alice's own Deflecting Swat on her own Bolt.
        assertFalse(ActionReports.tells(ActionReports.Kind.RETARGET, ALICE, ALICE, ALICE, ALICE));
        assertFalse(ActionReports.tells(ActionReports.Kind.RETARGET, BOB, ALICE, ALICE, ALICE));
    }

    @Test
    void theRetargetSentenceIsTheSpecs() {
        assertEquals("Bob changed your Lightning Bolt's target to Spellskite.",
                ActionReports.retargetWords("Bob", "Lightning Bolt", "Spellskite"));
        assertEquals("Bob changed your Lightning Bolt's target to you.",
                ActionReports.retargetWords("Bob", "Lightning Bolt", "you"));
    }
}
