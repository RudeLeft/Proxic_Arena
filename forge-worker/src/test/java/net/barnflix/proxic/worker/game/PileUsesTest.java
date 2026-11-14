package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** Spec 0087 -- what each viewer is told about the pile cards a player may use. */
class PileUsesTest {

    @Test
    void aViewerWhoMaySeeTheCardIsToldEveryUse() {
        JsonArray told = PileUses.usesFor(true, List.of(
                new PileUses.Use(1, "cast", false),
                new PileUses.Use(2, "ability", false)));
        assertEquals("[{\"seat\":1,\"how\":\"cast\"},{\"seat\":2,\"how\":\"ability\"}]", told.toString());
        // Only an effect lets them (no spell the zone check found): a play.
        assertEquals("[{\"seat\":1,\"how\":\"cast\"}]",
                PileUses.usesFor(true, List.of(new PileUses.Use(1, null, true))).toString());
    }

    @Test
    void aHiddenCardStandsInTheFanOnlyForAPublicReason() {
        // Bob's view of Alice's foretold card (open), and of a card Alice's
        // zone check alone found (not open): only the first, and plainly "cast".
        JsonArray told = PileUses.usesFor(false, List.of(
                new PileUses.Use(1, "cast", true),
                new PileUses.Use(2, "ability", false)));
        assertEquals("[{\"seat\":1,\"how\":\"cast\"}]", told.toString());
        // A Gonti card that turns out to be a land has no zone-check use for
        // Alice, but the effect is public: Bob still sees it in her fan.
        assertEquals("[{\"seat\":1,\"how\":\"cast\"}]",
                PileUses.usesFor(false, List.of(new PileUses.Use(1, null, true))).toString());
        // An ability is never named to someone who may not see the card.
        assertEquals("[{\"seat\":1,\"how\":\"cast\"}]",
                PileUses.usesFor(false, List.of(new PileUses.Use(1, "ability", true))).toString());
        assertEquals(0, PileUses.usesFor(false, null).size());
    }
}
