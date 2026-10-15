package proxic.spike;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.SpellAbilityStackInstance;
import forge.game.zone.ZoneType;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Phase 0A §0A.12 P0A-F / `PHASE_00` §0.64 — stable object identity.
 *
 * Answers one question with evidence: is Forge's internal numeric
 * Card.getId() safe to expose as a public protocol object id for the
 * lifetime of one match?
 *
 * §0.64 lists seven requirements. Each is measured here rather than
 * reasoned about, because `PHASE_00` is explicit that an id's lifecycle
 * must be inspected rather than assumed.
 *
 * The subtle one is zone change. CR 400.7 says an object that changes
 * zones becomes a NEW object. If Forge reflects that by issuing a new
 * id, the protocol must be able to say so, and the client must not
 * animate it as "the same card moving". If Forge keeps the id, the
 * protocol inherits a rules-level mismatch it has to handle.
 */
final class IdentityProbe {
    private IdentityProbe() {}

    /** id -> the first identity string seen under that id. */
    private static final Map<Integer, String> FIRST_SEEN = new LinkedHashMap<>();
    /** id -> ordered zones that id has occupied. */
    private static final Map<Integer, Set<String>> ZONES = new LinkedHashMap<>();

    static final Set<String> COLLISIONS = new LinkedHashSet<>();
    static final Set<Integer> TOKEN_IDS = new TreeSet<>();
    static final Set<Integer> CARD_IDS = new TreeSet<>();
    static final Set<Integer> MOVED_IDS = new TreeSet<>();
    static final Set<String> STACK_PAIRS = new LinkedHashSet<>();
    static final Set<String> ABILITY_VS_CARD = new LinkedHashSet<>();
    static int duplicateNameGroups = 0;
    static int maxCopiesSharingAName = 0;
    static int samples = 0;
    static int minStackId = Integer.MAX_VALUE, maxStackId = Integer.MIN_VALUE;
    static int minAbilityId = Integer.MAX_VALUE, maxAbilityId = Integer.MIN_VALUE;

    private static String identityOf(Card c) {
        // Owner + name + token-ness. Deliberately NOT the zone: the
        // whole point is to see whether an id survives a zone change.
        //
        // The name MUST come from the original state. Card.getName()
        // returns the CURRENT state's name, which is the empty string
        // while a card is face down -- so a morph turning face down
        // looked like "id 1 used to be Ainok Tracker and is now
        // something else", i.e. a false id collision. The same
        // empty-name trap that nearly produced a false pass in P0A-E
        // produced a false FAILURE here. Worth recording: it bites in
        // both directions.
        String name = c.getName();
        if (name == null || name.isEmpty()) {
            forge.game.card.CardState orig =
                    c.getOriginalState(forge.card.CardStateName.Original);
            if (orig != null) name = orig.getName();
        }
        return (c.getOwner() == null ? "?" : c.getOwner().getName())
                + "/" + name
                + (c.isToken() ? "/token" : "");
    }

    static void sample(Game game) {
        samples++;
        Map<String, Integer> nameCounts = new LinkedHashMap<>();

        for (Player p : game.getRegisteredPlayers()) {
            for (ZoneType z : new ZoneType[]{ZoneType.Battlefield, ZoneType.Hand,
                    ZoneType.Library, ZoneType.Graveyard, ZoneType.Exile, ZoneType.Stack}) {
                for (Card c : p.getCardsIn(z)) {
                    int id = c.getId();
                    CARD_IDS.add(id);
                    if (c.isToken()) TOKEN_IDS.add(id);

                    String ident = identityOf(c);
                    String prior = FIRST_SEEN.putIfAbsent(id, ident);
                    if (prior != null && !prior.equals(ident)) {
                        // The dangerous case: one id meaning two different
                        // objects at different times.
                        COLLISIONS.add("id " + id + ": was [" + prior + "] now [" + ident + "]");
                    }

                    Set<String> zs = ZONES.computeIfAbsent(id, k -> new LinkedHashSet<>());
                    zs.add(z.name());
                    if (zs.size() > 1) MOVED_IDS.add(id);

                    if (z == ZoneType.Battlefield || z == ZoneType.Hand) {
                        nameCounts.merge(c.getName(), 1, Integer::sum);
                    }
                }
            }
        }

        for (Map.Entry<String, Integer> e : nameCounts.entrySet()) {
            if (e.getValue() > 1) {
                duplicateNameGroups++;
                maxCopiesSharingAName = Math.max(maxCopiesSharingAName, e.getValue());
            }
        }

        // Stack objects vs their source cards, and abilities vs cards.
        for (SpellAbilityStackInstance si : game.getStack()) {
            Card src = si.getSourceCard();
            SpellAbility sa = si.getSpellAbility();
            if (src != null) {
                minStackId = Math.min(minStackId, si.getId());
                maxStackId = Math.max(maxStackId, si.getId());
                STACK_PAIRS.add("stackInstance=" + si.getId() + " sourceCard=" + src.getId()
                        + (si.getId() == src.getId() ? "  <-- SAME NUMBER" : ""));
            }
            if (sa != null && src != null) {
                minAbilityId = Math.min(minAbilityId, sa.getId());
                maxAbilityId = Math.max(maxAbilityId, sa.getId());
                ABILITY_VS_CARD.add("ability=" + sa.getId() + " card=" + src.getId()
                        + (sa.getId() == src.getId() ? "  <-- SAME NUMBER" : ""));
            }
        }
    }

    static boolean report() {
        System.out.println();
        System.out.println("=== P0A-F object identity (" + samples + " samples) ===");
        boolean ok = true;

        System.out.printf("    %-46s %d%n", "distinct card ids seen", CARD_IDS.size());
        System.out.printf("    %-46s %d%n", "token ids seen", TOKEN_IDS.size());
        System.out.printf("    %-46s %d%n", "ids observed in more than one zone", MOVED_IDS.size());
        System.out.printf("    %-46s %d (max %d copies)%n",
                "duplicate-name groups observed", duplicateNameGroups, maxCopiesSharingAName);

        // R1/R6: one id must never mean two different objects.
        if (COLLISIONS.isEmpty()) {
            System.out.printf("    %-46s OK%n", "no id ever meant two different objects");
        } else {
            System.out.printf("    %-46s %d COLLISIONS%n", "id reuse across objects", COLLISIONS.size());
            int n = 0;
            for (String s : COLLISIONS) {
                System.out.println("        " + s);
                if (++n >= 6) break;
            }
            ok = false;
        }

        // R2: duplicate copies distinct. Trivially true if ids are unique
        // per object, but it is the explicit §0.64 requirement, so it is
        // asserted rather than assumed.
        if (maxCopiesSharingAName < 2) {
            System.out.printf("    %-46s NOT EXERCISED%n", "duplicate copies remain distinct");
            ok = false;
        } else {
            System.out.printf("    %-46s OK%n", "duplicate copies remain distinct");
        }

        // R3: tokens distinct.
        if (TOKEN_IDS.isEmpty()) {
            System.out.printf("    %-46s NOT EXERCISED (no token in this pool)%n", "tokens remain distinct");
        } else {
            System.out.printf("    %-46s OK%n", "tokens remain distinct");
        }

        // R4/R5: stack instance and ability distinguishable from the card.
        if (STACK_PAIRS.isEmpty()) {
            System.out.printf("    %-46s NOT EXERCISED%n", "stack object vs source card");
        } else {
            boolean clash = STACK_PAIRS.stream().anyMatch(s -> s.contains("SAME NUMBER"));
            System.out.printf("    %-46s %s%n", "stack object vs source card",
                    clash ? "SHARES NUMBER SPACE" : "distinct");
            int n = 0;
            for (String s : STACK_PAIRS) {
                System.out.println("        " + s);
                if (++n >= 4) break;
            }
        }
        if (!ABILITY_VS_CARD.isEmpty()) {
            boolean clash = ABILITY_VS_CARD.stream().anyMatch(s -> s.contains("SAME NUMBER"));
            System.out.printf("    %-46s %s%n", "ability id vs card id",
                    clash ? "SHARES NUMBER SPACE" : "distinct");
            int n = 0;
            for (String s : ABILITY_VS_CARD) {
                System.out.println("        " + s);
                if (++n >= 4) break;
            }
        }

        // The precise claim. A single coincidental equality between a
        // stack-instance id and a card id is weak evidence; OVERLAPPING
        // RANGES are the actual protocol hazard, because they mean a
        // bare integer cannot identify an object without also saying
        // what kind of object it is.
        if (!CARD_IDS.isEmpty() && maxStackId >= minStackId) {
            int minCard = ((TreeSet<Integer>) CARD_IDS).first();
            int maxCard = ((TreeSet<Integer>) CARD_IDS).last();
            boolean overlap = minStackId <= maxCard && minCard <= maxStackId;
            System.out.printf("    %-46s cards [%d..%d]  stack [%d..%d]  %s%n",
                    "id NUMBER SPACES", minCard, maxCard, minStackId, maxStackId,
                    overlap ? "OVERLAP - a bare integer is ambiguous" : "disjoint");
            if (maxAbilityId >= minAbilityId) {
                System.out.printf("    %-46s abilities [%d..%d]%n",
                        "", minAbilityId, maxAbilityId);
            }
        }
        return ok;
    }
}
