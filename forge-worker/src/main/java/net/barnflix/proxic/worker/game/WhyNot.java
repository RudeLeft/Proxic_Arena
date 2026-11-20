package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.keyword.Keyword;
import forge.game.ability.ApiType;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.spellability.TargetRestrictions;

/**
 * Why a card the player clicked cannot do anything right now -- PHASE_07
 * §7.61 B7, owner decision 2026-10-21 ("Give the reason").
 *
 * Forge decides what is offered; it does not say why something is NOT.
 * So these sentences are read off Forge's own facts about the card --
 * tapped, summoning sick, defender, land drops left, sorcery timing --
 * and never decide anything: a card offered stays offered whatever this
 * says, and one not offered stays unclickable. When no fact explains
 * it, the sentence says so plainly rather than guessing.
 */
final class WhyNot {

    private WhyNot() {
    }

    /** A creature of the attacking player that is not offered as an attacker. */
    static String attack(Card creature) {
        if (creature.isTapped()) {
            return "It's tapped, so it can't attack.";
        }
        if (creature.hasSickness()) {
            return "It came in this turn, so it can't attack yet.";
        }
        if (creature.hasKeyword(Keyword.DEFENDER)) {
            return "It has defender, so it can't attack.";
        }
        return "It can't attack right now.";
    }

    /** A creature of the defending player that is not offered as a blocker. */
    static String block(Card creature) {
        if (creature.isTapped()) {
            return "It's tapped, so it can't block.";
        }
        return "It can't block any of the attackers.";
    }

    /**
     * Phase 9 W-16 -- an activated ability of a permanent the player
     * controls that Forge does not offer now: why, from Forge's facts
     * (loyalty, once a turn, timing, tapped).
     */
    static String ability(forge.game.spellability.SpellAbility sa, Card card, Player player) {
        if (sa.isPwAbility()) {
            if (card.getPlaneswalkerAbilityActivated() > 0) {
                return "Only once each turn, and you've used it.";
            }
            if (!player.canCastSorcery()) {
                return "Only in your main phase, with nothing on the stack.";
            }
            if (sa.getPayCosts() != null) {
                for (forge.game.cost.CostPart part : sa.getPayCosts().getCostParts()) {
                    if (part instanceof forge.game.cost.CostRemoveCounter remove
                            && remove.counter != null
                            && remove.counter.is(forge.game.card.CounterEnumType.LOYALTY)) {
                        Integer needed = remove.convertAmount();
                        int has = card.getCurrentLoyalty();
                        if (needed != null && needed > has) {
                            return "Needs " + needed + " loyalty (it has " + has + ").";
                        }
                    }
                }
            }
        }
        if (sa.getPayCosts() != null && sa.getPayCosts().hasTapCost()) {
            if (card.isTapped()) {
                return "It's tapped.";
            }
            if (card.isCreature() && card.hasSickness()) {
                return "It came in this turn, so it can't tap yet.";
            }
        }
        if (sa.getRestrictions() != null && sa.getRestrictions().isSorcerySpeed()
                && !player.canCastSorcery()) {
            return "Only in your main phase, with nothing on the stack.";
        }
        return "It can't be used right now.";
    }

    /**
     * Spec 0108, item 11 -- a card in hand with nothing offered for it, when
     * some of its abilities were left out for want of a target ([noTarget]):
     * the target's reason first, for this card's own ability.
     */
    static String play(Card card, Player player, java.util.Collection<SpellAbility> noTarget) {
        for (SpellAbility sa : noTarget) {
            if (sa.getHostCard() != null && sa.getHostCard().getId() == card.getId()) {
                return noTarget(targetless(sa));
            }
        }
        return play(card, player);
    }

    /**
     * Spec 0108, item 11 -- the step of [sa]'s chain that must target and
     * has nothing it could target, Forge's own answer
     * ({@link TargetRestrictions#hasCandidates}); null when every required
     * target can be chosen. A charm chooses its mode first (its modes are
     * not its chain yet), and "up to" targets need none: both stay offered.
     * An Aura spell's enchant target is its own target step.
     */
    static SpellAbility targetless(SpellAbility sa) {
        if (sa == null || sa.getApi() == ApiType.Charm) {
            return null;
        }
        for (SpellAbility step = sa; step != null; step = step.getSubAbility()) {
            if (!step.usesTargeting() || step.getMinTargets() < 1) {
                continue;
            }
            TargetRestrictions restrictions = step.getTargetRestrictions();
            if (restrictions != null && !restrictions.hasCandidates(step)) {
                return step;
            }
        }
        return null;
    }

    /**
     * Spec 0108, item 11 -- why: from Forge's own target prompt for the
     * step ("Select target attacking creature" says "There's no attacking
     * creature to target."); when Forge's words can't be read that way,
     * "There's nothing it can target right now." Never from Oracle text.
     */
    static String noTarget(SpellAbility step) {
        String prompt = step == null || step.getTargetRestrictions() == null
                ? null : step.getTargetRestrictions().getVTSelection();
        return noTargetWords(prompt);
    }

    static final String NOTHING_TO_TARGET = "There's nothing it can target right now.";

    /** The no-target sentence for Forge's target prompt [prompt] (words only). */
    static String noTargetWords(String prompt) {
        String lead = "Select target ";
        if (prompt == null || !prompt.startsWith(lead)) {
            return NOTHING_TO_TARGET;
        }
        String what = PlainWords.humanise(prompt.substring(lead.length()).trim());
        while (what.endsWith(".")) {
            what = what.substring(0, what.length() - 1).trim();
        }
        if (what.isEmpty() || !WORDS.matcher(what).matches()
                || what.matches("(?i)^(a|an|the|any|up|one|two|three)\\b.*")) {
            return NOTHING_TO_TARGET;
        }
        return "There's no " + what + " to target.";
    }

    /** Plain words: letters, spaces, commas, apostrophes, a hyphen inside a word. */
    private static final java.util.regex.Pattern WORDS =
            java.util.regex.Pattern.compile("[A-Za-z']+(?:-[A-Za-z']+)*(?:,?\\s+[A-Za-z']+(?:-[A-Za-z']+)*)*");

    /** A card in hand with nothing offered for it. */
    static String play(Card card, Player player) {
        if (card.isLand()) {
            if (player.getLandsPlayedThisTurn() >= player.getMaxLandPlays()) {
                return "You've already played a land this turn.";
            }
            if (!player.canCastSorcery()) {
                return "Lands are played in your main phase, with nothing on the stack.";
            }
            return "It can't be played right now.";
        }
        boolean instantSpeed = card.isInstant() || card.hasKeyword(Keyword.FLASH);
        if (!instantSpeed && !player.canCastSorcery()) {
            return "Only in your main phase, with nothing on the stack.";
        }
        return "It can't be cast right now.";
    }
}
