package net.barnflix.proxic.worker;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.StaticData;
import forge.card.CardDb;
import forge.card.CardEdition;
import forge.card.CardRules;
import forge.item.IPaperCard;
import forge.item.PaperCard;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * Every card Forge can play, and every printing of it Forge accepts —
 * spec 0021.
 *
 * The Deck Builder warns about a card Arena cannot play and picks a
 * printing Arena accepts. It used to do both from a list it rebuilt
 * itself by reading Forge's files with its own copy of Forge's rules,
 * and that copy was wrong once already: it took an edition's Scryfall
 * code for an accepted set code, which Forge's lookup refuses ("UGIN"
 * for Ugin's Fate). So nothing here re-reads a file or restates a rule.
 * The cards and printings are the ones this Forge LOADED, and the set
 * codes are found by asking Forge's own edition lookup, the same call
 * {@code CardDb.tryGetCard} makes for a decklist line.
 *
 * <p>Spec 0022: each card's printings come in an order Forge itself
 * defines -- its {@code CardArtPreference} "latest art, core, expansion
 * and reprint editions only": those editions first, newest first -- so
 * the Deck Builder needs no preference of its own. Forge's default
 * preference is not used: it ranks every edition alike, so Lightning
 * Bolt's first printing would be a Secret Lair one (measured). Ties keep
 * the edition code and collector number order.
 *
 * <p>Spec 0024: import accepts any printing of a listed card, so the
 * printings matter only for a card marked {@code printingMatters}, whose
 * printing changes what it does; for the rest they are what Forge has.
 * Spec 0023: the order is real now that Forge reads each edition's own
 * type (it read every one as a custom set).
 *
 * <p>Contraptions and Attractions are filed with Forge's variant cards;
 * they are included, as {@code ForgeRuntime.lookup} includes them, and
 * no other variant card is (a plane or a scheme stays unplayable).
 */
final class CardPool {

    private CardPool() {
    }

    static JsonObject describe(ForgeRuntime runtime) {
        runtime.ensureLoaded();
        StaticData data = StaticData.instance();

        // Sorted, so the same Forge always produces the same document.
        Map<String, Entry> cards = new TreeMap<>();
        Comparator<Printing> preferred = preferred(data);
        for (PaperCard card : data.getCommonCards().getAllCards()) {
            add(cards, card);
        }
        for (PaperCard card : data.getVariantCards().getAllCards()) {
            if (ForgeRuntime.Resolution.sectionOf(card) != null) {
                add(cards, card);
            }
        }

        JsonObject pool = new JsonObject();
        JsonArray cardList = new JsonArray();
        for (Entry entry : cards.values()) {
            cardList.add(entry.toJson(preferred));
        }
        pool.add("cards", cardList);

        CardEdition.Collection editions = data.getEditions();
        JsonArray editionList = new JsonArray();
        Map<String, String> setCodes = new TreeMap<>();
        SimpleDateFormat day = new SimpleDateFormat("yyyy-MM-dd", Locale.ROOT);
        for (CardEdition edition : editions) {
            JsonObject one = new JsonObject();
            one.addProperty("code", edition.getCode());
            one.addProperty("code2", edition.getCode2());
            if (edition.getAlias() != null) {
                one.addProperty("alias", edition.getAlias());
            }
            one.addProperty("scryfallCode", edition.getScryfallCode());
            one.addProperty("type", edition.getType().name());
            if (edition.getDate() != null) {
                one.addProperty("date", day.format(edition.getDate()));
            }
            editionList.add(one);

            // What Forge's lookup finds for each code this edition
            // answers to. Forge upper-cases a requested code before
            // asking, so the keys are upper case too.
            for (String code : new String[] {
                    edition.getCode(), edition.getCode2(), edition.getAlias()}) {
                if (code == null || code.isBlank()) {
                    continue;
                }
                String key = code.toUpperCase(Locale.ROOT);
                CardEdition found = editions.get(key);
                if (found != null) {
                    setCodes.put(key, found.getCode());
                }
            }
        }
        pool.add("editions", editionList);
        JsonObject codes = new JsonObject();
        setCodes.forEach(codes::addProperty);
        pool.add("setCodes", codes);
        return pool;
    }

    /** The preference whose order the printings follow (spec 0022). */
    static final CardDb.CardArtPreference ORDER = CardDb.CardArtPreference.LATEST_ART_CORE_EXPANSIONS_REPRINT_ONLY;

    /** Forge's own preference between editions, then the printing's code and number. */
    static Comparator<Printing> preferred(StaticData data) {
        CardDb.CardArtPreference preference = ORDER;
        CardEdition.Collection editions = data.getEditions();
        Comparator<Printing> byForge = (a, b) -> {
            CardEdition one = editions.get(a.edition);
            CardEdition two = editions.get(b.edition);
            if (one == null || two == null || one.getDate() == null || two.getDate() == null) {
                // An edition Forge cannot date goes last, as it is least known.
                return Boolean.compare(one == null || one.getDate() == null,
                        two == null || two.getDate() == null);
            }
            return preference.compare(one, two);
        };
        return byForge.thenComparing(Printing::text);
    }

    /** One printing: its edition code and collector number, "M10 146". */
    record Printing(String edition, String number) {
        String text() {
            return edition + " " + number;
        }
    }

    private static void add(Map<String, Entry> cards, PaperCard card) {
        Entry entry = cards.computeIfAbsent(card.getName(), name -> new Entry(card));
        String number = card.getCollectorNumber();
        // A printing with no collector number cannot be asked for by
        // one, and a line naming only its set is answered by the set.
        if (number != null && !number.isBlank()
                && !IPaperCard.NO_COLLECTOR_NUMBER.equals(number)) {
            Printing printing = new Printing(card.getEdition(), number);
            if (entry.seen.add(printing.text())) {
                entry.printings.add(printing);
            }
        }
    }

    /** One card name: its faces and its side deck. */
    private static final class Entry {
        final String name;
        final TreeSet<String> faces = new TreeSet<>();
        final String section;
        final boolean printingMatters;
        final TreeSet<String> seen = new TreeSet<>();
        final List<Printing> printings = new ArrayList<>();

        Entry(PaperCard card) {
            CardRules rules = card.getRules();
            this.name = card.getName();
            this.printingMatters = ForgeRuntime.Resolution.printingMatters(rules);
            faces.add(rules.getMainPart().getName());
            if (rules.getOtherPart() != null) {
                faces.add(rules.getOtherPart().getName());
            }
            String side = ForgeRuntime.Resolution.sectionOf(card);
            this.section = side == null ? null : side.toUpperCase(Locale.ROOT);
        }

        JsonObject toJson(Comparator<Printing> preferred) {
            JsonObject one = new JsonObject();
            one.addProperty("name", name);
            JsonArray faceList = new JsonArray();
            faces.forEach(faceList::add);
            one.add("faces", faceList);
            if (section != null) {
                one.addProperty("section", section);
            }
            // Spec 0024: any printing of a card is accepted, except one
            // whose printing changes what it does; that one must be listed.
            if (printingMatters) {
                one.addProperty("printingMatters", true);
            }
            JsonArray printingList = new JsonArray();
            printings.stream().sorted(preferred).map(Printing::text).forEach(printingList::add);
            one.add("printings", printingList);
            return one;
        }
    }
}
