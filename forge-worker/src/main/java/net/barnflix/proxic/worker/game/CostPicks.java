package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Spec 0070 -- a cost paid by picking cards one at a time says, with every
 * pick question, which cards are picked so far and what the cost does to
 * them, so the page can mark each at once (a Ribbon: TAP, SACRIFICE ...;
 * a card picked to tap leans as a tapped card does). And a picked card can
 * be picked again to take it back.
 *
 * Forge still pays the whole cost at the end, exactly as before: nothing
 * here touches the game. The picks so far are the asking player's own
 * business -- they travel on the question, which goes to the seat asked
 * and nobody else (the other player and spectators see the cost once it is
 * paid, in the snapshot, as before).
 *
 * The take-back is an extra answer the question accepts: "unpick:" + the
 * picked card's object id. It is NOT among the question's options on the
 * wire (the Mechanics Lab's scenarios pick "the last option offered", and
 * a take-back there would be a different answer); it travels in
 * `picking.picked[].actionId`, and the gate accepts it. Pure, so it is
 * tested without a game.
 */
public final class CostPicks {

    private CostPicks() {
    }

    /** What a take-back answer starts with. */
    static final String UNPICK = "unpick:";

    /**
     * What the cost does to the cards picked for it: the Ribbon's word,
     * its tone (the page's colour), and whether a picked card leans.
     */
    record Pay(String word, String tone, boolean lean) {
    }

    static final Pay TAP = new Pay("TAP", "tap", true);
    static final Pay UNTAP = new Pay("UNTAP", "untap", false);
    static final Pay SACRIFICE = new Pay("SACRIFICE", "sacrifice", false);
    static final Pay EXILE = new Pay("EXILE", "exile", false);
    static final Pay TO_HAND = new Pay("TO HAND", "hand", false);
    static final Pay TO_LIBRARY = new Pay("TO LIBRARY", "library", false);
    static final Pay TO_GRAVEYARD = new Pay("TO GRAVEYARD", "other", false);
    static final Pay REVEAL = new Pay("REVEAL", "reveal", false);
    static final Pay BEHOLD = new Pay("BEHOLD", "reveal", false);
    static final Pay DISCARD = new Pay("DISCARD", "discard", false);
    static final Pay UNATTACH = new Pay("UNATTACH", "other", false);
    static final Pay GAIN_CONTROL = new Pay("GIVE", "other", false);

    /**
     * The Pay of one of Forge's cost classes, by its simple name, for a
     * cost paid while something resolves (chooseCardsForCost: "unless you
     * return an Island"). A class not named here pays with the plain
     * "PAY" -- the cost's own word where Forge names another.
     */
    static Pay of(String costClass) {
        return switch (costClass == null ? "" : costClass) {
            case "CostTapType", "CostTap" -> TAP;
            case "CostUntapType", "CostUntap" -> UNTAP;
            case "CostSacrifice" -> SACRIFICE;
            case "CostExile", "CostBeholdExile", "CostCollectEvidence", "CostForage" -> EXILE;
            case "CostReturn" -> TO_HAND;
            case "CostPutCardToLib" -> TO_LIBRARY;
            case "CostExiledMoveToGrave" -> TO_GRAVEYARD;
            case "CostReveal" -> REVEAL;
            case "CostBehold" -> BEHOLD;
            case "CostDiscard" -> DISCARD;
            case "CostUnattach" -> UNATTACH;
            case "CostGainControl" -> GAIN_CONTROL;
            default -> new Pay("PAY", "other", false);
        };
    }

    /**
     * Spec 0071 -- a window's picks (Escape's "exile five other cards from
     * your graveyard", Delve, "up to N" from a search) that have no cost
     * class: the sign is where the cards go. Exile the star, a hand or a
     * library their signs; a graveyard has no sign of its own in 0070 (as
     * CostExiledMoveToGrave), so it and anything else get the plain dot.
     */
    static final Pay PICK = new Pay("PICK", "other", false);

    /** The Pay of picks going to [zone] (Forge's ZoneType name), or PICK. */
    static Pay toZone(String zone) {
        return switch (zone == null ? "" : zone) {
            case "Exile" -> EXILE;
            case "Hand" -> TO_HAND;
            case "Library" -> TO_LIBRARY;
            case "Graveyard" -> TO_GRAVEYARD;
            default -> PICK;
        };
    }

    /**
     * Spec 0071 -- whether a window's one-at-a-time picks (the worker's
     * pickSeveral, from chooseEntitiesForEffect) carry the picks so far and
     * take a pick back. Not when at most one can be picked (the one pick
     * ends the question: nothing is left on screen to take back), not when
     * anything offered is a player (nothing to sign), and not for the
     * windows that already lay picks out themselves: Fact or Fiction's
     * split (a pick moves a card between the piles) and Brainstorm's "to
     * the top" (each click is numbered in the order it will be drawn).
     * Nothing Forge acts on happens between the picks -- the list goes to
     * Forge only when the picking is over -- so every other pick can be
     * taken back.
     *
     * @param layout the question's layout key while it is asked ("split",
     *               "to", "zone"), or null
     */
    static boolean takesBack(int max, boolean allCards, String layout, String layoutValue) {
        if (max <= 1 || !allCards) {
            return false;
        }
        if ("split".equals(layout)) {
            return false;
        }
        return !("to".equals(layout) && "top".equals(layoutValue));
    }

    /** "unpick:card:12" for the card picked as "card:12". */
    static String unpickId(String objectId) {
        return UNPICK + objectId;
    }

    /**
     * The answers the gate accepts: the cards that may be picked, then a
     * take-back for each card picked so far.
     */
    static List<String> answers(Collection<String> optionIds, Collection<String> pickedObjectIds) {
        List<String> out = new ArrayList<>(optionIds);
        for (String objectId : pickedObjectIds) {
            out.add(unpickId(objectId));
        }
        return out;
    }

    /** The object a take-back answer gives back ("card:12"), or null for any other answer. */
    static String unpicked(String choice) {
        return choice != null && choice.startsWith(UNPICK) ? choice.substring(UNPICK.length()) : null;
    }

    /** True for a take-back answer: never shown as an option. */
    public static boolean isUnpick(String actionId) {
        return actionId != null && actionId.startsWith(UNPICK);
    }

    /**
     * The question's `picking`: the Pay, and each card picked so far --
     * its object id (the snapshot's), the take-back answer, and its name
     * as the asked player may know it -- in the order picked.
     *
     * @param picked object id to name, in the order picked
     */
    static JsonObject picking(Pay pay, Map<String, String> picked) {
        JsonObject out = new JsonObject();
        out.addProperty("word", pay.word());
        out.addProperty("tone", pay.tone());
        if (pay.lean()) {
            out.addProperty("lean", true);
        }
        JsonArray cards = new JsonArray();
        picked.forEach((objectId, name) -> {
            JsonObject one = new JsonObject();
            one.addProperty("objectId", objectId);
            one.addProperty("actionId", unpickId(objectId));
            one.addProperty("label", name);
            cards.add(one);
        });
        out.add("picked", cards);
        return out;
    }

    /** The same, from Forge's cards, named as [viewer] may know them. */
    static JsonObject picking(Pay pay, Iterable<forge.game.card.Card> chosen, forge.game.player.PlayerView viewer) {
        Map<String, String> picked = new java.util.LinkedHashMap<>();
        for (forge.game.card.Card card : chosen) {
            picked.put("card:" + card.getId(), ViewerSnapshot.nameFor(card, viewer));
        }
        return picking(pay, picked);
    }

    /**
     * Spec 0071 -- what is still offered: [options] in Forge's order without
     * [chosen], so a card taken back is offered again where it was.
     */
    static <T> List<T> left(Iterable<T> options, Collection<T> chosen) {
        List<T> out = new ArrayList<>();
        for (T one : options) {
            if (!chosen.contains(one)) {
                out.add(one);
            }
        }
        return out;
    }

    /** Which of [chosen] a take-back answer names, or null. */
    static forge.game.card.Card taken(String choice, Iterable<forge.game.card.Card> chosen) {
        String objectId = unpicked(choice);
        if (objectId == null) {
            return null;
        }
        for (forge.game.card.Card card : chosen) {
            if (objectId.equals("card:" + card.getId())) {
                return card;
            }
        }
        return null;
    }
}
