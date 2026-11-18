package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.Game;
import forge.game.ability.AbilityKey;
import forge.game.ability.AbilityUtils;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.card.CardCollectionView;
import forge.game.card.CardLists;
import forge.game.keyword.Keyword;
import forge.game.replacement.ReplacementEffect;
import forge.game.replacement.ReplacementType;
import forge.game.spellability.SpellAbility;
import forge.game.zone.ZoneType;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Spec 0080 -- phasing, and cards that survived: regenerated, indestructible,
 * damage prevented. Everything here is public: it happens to permanents on
 * the battlefield and to damage, which both players see (PHASE_07 §7.61 B13).
 *
 * The snapshot round gains (each only when non-empty):
 *
 *   phased    [{card, out}] -- Forge's GameEventCardPhased: out true when it
 *             phased out, false when it phased in. The phased-out permanent
 *             itself stays in `battlefield`, flagged `phasedOut`.
 *   survived  [{card, how}] -- how "regenerated" (Forge's
 *             GameEventCardRegenerated: a shield was used instead of the
 *             card being destroyed), "indestructible" (something tried to
 *             destroy an indestructible permanent: see below) or, spec 0089,
 *             "umbra" with by "card:N": an Aura's umbra armor was destroyed
 *             instead (the replacement Forge chose, Survivors#umbraSave).
 *
 * and a damage wave's hits gain prevented hits, {source, target, amount: 0,
 * prevented: N}: what a prevention effect (Fog, Holy Day, protection from a
 * colour) stopped, with its would-be amount and target.
 *
 * Indestructible: Forge says nothing when a destroy fails --
 * GameAction#destroy returns at Card#canBeDestroyed() with no event, and
 * DestroyAllEffect filters such cards out first. No Forge patch: the worker
 * asks Forge, after a Destroy or DestroyAll part of a spell or ability has
 * resolved, which of the permanents it aimed at (its targets or Defined
 * cards; DestroyAll's own ValidCards filter, AbilityUtils#filterListByType)
 * are still on the battlefield with Keyword.INDESTRUCTIBLE. And after
 * damage, which creature it hit has lethal damage marked (the same test
 * Forge's state-based check makes, GameAction#checkStateEffects 704.5g/h:
 * deathtouch damage, or damage at least its lethal) yet is indestructible.
 * Presentation only: Forge has already decided the card stays.
 */
final class Survivors {

    private Survivors() {
    }

    /** One phase change. */
    record Phase(int card, boolean out) {}

    /**
     * One survivor: how it survived. Spec 0089 (Q4 B) -- [by] the card that
     * was destroyed instead (an umbra), or 0 when nothing was.
     */
    record Survived(int card, String how, int by) {
        Survived(int card, String how) {
            this(card, how, 0);
        }
    }

    /**
     * One damage event a prevention effect was chosen for, as it stood then:
     * its source ("card:N", or null), target ({object} | {player}), the
     * amount it would have dealt, and how many hits had been recorded before
     * it (where its prevented hit goes in the wave).
     */
    record Pending(Object event, String source, JsonObject target, int amount, int at, String by) {
        Pending(Object event, String source, JsonObject target, int amount, int at) {
            this(event, source, target, amount, at, null);
        }
    }

    static JsonArray phasedJson(List<Phase> phases) {
        JsonArray out = new JsonArray();
        for (Phase phase : phases) {
            JsonObject entry = new JsonObject();
            entry.addProperty("card", "card:" + phase.card());
            entry.addProperty("out", phase.out());
            out.add(entry);
        }
        return out;
    }

    static JsonArray survivedJson(List<Survived> survived) {
        JsonArray out = new JsonArray();
        java.util.Set<String> said = new java.util.HashSet<>();
        for (Survived each : survived) {
            if (!said.add(each.card() + ":" + each.how())) {
                continue;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("card", "card:" + each.card());
            entry.addProperty("how", each.how());
            if (each.by() != 0) {
                entry.addProperty("by", "card:" + each.by());
            }
            out.add(entry);
        }
        return out;
    }

    /**
     * The round's hits with the prevented ones put in, each where its damage
     * event stood: prevented = would-be amount minus what that source then
     * dealt that target (all of it under Holy Day; part of it under "prevent
     * the next 2"). Pure, for the unit test.
     */
    static List<JsonObject> withPrevented(List<JsonObject> hits, List<Pending> pending) {
        if (pending.isEmpty()) {
            return hits;
        }
        List<JsonObject> out = new ArrayList<>(hits.size() + pending.size());
        for (int i = 0; i <= hits.size(); i++) {
            for (Pending p : pending) {
                if (p.at() != i && !(i == hits.size() && p.at() > hits.size())) {
                    continue;
                }
                int dealt = 0;
                for (int j = Math.min(p.at(), hits.size()); j < hits.size(); j++) {
                    JsonObject hit = hits.get(j);
                    if (sameSource(hit, p.source()) && p.target().equals(hit.get("target"))) {
                        dealt += hit.get("amount").getAsInt();
                    }
                }
                int prevented = p.amount() - dealt;
                if (prevented > 0) {
                    JsonObject entry = new JsonObject();
                    if (p.source() != null) {
                        entry.addProperty("source", p.source());
                    }
                    entry.add("target", p.target().deepCopy());
                    entry.addProperty("amount", 0);
                    entry.addProperty("prevented", prevented);
                    // Spec 0101 -- what stopped it, when it is a survive kind
                    // of its own: a shield counter, "prevent the next N".
                    if (p.by() != null) {
                        entry.addProperty("by", p.by());
                    }
                    out.add(entry);
                }
            }
            if (i < hits.size()) {
                out.add(hits.get(i));
            }
        }
        return out;
    }

    private static boolean sameSource(JsonObject hit, String source) {
        if (source == null) {
            return !hit.has("source");
        }
        return hit.has("source") && source.equals(hit.get("source").getAsString());
    }

    /**
     * Spec 0089 (Q4 B) -- the replacement Forge chose is umbra armor ("if
     * enchanted creature would be destroyed, instead remove all damage from
     * it and destroy this Aura"): Forge's own keyword record on the effect
     * (CardTraitBase#isKeyword, set by CardFactoryUtil for the keyword), a
     * Destroy event, never a card's name. Returns {aura, creature} -- the
     * effect's host and what it enchants as it is chosen -- or null.
     */
    static Card[] umbraSave(ReplacementEffect re) {
        if (re == null || re.getMode() != ReplacementType.Destroy || !re.isKeyword(Keyword.UMBRA_ARMOR)) {
            return null;
        }
        Card aura = re.getHostCard();
        Card creature = aura == null ? null : aura.getEnchantingCard();
        if (aura == null || creature == null) {
            return null;
        }
        return new Card[] {aura, creature};
    }

    /**
     * Spec 0101, row 3 -- the replacement Forge chose is a shield counter's
     * destroy replacement (Card#updateReplacementEffects: "Event$ Destroy
     * ... ShieldCounter$ True", Forge's own parameter, never a card's name):
     * the card it saves, or null.
     */
    static Card shieldSave(ReplacementEffect re) {
        if (re == null || re.getMode() != ReplacementType.Destroy || !"True".equals(re.getParam("ShieldCounter"))) {
            return null;
        }
        return re.getHostCard();
    }

    /**
     * Spec 0101, rows 3 and 7 -- which survive kind a damage prevention is:
     * "shield" for a shield counter's (its overriding ability removes a
     * Shield counter, Card#updateReplacementEffects), "prevent-next" for a
     * "prevent the next N damage" shield (DamagePreventEffect's
     * "PreventionEffect$ NextN"), else null (Fog, protection, Holy Day).
     */
    static String preventedBy(ReplacementEffect re) {
        if (re == null || re.getMode() != ReplacementType.DamageDone) {
            return null;
        }
        if ("NextN".equals(re.getParam("PreventionEffect"))) {
            return "prevent-next";
        }
        SpellAbility over = re.getOverridingAbility();
        if (over != null && over.getApi() == ApiType.RemoveCounter
                && "Shield".equalsIgnoreCase(over.getParamOrDefault("CounterType", ""))) {
            return "shield";
        }
        return null;
    }

    /** Whether this replacement effect prevents damage (Fog, protection, "prevent the next N"). */
    static boolean isPrevention(ReplacementEffect re) {
        if (re == null || re.getMode() != ReplacementType.DamageDone) {
            return false;
        }
        if ("True".equals(re.getParam("Prevent")) || re.hasParam("PreventionEffect")) {
            return true;
        }
        SpellAbility over = re.getOverridingAbility();
        return over != null && over.getApi() == ApiType.ReplaceDamage;
    }

    /**
     * VEND-004 -- reflective: forge.game.replacement.ReplacementHandler's
     * private {@code replaceDamageList} (List of Map of ReplacementEffect to
     * List of run parameters), the damage events Forge is replacing right
     * now, per player, in ReplacementHandler#runReplaceDamage. Why: Forge
     * prevents damage quietly -- the prevented amount goes into a
     * CardDamageTable cleared at the end of GameAction#dealDamage, and the
     * only event is a log line with no amount or target -- so the worker
     * reads, as Forge asks its controller which replacement to apply
     * (chooseSingleReplacementEffect, the one call made for every damage
     * replacement), the events that replacement will act on. If Forge
     * renames or changes it, this is null and prevented damage is simply not
     * told (the page plays what it did before) -- nothing else depends on
     * it. Covered by SurvivorsTest.forgeStillHasTheDamageList and
     * scripts/check-survivors.py's "holy-day" scenario.
     */
    static final java.lang.reflect.Field DAMAGE_LIST = damageList();

    private static java.lang.reflect.Field damageList() {
        try {
            java.lang.reflect.Field f =
                    forge.game.replacement.ReplacementHandler.class.getDeclaredField("replaceDamageList");
            f.setAccessible(true);
            return f;
        } catch (ReflectiveOperationException | RuntimeException e) {
            System.err.println("proxic: ReplacementHandler.replaceDamageList not found; prevented damage untold: " + e);
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<ReplacementEffect, List<Map<AbilityKey, Object>>>> damageEvents(Game game) {
        if (DAMAGE_LIST == null) {
            return List.of();
        }
        try {
            Object list = DAMAGE_LIST.get(game.getReplacementHandler());
            return list instanceof List<?> ? (List<Map<ReplacementEffect, List<Map<AbilityKey, Object>>>>) list
                    : List.of();
        } catch (ReflectiveOperationException | RuntimeException e) {
            return List.of();
        }
    }

    /** Whether Forge is in the middle of replacing damage (a question can be asked then). */
    static boolean replacingDamage(Game game) {
        for (Map<ReplacementEffect, List<Map<AbilityKey, Object>>> each : damageEvents(game)) {
            if (!each.isEmpty()) {
                return true;
            }
        }
        return false;
    }

    /** The damage events [chosen] is about to prevent, as {event, source, target, amount}. */
    static List<Object[]> preventing(Game game, ReplacementEffect chosen) {
        List<Object[]> out = new ArrayList<>();
        for (Map<ReplacementEffect, List<Map<AbilityKey, Object>>> each : damageEvents(game)) {
            List<Map<AbilityKey, Object>> events = each.get(chosen);
            if (events == null) {
                continue;
            }
            for (Map<AbilityKey, Object> event : events) {
                if (Boolean.TRUE.equals(event.get(AbilityKey.NoPreventDamage))) {
                    continue; // can't be prevented: Forge leaves it as it is
                }
                Object amount = event.get(AbilityKey.DamageAmount);
                if (!(amount instanceof Integer n) || n <= 0) {
                    continue;
                }
                out.add(new Object[] {event, event.get(AbilityKey.DamageSource), event.get(AbilityKey.Affected), n});
            }
        }
        return out;
    }

    /**
     * The permanents a Destroy or DestroyAll part of [root] aimed at that are
     * still on the battlefield, indestructible -- read after it resolved.
     */
    static List<Card> stoodDestroy(Game game, SpellAbility root) {
        List<Card> out = new ArrayList<>();
        for (SpellAbility part = root; part != null; part = part.getSubAbility()) {
            ApiType api = part.getApi();
            if (api == ApiType.Destroy) {
                List<Card> aimed = new ArrayList<>();
                if (part.usesTargeting() && part.getTargets() != null) {
                    aimed.addAll(part.getTargets().getTargetCards());
                } else if (part.hasParam("Defined")) {
                    aimed.addAll(AbilityUtils.getDefinedCards(part.getHostCard(), part.getParam("Defined"), part));
                }
                for (Card card : aimed) {
                    Card now = game.getCardState(card, null);
                    if (stands(now) && !out.contains(now)) {
                        out.add(now);
                    }
                }
            } else if (api == ApiType.DestroyAll) {
                try {
                    CardCollectionView list = game.getCardsIn(ZoneType.Battlefield);
                    forge.game.player.Player targeted = part.getTargets() == null ? null
                            : part.getTargets().getFirstTargetedPlayer();
                    if (targeted != null) {
                        list = CardLists.filterControlledBy(list, targeted);
                    }
                    String valid = part.getParamOrDefault("ValidCards", "");
                    if (valid.contains("X")) {
                        continue; // Forge works X out as it resolves; not guessed afterwards
                    }
                    for (Card card : AbilityUtils.filterListByType(list, valid, part)) {
                        if (stands(card) && !out.contains(card)) {
                            out.add(card);
                        }
                    }
                } catch (RuntimeException e) {
                    System.err.println("proxic: destroy-all survivors not read: " + e);
                }
            }
        }
        return out;
    }

    private static boolean stands(Card card) {
        return card != null && card.isInPlay() && !card.isPhasedOut() && card.hasKeyword(Keyword.INDESTRUCTIBLE);
    }

    /**
     * A creature with lethal damage marked that Forge left on the
     * battlefield because it is indestructible (704.5g/h's test, as
     * GameAction#checkStateEffects makes it; toughness 0 or less is 704.5f
     * and kills it anyway).
     */
    static boolean heldLethal(Card card) {
        return card != null && card.isInPlay() && card.isCreature() && card.hasKeyword(Keyword.INDESTRUCTIBLE)
                && card.getNetToughness() > 0
                && (card.hasBeenDealtDeathtouchDamage() || (card.getDamage() > 0 && card.getLethal() <= card.getDamage()));
    }
}
