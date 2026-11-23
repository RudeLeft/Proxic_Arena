package net.barnflix.proxic.worker.game;

import forge.game.zone.ZoneType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0116 -- a spell on the stack is offered once as a target, as the
 * spell ("Lightning Bolt on the stack"), never also as its card. The games
 * (Spellskite, Deflecting Swat, Counterspell, Remand, Unsubstantiate) are
 * scripts/check-spell-choices.py; the real click is
 * frontend/e2e/match-spell-choices.spec.ts.
 */
class SpellTargetOnceTest {

    @Test
    void aCardOnTheStackIsLeftOutWhenTheStackCanBeTargeted() {
        // Counterspell, Spellskite: the zone is the stack.
        assertTrue(MatchController.offeredAsItsSpell(List.of(ZoneType.Stack), ZoneType.Stack));
        // Remand-like "spell or permanent": the stack and the battlefield.
        assertTrue(MatchController.offeredAsItsSpell(List.of(ZoneType.Battlefield, ZoneType.Stack), ZoneType.Stack));
    }

    @Test
    void aCardInAnotherZoneStays() {
        // Unsubstantiate's creatures stay beside the Bolt on the stack.
        assertFalse(MatchController.offeredAsItsSpell(List.of(ZoneType.Battlefield, ZoneType.Stack),
                ZoneType.Battlefield));
        assertFalse(MatchController.offeredAsItsSpell(List.of(ZoneType.Graveyard, ZoneType.Stack), ZoneType.Graveyard));
    }

    @Test
    void withoutTheStackInTheZoneNothingIsLeftOut() {
        assertFalse(MatchController.offeredAsItsSpell(List.of(ZoneType.Battlefield), ZoneType.Battlefield));
        assertFalse(MatchController.offeredAsItsSpell(List.of(ZoneType.Battlefield), ZoneType.Stack));
        assertFalse(MatchController.offeredAsItsSpell(null, ZoneType.Stack));
        assertFalse(MatchController.offeredAsItsSpell(List.of(ZoneType.Stack), null));
    }
}
