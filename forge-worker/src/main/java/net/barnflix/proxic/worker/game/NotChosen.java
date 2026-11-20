package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;

/**
 * Spec 0104 -- why a card the chooser is shown cannot be chosen: Appetite
 * for Brains shows Bob's whole hand, and under each card it does not allow,
 * the reason ("mana value 1", "a land").
 *
 * The reason is FORGE's: the effect's own restriction (`ChangeType$
 * Card.cmcGE4`, `Card.nonLand`), each part of it asked of Forge's own
 * valid-card test ({@link Card#isValid}) on the card as it is now; the
 * first part it fails names the reason, said from the card's current
 * values (its mana value, whether it is a land). Nothing is read from
 * Oracle text (ARCH-006) and nothing here decides what may be chosen:
 * Forge already made that list. Where no part can be named -- a
 * restriction of several alternatives, a test this file has no words for --
 * the reason is "can't be chosen", as the page said before (STUB-005).
 */
final class NotChosen {

    static final String CANT = "can't be chosen";

    private NotChosen() {
    }

    /** Why [card], shown with [sa]'s question, is not one of its answers. */
    static String why(Card card, SpellAbility sa) {
        if (card == null || sa == null) {
            return CANT;
        }
        String type = sa.getParam("ChangeType");
        if (type == null || type.isBlank() || type.contains(",") || type.startsWith("EACH")) {
            return CANT;
        }
        int dot = type.indexOf('.');
        String base = dot < 0 ? type : type.substring(0, dot);
        Player you = sa.getActivatingPlayer();
        Card host = sa.getHostCard();
        try {
            if (!card.isValid(base, you, host, sa)) {
                return baseWords(base);
            }
            if (dot < 0) {
                return CANT;
            }
            for (String part : type.substring(dot + 1).split("\\+")) {
                if (!card.isValid(base + "." + part, you, host, sa)) {
                    return reason(part, card.isLand(), card.getCMC());
                }
            }
        } catch (RuntimeException e) {
            // A restriction Forge cannot test outside its effect: no words.
            return CANT;
        }
        return CANT;
    }

    /**
     * The words for one failed part of a restriction. A mana value test a
     * land fails is said "a land" (a land has no mana cost: "mana value 0"
     * would read as a number the player could change).
     */
    static String reason(String part, boolean land, int manaValue) {
        if (part.startsWith("cmc")) {
            return land ? "a land" : "mana value " + manaValue;
        }
        return switch (part) {
            case "nonLand" -> "a land";
            case "nonCreature" -> "a creature";
            case "nonArtifact" -> "an artifact";
            case "nonEnchantment" -> "an enchantment";
            case "nonPlaneswalker" -> "a planeswalker";
            case "nonInstant" -> "an instant";
            case "nonSorcery" -> "a sorcery";
            case "nonBasic" -> "a basic land";
            case "nonLegendary" -> "legendary";
            default -> CANT;
        };
    }

    /** "Creature" failed: "not a creature". */
    static String baseWords(String base) {
        return switch (base) {
            case "Creature" -> "not a creature";
            case "Land" -> "not a land";
            case "Artifact" -> "not an artifact";
            case "Enchantment" -> "not an enchantment";
            case "Instant" -> "not an instant";
            case "Sorcery" -> "not a sorcery";
            case "Planeswalker" -> "not a planeswalker";
            default -> CANT;
        };
    }
}
