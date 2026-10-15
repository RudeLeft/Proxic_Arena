package proxic.spike;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.card.CardView;
import forge.game.player.Player;
import forge.game.zone.ZoneType;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Phase 0A §0A.7 / P0A-E — per-viewer hidden-information probe.
 *
 * Builds, for one viewer, exactly what that viewer is entitled to know
 * about every card in the game, by asking Forge BOTH visibility
 * questions:
 *
 *   canBeShownTo          may the viewer see this card at all?
 *                         ZONE-level. Returns true unconditionally for
 *                         the battlefield.
 *   canFaceDownBeShownTo  may the viewer know WHAT IT IS?
 *                         Identity-level. The one that governs a
 *                         face-down permanent.
 *
 * Both were re-read at forge-2.0.15 and are unchanged from the old pin
 * (AGENTS STUB-004: a plausible name is not evidence).
 *
 * Asking only the first is how the old project leaked every face-down
 * creature's real name and power/toughness to the opponent. Asking only
 * the second would leak hands and libraries. The probe therefore
 * records BOTH answers per card, so a test can assert the asymmetry in
 * both directions (AGENTS HID-003): blanking everything is just as
 * wrong as blanking nothing, because a player may look at their own
 * face-down permanents (CR 713.4a).
 */
final class VisibilityProbe {
    private VisibilityProbe() {}

    /** What one viewer may know about one card. */
    record Seen(String zone, boolean visible, boolean identityVisible,
                String nameIfEntitled, boolean faceDown) {}

    /** cardId -> Seen, for one viewer. */
    static Map<Integer, Seen> dump(Game game, Player viewer) {
        Map<Integer, Seen> out = new LinkedHashMap<>();
        for (Player owner : game.getRegisteredPlayers()) {
            for (ZoneType z : new ZoneType[]{
                    ZoneType.Battlefield, ZoneType.Hand, ZoneType.Library,
                    ZoneType.Graveyard, ZoneType.Exile}) {
                for (Card c : owner.getCardsIn(z)) {
                    CardView v = c.getView();
                    boolean vis = v != null && v.canBeShownTo(viewer.getView());
                    boolean idVis = v == null || v.canFaceDownBeShownTo(viewer.getView());
                    // The name a correct serializer would send: only when
                    // the viewer is entitled to BOTH see the object and
                    // know its identity.
                    // Card.getName() returns the CURRENT state's name, and a
                    // face-down card's current state HAS NO NAME -- it comes
                    // back as the empty string. A serializer that trusts
                    // getName() therefore blanks the card for its own
                    // controller too, who is entitled to look (CR 713.4a).
                    // The real identity lives on the original state. This is
                    // the exact over-correction the old project shipped after
                    // fixing the leak, and it is why H4 has two halves.
                    String name = null;
                    if (vis && idVis) {
                        name = c.getName();
                        if ((name == null || name.isEmpty()) && c.isFaceDown()) {
                            forge.game.card.CardState orig =
                                    c.getOriginalState(forge.card.CardStateName.Original);
                            name = orig == null ? null : orig.getName();
                        }
                    }
                    out.put(c.getId(), new Seen(z.name(), vis, idVis, name, c.isFaceDown()));
                }
            }
        }
        return out;
    }

    // ---- accumulated findings across a whole game ------------------

    static final Set<String> LEAK_HAND = new LinkedHashSet<>();
    static final Set<String> LEAK_LIBRARY = new LinkedHashSet<>();
    static final Set<String> LEAK_FACEDOWN = new LinkedHashSet<>();
    static final Set<String> OWN_HAND_OK = new LinkedHashSet<>();
    static final Set<String> OWN_FACEDOWN_OK = new LinkedHashSet<>();
    static int faceDownSightings = 0;
    static int OWN_FACEDOWN_BLANK = 0;

    /** A name only counts if it actually identifies the card. */
    private static boolean named(Seen s) {
        return s.nameIfEntitled() != null && !s.nameIfEntitled().isEmpty();
    }
    static int samples = 0;

    /**
     * Sample the live game from both seats and record any violation.
     * Called often during play; cheap relative to a Forge decision.
     */
    static void sample(Game game) {
        samples++;
        for (Player viewer : game.getRegisteredPlayers()) {
            Map<Integer, Seen> seen = dump(game, viewer);
            for (Map.Entry<Integer, Seen> e : seen.entrySet()) {
                Seen s = e.getValue();
                Card card = findCard(game, e.getKey());
                if (card == null) continue;
                boolean mine = card.getController() == viewer;

                if (s.faceDown() && s.zone().equals("Battlefield")) {
                    faceDownSightings++;
                    if (mine) {
                        // H4b: the controller IS entitled to know.
                        if (s.identityVisible() && named(s)) {
                            OWN_FACEDOWN_OK.add(s.nameIfEntitled());
                        } else {
                            OWN_FACEDOWN_BLANK++;
                        }
                    } else {
                        // H4a: the opponent is NOT.
                        if (s.identityVisible() || named(s)) {
                            LEAK_FACEDOWN.add(s.nameIfEntitled() + " (card " + e.getKey() + ")");
                        }
                    }
                }
                if (s.zone().equals("Hand")) {
                    if (mine) {
                        if (named(s)) OWN_HAND_OK.add(s.nameIfEntitled()); // H3
                    } else if (s.visible() || named(s)) {
                        LEAK_HAND.add(s.nameIfEntitled() + " (card " + e.getKey() + ")"); // H1
                    }
                }
                if (s.zone().equals("Library") && !mine
                        && (s.visible() || named(s))) {
                    LEAK_LIBRARY.add(s.nameIfEntitled() + " (card " + e.getKey() + ")"); // H2
                }
            }
        }
    }

    private static Card findCard(Game game, int id) {
        for (Player p : game.getRegisteredPlayers()) {
            for (ZoneType z : new ZoneType[]{ZoneType.Battlefield, ZoneType.Hand,
                    ZoneType.Library, ZoneType.Graveyard, ZoneType.Exile}) {
                for (Card c : p.getCardsIn(z)) {
                    if (c.getId() == id) return c;
                }
            }
        }
        return null;
    }

    /** @return true if every hidden-information check passed. */
    static boolean report() {
        System.out.println();
        System.out.println("=== P0A-E hidden information (" + samples + " samples, both seats) ===");
        boolean ok = true;

        ok &= check("H1 opponent hand hidden", LEAK_HAND);
        ok &= check("H2 opponent library hidden", LEAK_LIBRARY);
        ok &= check("H4a face-down hidden from opponent", LEAK_FACEDOWN);

        System.out.printf("    %-42s %s%n", "H3 own hand visible",
                OWN_HAND_OK.isEmpty() ? "NO EVIDENCE" : "OK (" + OWN_HAND_OK.size() + " distinct cards)");
        ok &= !OWN_HAND_OK.isEmpty();

        if (faceDownSightings == 0) {
            System.out.printf("    %-42s %s%n", "H4 face-down permanent",
                    "NOT EXERCISED - no face-down permanent ever reached the battlefield");
            System.out.println("        This is NOT a pass. A filter that never fires and a");
            System.out.println("        filter that works look identical from outside (HID-004).");
            ok = false;
        } else {
            System.out.printf("    %-42s %s%n", "H4b controller sees own face-down",
                    OWN_FACEDOWN_OK.isEmpty()
                            ? "FAIL - blanked for its own controller too ("
                              + OWN_FACEDOWN_BLANK + " nameless sightings)"
                            : "OK " + OWN_FACEDOWN_OK);
            ok &= !OWN_FACEDOWN_OK.isEmpty();
            System.out.println("        face-down sightings: " + faceDownSightings);
        }
        return ok;
    }

    private static boolean check(String label, Set<String> leaks) {
        if (leaks.isEmpty()) {
            System.out.printf("    %-42s OK%n", label);
            return true;
        }
        System.out.printf("    %-42s LEAK (%d)%n", label, leaks.size());
        int shown = 0;
        for (String s : leaks) {
            System.out.println("        " + s);
            if (++shown >= 5) break;
        }
        return false;
    }
}
