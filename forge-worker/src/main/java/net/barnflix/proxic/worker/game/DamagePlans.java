package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.combat.Combat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Spec 0107 -- the trample splits a player changed with "Change split",
 * kept until combat damage.
 *
 * A trampler's split is made for its player at damage (lethal to each
 * blocker, the rest to the defender: the owner's exception, Q5b). "Change
 * split" at declare blockers asks the damage question right then; its
 * answer waits here, per seat, per attacker, for this combat only, and is
 * used at damage when it still fits. Nothing here goes to Forge before
 * damage, and nothing here is in any board: the plan is the attacker's
 * private intent until the damage lands (spec 0107, Risks 1). Forge still
 * applies whatever map it is given; the fit check below only decides
 * whether the plan is still the player's answer or must be asked again.
 */
final class DamagePlans {

    /** One plan: the blockers, what each gets, and the defender's share. */
    record Plan(Combat combat, List<Integer> blockers, int damage, Map<Integer, Integer> toBlockers,
            int toDefender) {

        /**
         * Still the player's answer: the same combat, the same blockers
         * still blocking, the same damage, and trample's lethal-first still
         * holding with the blockers' lethal NOW (damage marked since, a
         * deathtouch gained or lost). Otherwise it is asked again (spec 0107,
         * item 7: owner decision default).
         */
        boolean fits(Combat now, Card attacker, forge.game.card.CardCollectionView current, int damageNow) {
            if (now != combat || damageNow != damage || current.size() != blockers.size()) {
                return false;
            }
            int sum = toDefender;
            for (Card blocker : current) {
                // The same blockers (Forge may order them for damage only now).
                if (!blockers.contains(blocker.getId())) {
                    return false;
                }
                int planned = toBlockers.getOrDefault(blocker.getId(), 0);
                if (toDefender > 0 && planned < CombatChoices.lethal(attacker, blocker)) {
                    return false;
                }
                sum += planned;
            }
            return sum == damage;
        }
    }

    /** seat -> attacker card id -> plan. */
    private final Map<Integer, Map<Integer, Plan>> plans = new HashMap<>();

    synchronized void put(int seat, int attacker, Plan plan) {
        Map<Integer, Plan> mine = plans.computeIfAbsent(seat, k -> new HashMap<>());
        // An older combat's plans go: a plan lasts for its combat only.
        mine.values().removeIf(p -> p.combat() != plan.combat());
        mine.put(attacker, plan);
    }

    /** The plan [seat] made for [attacker] in this combat, taken (it is used once), or null. */
    synchronized Plan take(int seat, int attacker, Combat combat) {
        Map<Integer, Plan> mine = plans.get(seat);
        if (mine == null) {
            return null;
        }
        Plan plan = mine.remove(attacker);
        // An older combat's plans are dropped whenever one is looked for.
        mine.values().removeIf(p -> p.combat() != combat);
        return plan != null && plan.combat() == combat ? plan : null;
    }
}
