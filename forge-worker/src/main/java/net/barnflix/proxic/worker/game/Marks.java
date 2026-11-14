package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import forge.game.Game;
import forge.game.ability.ApiType;
import forge.game.card.Card;
import forge.game.keyword.KeywordInterface;
import forge.game.keyword.KeywordsChange;
import forge.game.spellability.SpellAbility;
import forge.game.staticability.StaticAbility;
import forge.game.staticability.StaticAbilityMode;
import forge.game.zone.ZoneType;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Spec 0085 -- what a permanent has gained, what it has lost, and what it is
 * holding, read from Forge's own state (never a card name, never rules
 * text). All of it is public: it is about a permanent on the table, and the
 * held cards are in exile, where the snapshot already lists them as each
 * viewer may see them.
 *
 * <ul>
 * <li>{@link #gained}: the keywords it has now that its face does not print
 * (Forge's continuous effects: Run Amok's trample, Heroic Intervention's
 * hexproof, Rancor's, Mother of Runes' protection). The titles are Forge's,
 * as `keywords` sends them.</li>
 * <li>{@link #unblockable}: a "can't be blocked" it was given (Rogue's
 * Passage, Distortion Strike): a CantBlockBy static that applies to it with
 * no blocker named, not printed on the card itself.</li>
 * <li>{@link #lostAll}: it has lost all its abilities (Humility, Turn to
 * Frog, Kenrith's Transformation): Forge's own "remove all" keyword change
 * on the card.</li>
 * <li>{@link #held}: the exiled cards it holds -- "until it leaves" (Banishing
 * Light, Oblivion Ring, Fiend Hunter), imprinted (Chrome Mox, Isochron
 * Scepter) or hidden away (Hideaway) -- as Forge links them
 * (Card#getExiledWith and the holder's own lists).</li>
 * </ul>
 */
final class Marks {

    private Marks() {
    }

    /** Forge's "Protection from from red" (KeywordWithType), as ViewerSnapshot fixes it. */
    private static final String DOUBLED_FROM = "Protection from from ";

    /** A keyword's title as the snapshot sends it, or null for none. */
    static String title(KeywordInterface keyword) {
        String title = keyword.getTitle();
        if (title != null && title.startsWith(DOUBLED_FROM)) {
            title = "Protection from " + title.substring(DOUBLED_FROM.length());
        }
        return title == null || title.isBlank() ? null : title;
    }

    /**
     * The titles in [now] that are not in [printed], in [now]'s order, once
     * each. Pure: the page marks these as gained.
     */
    static List<String> gainedTitles(List<String> now, Set<String> printed) {
        Set<String> out = new LinkedHashSet<>();
        for (String t : now) {
            if (t != null && !printed.contains(t)) {
                out.add(t);
            }
        }
        return new ArrayList<>(out);
    }

    /** The keywords [card] has now that its face does not print. */
    static JsonArray gained(Card card) {
        JsonArray out = new JsonArray();
        try {
            Set<String> printed = new LinkedHashSet<>();
            for (KeywordInterface k : card.getCurrentState().getIntrinsicKeywords()) {
                String t = title(k);
                if (t != null) {
                    printed.add(t);
                }
            }
            List<String> now = new ArrayList<>();
            for (KeywordInterface k : card.getUnhiddenKeywords()) {
                now.add(title(k));
            }
            gainedTitles(now, printed).forEach(out::add);
        } catch (RuntimeException e) {
            // A mark is presentation: if Forge's lists cannot be read, no mark.
            return new JsonArray();
        }
        return out;
    }

    /**
     * True when a "can't be blocked" applies to [card] that it was given: a
     * CantBlockBy static whose attacker is this card, that names no blocker
     * (so no creature at all can block it), and that is not the card's own
     * printed ability (Phantom Warrior's is in the close-up, not marked).
     * Known limit (STUB-005): "can't be blocked except by..." and "by more
     * than one" are not marked -- they name blockers.
     */
    static boolean unblockable(Card card) {
        try {
            Game game = card.getGame();
            List<Card> sources = new ArrayList<>();
            sources.add(card);
            for (Card c : game.getCardsIn(ZoneType.STATIC_ABILITIES_SOURCE_ZONES)) {
                if (c != card) {
                    sources.add(c);
                }
            }
            for (Card source : sources) {
                for (StaticAbility st : source.getStaticAbilities()) {
                    if (!st.checkConditions(StaticAbilityMode.CantBlockBy)) {
                        continue;
                    }
                    if (st.hasParam("ValidBlocker") || st.hasParam("ValidBlockerRelative")
                            || st.hasParam("ValidAttackerRelative") || st.hasParam("ValidDefender")) {
                        continue;
                    }
                    if (!st.matchesValidParam("ValidAttacker", card)) {
                        continue;
                    }
                    if (st.getHostCard() == card && st.isIntrinsic()) {
                        continue;
                    }
                    return true;
                }
            }
        } catch (RuntimeException e) {
            return false;
        }
        return false;
    }

    /** True when Forge has removed all of [card]'s abilities (a "remove all" keyword change). */
    static boolean lostAll(Card card) {
        try {
            for (KeywordsChange change : card.getChangedCardKeywords().values()) {
                if (change.isRemoveAllKeywords()) {
                    return true;
                }
            }
        } catch (RuntimeException e) {
            return false;
        }
        return false;
    }

    /** One card in exile and how the game links it to a permanent, for [holdersOf]. */
    record Link(int card, int holder, boolean untilLeaves, boolean imprinted, boolean moved) {
    }

    /**
     * Each holder's held cards, in exile order: a card is held when the game
     * says it is (exiled "until it leaves", imprinted) or when the holder's
     * own ability moved it there from anywhere but a graveyard (Oblivion
     * Ring, Fiend Hunter, Hideaway, Karn). A graveyard eaten by Bojuka Bog or
     * Scavenging Ooze, and a creature spell's delve, are not held: Forge
     * records them on the card too, and they were never "held".
     */
    static Map<Integer, List<Integer>> holdersOf(List<Link> links, Set<Integer> onTable) {
        Map<Integer, List<Integer>> out = new LinkedHashMap<>();
        for (Link l : links) {
            if (!onTable.contains(l.holder()) || l.holder() == l.card()) {
                continue;
            }
            if (l.untilLeaves() || l.imprinted() || l.moved()) {
                out.computeIfAbsent(l.holder(), k -> new ArrayList<>()).add(l.card());
            }
        }
        return out;
    }

    /** Whether [sa] moved a card into exile from a zone that is not a graveyard. */
    private static boolean movedNotFromGraveyard(SpellAbility sa) {
        if (sa == null || sa.isSpell()) {
            return false;
        }
        ApiType api = sa.getApi();
        if (api != ApiType.ChangeZone && api != ApiType.ChangeZoneAll && api != ApiType.Dig
                && api != ApiType.DigUntil) {
            return false;
        }
        String origin = sa.hasParam("Origin") ? sa.getParam("Origin") : "";
        return !origin.contains("Graveyard");
    }

    /** Every battlefield permanent's held cards ("card:N" ids), by holder id. */
    static Map<Integer, JsonArray> held(Game game) {
        Map<Integer, JsonArray> out = new LinkedHashMap<>();
        try {
            Map<Integer, Card> table = new LinkedHashMap<>();
            for (Card c : game.getCardsIn(ZoneType.Battlefield)) {
                table.put(c.getId(), c);
            }
            List<Link> links = new ArrayList<>();
            for (Card c : game.getCardsIn(ZoneType.Exile)) {
                Card with = c.getExiledWith();
                if (with == null) {
                    continue;
                }
                Card holder = table.get(with.getId());
                if (holder == null) {
                    continue;
                }
                links.add(new Link(c.getId(), holder.getId(),
                        holder.getUntilLeavesBattlefield().contains(c),
                        holder.getImprintedCards().contains(c),
                        movedNotFromGraveyard(c.getExiledSA())));
            }
            for (Map.Entry<Integer, List<Integer>> e : holdersOf(links, table.keySet()).entrySet()) {
                JsonArray ids = new JsonArray();
                e.getValue().forEach(id -> ids.add("card:" + id));
                out.put(e.getKey(), ids);
            }
        } catch (RuntimeException e) {
            return new LinkedHashMap<>();
        }
        return out;
    }
}
