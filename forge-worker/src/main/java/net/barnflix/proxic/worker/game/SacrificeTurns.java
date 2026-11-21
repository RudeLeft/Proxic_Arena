package net.barnflix.proxic.worker.game;

import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CardCollectionView;
import forge.game.card.CardLists;
import forge.game.card.CardPredicates;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.ToIntFunction;

/**
 * Spec 0112 -- Barter in Blood's "each player sacrifices": who still chooses
 * after the player being asked, and what the players before them sacrificed.
 *
 * Forge's `SacrificeEffect` asks the players one at a time, in its own list's
 * order (`SpellAbilityEffect.getTargetPlayers`, APNAP from the active
 * player), and sacrifices each answer before it asks the next. This class
 * reads that same list -- it extends `SpellAbilityEffect` only to call its
 * protected `getTargetPlayers` (VEND-003: a subclass, never a copy) -- and
 * filters each player's battlefield with Forge's own filter, as the effect
 * does (`AbilityUtils.filterListByType` with the effect's `SacValid`, then
 * `CardPredicates.canBeSacrificedBy`), so a player Forge will not ask (no
 * creature to sacrifice) is not "next".
 *
 * `nextSeats` goes to the server only (its waiting line, "you choose next");
 * `earlier` goes with the question to the asked seat: the cards each earlier
 * player chose that are now in a graveyard (public: they were on the
 * battlefield and are in a graveyard). Never the options they were offered.
 */
final class SacrificeTurns extends forge.game.ability.SpellAbilityEffect {

    private SacrificeTurns() {
    }

    /**
     * The choices made so far, per resolution: the stack entry resolving
     * (Forge's own object, by identity, held weakly: gone once resolved),
     * then the sacrifice ability within it, then each player's chosen card
     * ids in the order they chose. A second cast of the same card is a new
     * stack entry, so it never sees the first one's choices.
     */
    private static final Map<Object, Map<SpellAbility, Map<Player, List<Integer>>>> CHOSEN =
            java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

    /** Forge's own list of the players this sacrifice asks, in its order; empty when it is not one. */
    static List<Player> order(SpellAbility sa) {
        if (sa == null || sa.getApi() != ApiType.Sacrifice || sa.getHostCard() == null
                || "Self".equals(sa.getParamOrDefault("SacValid", "Self"))) {
            return List.of();
        }
        try {
            return new ArrayList<>(getTargetPlayers(sa));
        } catch (RuntimeException e) {
            // Not resolvable now: nobody is "next" (the line stays plain).
            return List.of();
        }
    }

    /**
     * Will Forge ask [player] for [sa]? As `SacrificeEffect.resolve` decides:
     * not for a random sacrifice, not when a strict amount cannot be met, and
     * not when Forge's own filter leaves them nothing (the controller is then
     * never asked, MatchController#choosePermanents).
     */
    static boolean hasChoice(SpellAbility sa, Player player) {
        if (sa.hasParam("Random")) {
            return false;
        }
        String valid = sa.getParamOrDefault("SacValid", "Self");
        CardCollectionView battlefield = player.getCardsIn(ZoneType.Battlefield);
        try {
            if (sa.hasParam("SacEachValid")) {
                for (String each : valid.split(" & ")) {
                    if (!offered(sa, battlefield, each).isEmpty()) {
                        return true;
                    }
                }
                return false;
            }
            CardCollectionView offered = offered(sa, battlefield, valid);
            if (sa.hasParam("StrictAmount")) {
                int amount = AbilityUtils.calculateAmount(sa.getHostCard(), sa.getParamOrDefault("Amount", "1"), sa);
                return offered.size() >= amount && !offered.isEmpty();
            }
            return !offered.isEmpty();
        } catch (RuntimeException e) {
            // Not resolvable now: treated as asked, as ActionReports#handHasChoice does.
            return true;
        }
    }

    private static CardCollectionView offered(SpellAbility sa, CardCollectionView battlefield, String valid) {
        CardCollectionView cards = AbilityUtils.filterListByType(battlefield, valid, sa);
        return sa.hasParam("Destroy") ? cards : CardLists.filter(cards, CardPredicates.canBeSacrificedBy(sa, true));
    }

    /** The resolving stack entry, or null when nothing resolves (a cost, not an effect). */
    private static Object resolving(Game game) {
        if (game == null || !game.getStack().isResolving() || game.getStack().isEmpty()) {
            return null;
        }
        return game.getStack().peek();
    }

    /** [player] chose [cards] for [sa]: kept for the players asked after them. */
    static void chose(Game game, SpellAbility sa, Player player, Iterable<Card> cards) {
        Object entry = resolving(game);
        if (entry == null || sa == null || order(sa).isEmpty()) {
            return;
        }
        List<Integer> ids = new ArrayList<>();
        cards.forEach(card -> ids.add(card.getId()));
        CHOSEN.computeIfAbsent(entry, e -> new IdentityHashMap<>())
                .computeIfAbsent(sa, s -> new LinkedHashMap<>())
                .put(player, ids);
    }

    /**
     * The question's facts for [asked]: `nextSeats` (the seats that will be
     * asked after them, each the seat authorised to answer for that player)
     * and `earlier` (each earlier player's seat and the cards of their choice
     * now in a graveyard, named as [asked] sees them). Null when this is not
     * an "each player" sacrifice, or there is nothing to say.
     */
    static com.google.gson.JsonObject facts(Game game, SpellAbility sa, Player asked,
                                            ToIntFunction<Player> authorisedSeat, ToIntFunction<Player> seat) {
        List<Player> order = order(sa);
        int at = order.indexOf(asked);
        if (at < 0) {
            return null;
        }
        com.google.gson.JsonArray next = new com.google.gson.JsonArray();
        for (Player each : order.subList(at + 1, order.size())) {
            if (hasChoice(sa, each)) {
                int s = authorisedSeat.applyAsInt(each);
                if (s > 0 && !contains(next, s)) {
                    next.add(s);
                }
            }
        }
        com.google.gson.JsonArray earlier = new com.google.gson.JsonArray();
        Object entry = resolving(game);
        Map<SpellAbility, Map<Player, List<Integer>>> byAbility = entry == null ? null : CHOSEN.get(entry);
        Map<Player, List<Integer>> chosen = byAbility == null ? null : byAbility.get(sa);
        if (chosen != null) {
            Map<Integer, Card> graves = new LinkedHashMap<>();
            for (Card card : game.getCardsIn(ZoneType.Graveyard)) {
                graves.put(card.getId(), card);
            }
            for (Player each : order.subList(0, at)) {
                List<Integer> ids = chosen.get(each);
                com.google.gson.JsonArray cards = new com.google.gson.JsonArray();
                for (Integer id : ids == null ? List.<Integer>of() : ids) {
                    Card card = graves.get(id);
                    if (card == null) {
                        continue; // not in a graveyard (exiled instead): not said
                    }
                    com.google.gson.JsonObject one = new com.google.gson.JsonObject();
                    one.addProperty("id", "card:" + card.getId());
                    one.addProperty("name", ViewerSnapshot.nameFor(card, asked.getView()));
                    cards.add(one);
                }
                if (!cards.isEmpty()) {
                    com.google.gson.JsonObject row = new com.google.gson.JsonObject();
                    row.addProperty("seat", seat.applyAsInt(each));
                    row.add("cards", cards);
                    earlier.add(row);
                }
            }
        }
        if (next.isEmpty() && earlier.isEmpty()) {
            return null;
        }
        com.google.gson.JsonObject out = new com.google.gson.JsonObject();
        if (!next.isEmpty()) {
            out.add("nextSeats", next);
        }
        if (!earlier.isEmpty()) {
            out.add("earlier", earlier);
        }
        return out;
    }

    private static boolean contains(com.google.gson.JsonArray seats, int seat) {
        for (com.google.gson.JsonElement each : seats) {
            if (each.getAsInt() == seat) {
                return true;
            }
        }
        return false;
    }
}
