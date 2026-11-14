package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.spellability.SpellAbility;

import java.util.List;

/**
 * Spec 0084 -- what the page needs to tell "spent" from "killed", a library
 * shuffled, a vehicle crewed, and a fight or bite spell, each read from
 * Forge's own record at the moment Forge reports it. Nothing here decides a
 * rule (ARCH-002): every answer is a question asked of Forge's state.
 *
 * Spent (item 1): a permanent sacrificed or used up as a COST, or by its
 * own ability, or by the rules finishing it (a Saga's last chapter, CR
 * 714.4). Forge fires GameEventCardSacrificed from
 * Player#addSacrificedThisTurn, inside GameAction#sacrifice, just before it
 * moves the card; at that moment:
 *   - Game#costPaymentStack is not empty while any cost is being paid
 *     (CostPayment#payCost / payComputerCosts push each cost part around
 *     its payment): a Treasure, a Clue, a fetch land, a sacrifice outlet's
 *     fodder, Village Rites' or Fling's additional cost -- spent;
 *   - otherwise, a spell or ability resolving whose host IS the sacrificed
 *     card sacrificed it by its own ability (Ball Lightning's end step,
 *     a failed echo) -- spent;
 *   - otherwise, nothing resolving and no cost: the rules did it, and the
 *     only sacrifice Forge's state-based actions make is a Saga's
 *     (GameAction#stateBasedAction_Saga) -- spent when it is a Saga.
 * Anything else (Diabolic Edict, Innocent Blood: another card's effect made
 * its controller sacrifice it) is a creature put down by an opponent's
 * card, and keeps the defeated look. Where Forge's record does not say
 * (an exception reading it), the answer is "not spent": the defeated look
 * stays, as the spec asks.
 */
final class Spent {

    private Spent() {
    }

    /** Whether the card Forge is sacrificing now was spent (see the class comment). */
    static boolean isSpent(Game game, int cardId) {
        if (game == null) {
            return false;
        }
        try {
            if (game.costPaymentStack.peek() != null) {
                return true;
            }
            if (game.getStack().isResolving()) {
                SpellAbility top = game.getStack().peekAbility();
                Card host = top == null ? null : top.getHostCard();
                return host != null && host.getId() == cardId;
            }
            Card card = game.findById(cardId);
            return card != null && card.isSaga();
        } catch (RuntimeException e) {
            return false;
        }
    }

    /**
     * Item 4 -- what kind of spell damage this is, read from the spell or
     * ability resolving now (its own effect and every sub-ability, as Forge
     * chains them: Prey Upon is a Pump with a Fight under it): "fight" when
     * one of them is Forge's Fight effect (each deals damage equal to its
     * power to the other), "bite" when one is a DealDamage whose damage
     * source is another card (Ram Through's `DamageSource$ ParentTarget`),
     * the source being a creature that is not the resolving card itself
     * (Prodigal Sorcerer's ping is its own: no bite). Null otherwise.
     */
    static String fightKind(Game game, forge.game.card.CardView source) {
        if (game == null || source == null) {
            return null;
        }
        try {
            if (!game.getStack().isResolving()) {
                return null;
            }
            SpellAbility top = game.getStack().peekAbility();
            if (top == null) {
                return null;
            }
            Card host = top.getHostCard();
            Card by = game.findById(source.getId());
            if (by == null || !by.isCreature() || (host != null && host.getId() == source.getId())) {
                return null;
            }
            boolean fight = false;
            boolean bite = false;
            for (SpellAbility sa = top; sa != null; sa = sa.getSubAbility()) {
                if (sa.getApi() == ApiType.Fight) {
                    fight = true;
                } else if (sa.getApi() == ApiType.DealDamage && sa.hasParam("DamageSource")) {
                    bite = true;
                }
            }
            return fight ? "fight" : bite ? "bite" : null;
        } catch (RuntimeException e) {
            return null;
        }
    }

    /**
     * Item 4 -- the fights of one round's fight and bite spells, in the
     * shape of a combat step's `fights` (CombatDamage), so the page plays the
     * combat fight: a fight is {attacker, defender: {object}, blockers:
     * [defender]} (both strike), a bite {attacker, defender: {object},
     * blockers: []} (only the biter strikes). The hit A->B of a fight whose
     * B->A is already told is the same fight.
     */
    static void addFight(JsonArray fights, String kind, String source, String target) {
        for (int i = 0; i < fights.size(); i++) {
            JsonObject f = fights.get(i).getAsJsonObject();
            String attacker = f.get("attacker").getAsString();
            String defender = f.getAsJsonObject("defender").get("object").getAsString();
            if ((attacker.equals(source) && defender.equals(target))
                    || (attacker.equals(target) && defender.equals(source))) {
                return;
            }
        }
        JsonObject defender = new JsonObject();
        defender.addProperty("object", target);
        fights.add(CombatDamage.fight(source, defender,
                "fight".equals(kind) ? List.of(target) : List.of()));
    }

    /**
     * Item 3 -- a vehicle crewed: the crew ability (Forge's Crew keyword
     * makes an Animate with a tapXType cost) has resolved, and the creatures
     * tapped to pay for it are Forge's paid list "Tapped" (what
     * Card#becomesCrewed records as crewing it). {card, by: [...]}; null
     * when the ability is not a crew or nothing was tapped. Public: the
     * vehicle and its crew are on the battlefield, tapped for all to see.
     */
    static JsonObject crewed(SpellAbility sa) {
        if (sa == null || sa.getHostCard() == null) {
            return null;
        }
        try {
            if (!sa.isCrew() || sa.getApi() != ApiType.Animate) {
                return null;
            }
            forge.game.card.CardCollection crew = sa.getPaidList("Tapped", true);
            if (crew == null || crew.isEmpty()) {
                return null;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("card", "card:" + sa.getHostCard().getId());
            JsonArray by = new JsonArray();
            for (Card c : crew) {
                by.add("card:" + c.getId());
            }
            entry.add("by", by);
            return entry;
        } catch (RuntimeException e) {
            return null;
        }
    }
}
