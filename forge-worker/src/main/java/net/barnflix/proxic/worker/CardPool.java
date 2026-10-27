package net.barnflix.proxic.worker;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.StaticData;
import forge.card.CardEdition;
import forge.card.CardRules;
import forge.item.IPaperCard;
import forge.item.PaperCard;

import java.text.SimpleDateFormat;
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
            cardList.add(entry.toJson());
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

    private static void add(Map<String, Entry> cards, PaperCard card) {
        Entry entry = cards.computeIfAbsent(card.getName(), name -> new Entry(card));
        String number = card.getCollectorNumber();
        // A printing with no collector number cannot be asked for by
        // one, and a line naming only its set is answered by the set.
        if (number != null && !number.isBlank()
                && !IPaperCard.NO_COLLECTOR_NUMBER.equals(number)) {
            entry.printings.add(card.getEdition() + " " + number);
        }
    }

    /** One card name: its faces and its side deck. */
    private static final class Entry {
        final String name;
        final TreeSet<String> faces = new TreeSet<>();
        final String section;
        final TreeSet<String> printings = new TreeSet<>();

        Entry(PaperCard card) {
            CardRules rules = card.getRules();
            this.name = card.getName();
            faces.add(rules.getMainPart().getName());
            if (rules.getOtherPart() != null) {
                faces.add(rules.getOtherPart().getName());
            }
            String side = ForgeRuntime.Resolution.sectionOf(card);
            this.section = side == null ? null : side.toUpperCase(Locale.ROOT);
        }

        JsonObject toJson() {
            JsonObject one = new JsonObject();
            one.addProperty("name", name);
            JsonArray faceList = new JsonArray();
            faces.forEach(faceList::add);
            one.add("faces", faceList);
            if (section != null) {
                one.addProperty("section", section);
            }
            JsonArray printingList = new JsonArray();
            printings.forEach(printingList::add);
            one.add("printings", printingList);
            return one;
        }
    }
}
