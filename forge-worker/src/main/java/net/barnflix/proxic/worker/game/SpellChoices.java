package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.keyword.Keyword;
import forge.game.spellability.AbilitySub;
import forge.game.spellability.AlternativeCost;
import forge.game.spellability.SpellAbility;

import java.util.ArrayList;
import java.util.List;

/**
 * Spec 0100 -- what a spell's caster chose as they cast it, read from the
 * spell's own SpellAbility: the X paid, the modes (every one, in printed
 * order, the chosen ones marked), the extra costs paid (kicked, overloaded,
 * evoked, entwined, escalated; multikicker's count) and, for an overloaded
 * spell, the permanents Forge's own filter for it would affect now.
 *
 * Public: these are announced as the spell is cast (CR 601.2b-c). Never
 * sent for a spell whose card this viewer may not identify (a face-down
 * spell: the caller passes `hidden` from the same check that blanks its
 * description).
 */
final class SpellChoices {

    private SpellChoices() {
    }

    /** The extra costs this spell was cast with, in the order the spec lists them. */
    static List<String> extras(SpellAbility sa, int chosenModes) {
        List<String> out = new ArrayList<>();
        if (sa.isKicked()) {
            out.add("kicked");
        }
        if (sa.isAlternativeCost(AlternativeCost.Overload)) {
            out.add("overloaded");
        }
        if (sa.isEvoke()) {
            out.add("evoked");
        }
        if (sa.isEntwine()) {
            out.add("entwined");
        }
        // Forge has no isEscalate: escalate is a keyword whose cost is paid
        // for each mode beyond the first (CR 702.120a).
        Card host = sa.getHostCard();
        if (chosenModes > 1 && host != null && host.hasStartOfKeyword("Escalate")) {
            out.add("escalated");
        }
        return out;
    }

    /**
     * The spell's modes as the card prints them, each {text, chosen}; null
     * for a spell that is not modal. Chosen = a mode chained onto the spell
     * (Forge's CharmEffect#chainAbilities appends a copy of each chosen
     * mode as a sub-ability, in printed order); matched by its words.
     */
    static JsonArray modes(SpellAbility sa) {
        if (sa.getApi() != ApiType.Charm) {
            return null;
        }
        List<AbilitySub> all = sa.getAdditionalAbilityList("Choices");
        if (all == null || all.isEmpty()) {
            return null;
        }
        List<String> chained = new ArrayList<>();
        for (SpellAbility part = sa.getSubAbility(); part != null; part = part.getSubAbility()) {
            chained.add(part.getDescription());
        }
        String host = sa.getHostCard() == null ? "" : sa.getHostCard().getName();
        JsonArray out = new JsonArray();
        for (AbilitySub mode : all) {
            String said = mode.getDescription();
            JsonObject one = new JsonObject();
            one.addProperty("text", PlainWords.humanise(String.valueOf(said).replace("CARDNAME", host)));
            one.addProperty("chosen", chained.remove(said));
            out.add(one);
        }
        return out;
    }

    /** How many of [modes] are chosen. */
    static int chosen(JsonArray modes) {
        int n = 0;
        if (modes != null) {
            for (var each : modes) {
                if (each.getAsJsonObject().get("chosen").getAsBoolean()) {
                    n++;
                }
            }
        }
        return n;
    }

    /**
     * Spec 0100, Decided 1 -- the permanents an overloaded spell would
     * affect if it resolved now: its overloaded effect's own `Defined`
     * filter (CardFactoryUtil's overload turns "target" into "Valid ..."),
     * asked of Forge, battlefield only. Nothing when the filter has X in it
     * (Forge works X out as it resolves; Survivors#stoodDestroy skips the
     * same).
     */
    static JsonArray hits(Game game, SpellAbility sa) {
        JsonArray out = new JsonArray();
        java.util.Set<Integer> seen = new java.util.HashSet<>();
        for (SpellAbility part = sa; part != null; part = part.getSubAbility()) {
            String defined = part.getParamOrDefault("Defined", "");
            if (!defined.startsWith("Valid") || defined.contains("X")) {
                continue;
            }
            try {
                for (Card card : AbilityUtils.getDefinedCards(part.getHostCard(), defined, part)) {
                    Card now = game.getCardState(card, null);
                    if (now != null && now.isInPlay() && !now.isPhasedOut() && seen.add(now.getId())) {
                        out.add("card:" + now.getId());
                    }
                }
            } catch (RuntimeException e) {
                System.err.println("proxic: overload hits not read: " + e);
            }
        }
        return out;
    }

    /**
     * Adds x, modes, extra, kicks and hits to a spell's stack entry (or a
     * copy on its way), when there is something to say and [hidden] is
     * false.
     */
    static void mark(JsonObject entry, Game game, SpellAbility sa, boolean hidden) {
        if (sa == null || hidden || !sa.isSpell()) {
            return;
        }
        Integer x = sa.getXManaCostPaid();
        if (x != null && sa.costHasManaX()) {
            entry.addProperty("x", x);
        }
        JsonArray modes = modes(sa);
        if (modes != null) {
            entry.add("modes", modes);
        }
        List<String> extra = extras(sa, chosen(modes));
        if (!extra.isEmpty()) {
            JsonArray list = new JsonArray();
            extra.forEach(list::add);
            entry.add("extra", list);
        }
        int kicks = sa.getRootAbility().getOptionalKeywordAmount(Keyword.MULTIKICKER);
        if (kicks > 0) {
            entry.addProperty("kicks", kicks);
        }
        if (extra.contains("overloaded")) {
            JsonArray hits = hits(game, sa);
            if (!hits.isEmpty()) {
                entry.add("hits", hits);
            }
        }
    }
}
