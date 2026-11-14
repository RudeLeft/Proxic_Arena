package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import forge.game.Game;
import forge.game.card.Card;
import forge.game.player.Player;
import forge.game.spellability.SpellAbility;
import forge.game.zone.Zone;
import forge.game.zone.ZoneType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Spec 0087 (owner 2026-11-13, canvas gaps-marks-1113 sections 6-9, and
 * Amendment 1) -- the cards each player may still use from a graveyard or
 * an exile, so the page can light those piles and stand the cards in a fan
 * beside the plate.
 *
 * Built from the game's own complete list, never from a card's name or
 * text: Forge's {@code Player#getCardsActivatableInExternalZones}, the list
 * its own clients use for "cards you can play outside your hand" (flashback,
 * escape, jump-start, foretold, on an adventure, "you may play it" effects
 * such as Light Up the Stage, Gonti's and Hostage Taker's cards in the other
 * player's piles, and any ability a card has from where it lies -- Unearth,
 * Scavenge, Embalm, Encore). That list also holds cards a player may
 * only LOOK at (a Hideaway card); those have no use where they lie, and each
 * card is kept only when Forge's own zone check
 * ({@code SpellAbilityRestriction#checkZoneRestrictions}) lets one of its
 * spells or abilities be used from there, or an effect lets that player play
 * it. Timing and mana are not asked: a card stays in the fan between turns,
 * as it stays playable. A suspended card ({@code Card#hasSuspend}: in exile
 * with time counters) is not on the list -- it cannot be played -- and is
 * added, marked suspended, for its owner; so is a plotted card
 * ({@code Card#isPlotted}), which Forge's list leaves out though it is cast
 * from there.
 *
 * Who may see it (HID-001, HID-005). Every viewer is told which pile cards
 * which player may use: it is public that Alice may cast what Light Up the
 * Stage exiled, that a card is foretold, that Gonti's card may be cast by
 * Gonti's controller. But for a card the viewer may NOT identify (Alice's
 * foretold card to Bob, Bob's own card exiled face down by Gonti), whether
 * it stands in the fan must not depend on what the card is (a land Gonti
 * took cannot be cast; leaving it out would tell Bob it is a land). For such
 * a viewer the card is used by every player an effect lets play it, or who
 * foretold or plotted it -- the public reasons -- whatever it turns out to
 * be, and its use is a plain "cast".
 */
final class PileUses {

    private PileUses() {
    }

    /** One player's use of one pile card: "cast", "ability" or "suspended". */
    record Use(int seat, String how, boolean open) {}

    /** Every pile card some player may use, by card id, each player once. */
    static Map<Integer, List<Use>> of(Game game, Map<Player, Integer> seatOf) {
        Map<Integer, List<Use>> out = new LinkedHashMap<>();
        for (Player player : game.getRegisteredPlayers()) {
            int seat = seatOf.getOrDefault(player, 0);
            for (Card card : player.getCardsActivatableInExternalZones(false)) {
                if (!inPile(card)) {
                    continue;
                }
                boolean open = openly(card, player);
                String how = how(card, player);
                if (how == null && !open) {
                    // Looked at only (a Hideaway card): nothing to use.
                    continue;
                }
                add(out, card, new Use(seat, how, open));
            }
        }
        for (Player player : game.getRegisteredPlayers()) {
            for (Card card : player.getCardsIn(ZoneType.Exile)) {
                int owner = seatOf.getOrDefault(card.getOwner(), 0);
                if (card.isPlotted()) {
                    // Plotted: cast free on a later turn (Forge's Card#isPlotted).
                    // Forge's list leaves it out (its filter knows foretold and
                    // adventure cards, not plotted ones; RUN, check-piles plot).
                    add(out, card, new Use(owner, "cast", true));
                } else if (card.hasSuspend() || lastCounterGone(game, card)) {
                    // Suspended: in the owner's exile, counting down; not playable.
                    add(out, card, new Use(owner, "suspended", true));
                }
            }
        }
        return out;
    }

    /**
     * A suspended card whose last time counter has just come off: its "cast
     * it" trigger waits on the stack (Forge's own, sourced from the card), so
     * it still stands in the fan at 0 until it is cast from there (RUN,
     * check-piles suspend: Forge's hasSuspend is false from that board).
     */
    static boolean lastCounterGone(Game game, Card card) {
        if (!card.hasKeyword(forge.game.keyword.Keyword.SUSPEND)
                || card.getCounters(forge.game.card.CounterEnumType.TIME) > 0) {
            return false;
        }
        for (forge.game.spellability.SpellAbilityStackInstance entry : game.getStack()) {
            if (entry.isTrigger() && entry.getSourceCard() == card) {
                return true;
            }
        }
        return false;
    }

    /**
     * Mark one graveyard or exile entry as this viewer may see it: `uses`,
     * [{seat, how}], and the public facts `foretold` and `plotted`.
     */
    static void mark(JsonObject entry, Card card, List<Use> uses) {
        boolean known = entry.has("known") && entry.get("known").getAsBoolean();
        // Public: foretold and plotted cards are put there in front of
        // everyone (Forge's CardView carries Foretold to every client).
        if (inPile(card) && card.isInZone(ZoneType.Exile) && card.isForetold()) {
            entry.addProperty("foretold", true);
        }
        if (inPile(card) && card.isInZone(ZoneType.Exile) && card.isPlotted()) {
            entry.addProperty("plotted", true);
        }
        JsonArray list = usesFor(known, uses);
        if (list.size() > 0) {
            entry.add("uses", list);
        }
    }

    /**
     * The `uses` a viewer is told: every use when they may identify the
     * card; only the public ones (an effect's, a foretold or plotted card's)
     * when they may not, each a plain "cast" (a suspended card is face up).
     */
    static JsonArray usesFor(boolean known, List<Use> uses) {
        JsonArray list = new JsonArray();
        if (uses == null) {
            return list;
        }
        for (Use use : uses) {
            if (!known && !use.open()) {
                continue;
            }
            String how;
            if (!known) {
                how = "suspended".equals(use.how()) ? "suspended" : "cast";
            } else {
                // Only an effect lets them (no spell the zone check found): a play.
                how = use.how() == null ? "cast" : use.how();
            }
            JsonObject one = new JsonObject();
            one.addProperty("seat", use.seat());
            one.addProperty("how", how);
            list.add(one);
        }
        return list;
    }

    /** In a graveyard or an exile: the piles this spec lights. */
    static boolean inPile(Card card) {
        Zone zone = card.getZone();
        return zone != null && (zone.is(ZoneType.Graveyard) || zone.is(ZoneType.Exile));
    }

    /**
     * A use every viewer may know of, whatever the card is: an effect lets
     * this player play it (Light Up the Stage, Gonti, an adventure's), or
     * it is foretold or plotted.
     */
    static boolean openly(Card card, Player player) {
        if (!card.mayPlay(player).isEmpty()) {
            return true;
        }
        boolean own = card.getOwner() == player;
        return own && card.isInZone(ZoneType.Exile) && (card.isForetold() || card.isPlotted() || card.isOnAdventure());
    }

    /**
     * What [player] may do with [card] where it lies, as Forge's zone check
     * says: "cast" (a spell or a land, by flashback, escape, foretell, an
     * adventure or any "you may play it"), "ability" (only an ability, such
     * as Unearth), or null (nothing from here).
     */
    static String how(Card card, Player player) {
        if (openly(card, player)) {
            return "cast";
        }
        boolean spell = false;
        boolean ability = false;
        // The card's own spells and abilities with their alternative costs
        // (flashback, escape, foretell...), as Card#getAllPossibleAbilities
        // gathers them -- but NOT filtered by whether they can be used right
        // now: that asks timing, and Faithless Looting dropped out of the fan
        // at each combat step and on the other player's turn (RUN,
        // check-piles unearth trace, 2026-11-14). Only the zone is asked.
        List<SpellAbility> abilities = new ArrayList<>();
        try {
            for (SpellAbility sa : card.getSpellAbilities()) {
                abilities.add(sa);
                abilities.addAll(forge.game.GameActionUtil.getAlternativeCosts(sa, player, false));
            }
        } catch (RuntimeException e) {
            // STUB-002: loud, and the card simply stays out of the fan.
            System.err.println("proxic: pile uses failed for " + card + ": " + e);
            return null;
        }
        for (SpellAbility sa : abilities) {
            sa.setActivatingPlayer(player);
            if (sa.isManaAbility() || sa.getRestrictions() == null) {
                continue;
            }
            if (!sa.getRestrictions().checkZoneRestrictions(card, sa)) {
                continue;
            }
            if (sa.isSpell() || sa.isLandAbility()) {
                spell = true;
            } else if (sa.isActivatedAbility()) {
                ability = true;
            }
        }
        return spell ? "cast" : ability ? "ability" : null;
    }

    private static void add(Map<Integer, List<Use>> out, Card card, Use use) {
        List<Use> list = out.computeIfAbsent(card.getId(), k -> new ArrayList<>());
        for (Use had : list) {
            if (had.seat() == use.seat()) {
                return;
            }
        }
        list.add(use);
    }
}
