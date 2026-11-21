package net.barnflix.proxic.worker.game;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import forge.game.card.Card;
import forge.game.zone.Zone;
import forge.game.zone.ZoneType;
import org.junit.jupiter.api.Test;

/**
 * Spec 0111 -- ViewerSnapshot#pairedWith: Forge's current soulbond pair, only
 * while both cards are on the battlefield. Forge keeps a real token's link
 * after the token leaves (GameAction#changeZone unpairs only the survivor),
 * a state no Lab game reached a snapshot in (check-soulbond.py token-dies),
 * so the battlefield guard's bite (HID-004) is this test: the cards are
 * Forge's own, moved between Forge's own zones.
 */
class PairedWithTest {

    private static Card paired(Card a, Card b) {
        a.setPairedWith(b);
        b.setPairedWith(a);
        return a;
    }

    @Test
    void bothOnTheBattlefieldNameEachOther() {
        Zone battlefield = new Zone(ZoneType.Battlefield, null);
        Card lookout = new Card(1, null);
        Card cathar = new Card(2, null);
        lookout.setZone(battlefield);
        cathar.setZone(battlefield);
        paired(lookout, cathar);
        assertEquals("card:2", ViewerSnapshot.pairedWith(lookout));
        assertEquals("card:1", ViewerSnapshot.pairedWith(cathar));
    }

    @Test
    void aLinkKeptOffTheBattlefieldIsNeverSent() {
        Zone battlefield = new Zone(ZoneType.Battlefield, null);
        Zone graveyard = new Zone(ZoneType.Graveyard, null);
        Card lookout = new Card(1, null);
        Card token = new Card(2, null);
        lookout.setZone(battlefield);
        token.setZone(battlefield);
        paired(lookout, token);
        // The token has left and still holds its link (as Forge leaves it);
        // here the survivor still holds one too, the worst case.
        token.setZone(graveyard);
        assertNull(ViewerSnapshot.pairedWith(token), "the card that left names nobody");
        assertNull(ViewerSnapshot.pairedWith(lookout), "the survivor names no card off the battlefield");
    }

    @Test
    void unpairedNamesNobody() {
        Zone battlefield = new Zone(ZoneType.Battlefield, null);
        Card lookout = new Card(1, null);
        lookout.setZone(battlefield);
        assertNull(ViewerSnapshot.pairedWith(lookout));
    }
}
