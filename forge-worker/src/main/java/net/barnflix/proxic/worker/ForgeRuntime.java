package net.barnflix.proxic.worker;

import forge.CardStorageReader;
import forge.ImageKeys;
import forge.StaticData;
import forge.card.CardType;
import forge.item.PaperCard;
import forge.util.FileSection;
import forge.util.FileUtil;
import forge.util.Lang;
import forge.util.Localizer;

import java.io.File;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * Forge's card database, loaded once per worker process.
 *
 * The bootstrap order is not negotiable and was established by
 * measurement in Phase 0A, not by reading documentation. Two of
 * these steps fail LATE and confusingly when skipped:
 * {@code ImageKeys.initializeDirs} makes {@code CardDb.hasImage()}
 * throw a NullPointerException, and a missing {@code tokenscripts}
 * reader makes {@code getAllTokens()} do the same. Both look like
 * Forge bugs rather than missing setup.
 *
 * Loading costs ~2.8 seconds and ~611 MB for 96,916 cards, so it
 * happens ONCE, lazily, on the first request that needs it. A
 * worker that is only asked for its version never pays it.
 */
public final class ForgeRuntime {

    private final File res;
    private boolean loaded;

    public ForgeRuntime(File res) {
        this.res = res;
    }

    /** Load the card database if it is not loaded. Idempotent. */
    public synchronized void ensureLoaded() {
        if (loaded) {
            return;
        }
        String root = res.getAbsolutePath();

        Localizer.getInstance().initialize("en-US", root + "/languages");
        Lang.createInstance("en-US");

        // Nine empty strings, not null: Phase 0A found that passing
        // null here is what makes hasImage() fail later.
        ImageKeys.initializeDirs("", Collections.emptyMap(), "", "", "", "", "", "", "");

        // Without the type lists, "Forest" parses with no land subtype
        // meaning and its mana ability never exists.
        Map<String, List<String>> typeLists = FileSection.parseSections(
                FileUtil.readFile(new File(root + "/lists/TypeLists.txt")));
        for (Map.Entry<String, List<String>> section : typeLists.entrySet()) {
            if (section.getKey().endsWith("Types")) {
                CardType.Helper.parseTypes(section.getKey(), section.getValue());
            }
        }

        CardStorageReader cards = new CardStorageReader(root + "/cardsfolder", null, false);
        CardStorageReader tokens = new CardStorageReader(root + "/tokenscripts", null, false);
        new StaticData(
                cards, tokens, null, null,
                root + "/editions", root + "/editions",
                root + "/blockdata", root + "/setlookup",
                "Latest", false, false, false, false);

        loaded = true;
    }

    public int cardCount() {
        ensureLoaded();
        return StaticData.instance().getCommonCards().getAllCards().size();
    }

    /**
     * Does a requested set code name the edition Forge returned?
     *
     * Deck Builder writes SCRYFALL set codes; Forge uses its own.
     * They differ more often than one would hope — measured
     * 2026-10-15 on a real export:
     *
     * <pre>
     *   Hellspark Elemental  requested CON/65  Forge returned CFX/65
     * </pre>
     *
     * Both are Conflux. Comparing the raw strings reported a
     * PRINTING_MISMATCH for a card that resolved perfectly, which
     * would have rejected an entirely valid deck.
     *
     * Forge already knows its own aliases, so this asks rather than
     * carrying a mapping table that would rot with every set: an
     * edition has a code, a secondary code, an optional alias and a
     * Scryfall code, and any of them naming the same edition is a
     * match.
     */
    private boolean editionMatches(String requested, String actualCode) {
        if (requested.equalsIgnoreCase(actualCode)) {
            return true;
        }
        forge.card.CardEdition edition = StaticData.instance().getEditions().get(actualCode);
        if (edition == null) {
            return false;
        }
        return requested.equalsIgnoreCase(edition.getCode())
                || requested.equalsIgnoreCase(edition.getCode2())
                || requested.equalsIgnoreCase(edition.getAlias())
                || requested.equalsIgnoreCase(edition.getScryfallCode());
    }

    /**
     * Build a Forge deck and report what Forge actually sees.
     *
     * PHASE_02 §2.92-§2.94. The proof is deliberately taken from
     * FORGE's side of the boundary: the counts come from
     * `deck.getMain().toFlatList()`, which is the list Forge would
     * shuffle, rather than from the numbers Arena sent. Comparing
     * Arena's numbers to Arena's numbers would prove nothing.
     *
     * A card that cannot be resolved is NOT substituted and NOT
     * skipped silently (§2.94): it is returned in `unresolved`, and
     * the caller decides.
     */
    public DeckBuild buildDeck(java.util.List<DeckRequest> requested) {
        BuiltDeck built = buildDeckObject(requested, "Proxic import");
        java.util.Map<String, Integer> counts = new java.util.TreeMap<>();
        for (PaperCard card : built.deck.getMain().toFlatList()) {
            counts.merge(card.getName(), 1, Integer::sum);
        }
        return new DeckBuild(
                built.deck.getMain().toFlatList().size(), counts, built.unresolved);
    }

    /**
     * The same construction, returning the DECK rather than a
     * summary of it — PHASE_06 §6.20.
     *
     * Phase 2 only ever needed to know whether a deck builds; Phase
     * 6 needs the object to hand to Forge. One method does the
     * resolving so the deck a match is played with is the same deck
     * import said was fine, built the same way. Two code paths here
     * would mean "it imported" and "it plays" could disagree.
     */
    public BuiltDeck buildDeckObject(
            java.util.List<DeckRequest> requested, String deckName) {
        ensureLoaded();
        forge.deck.Deck deck = new forge.deck.Deck(deckName);
        forge.deck.CardPool main = deck.getMain();

        java.util.List<String> unresolved = new java.util.ArrayList<>();
        for (DeckRequest entry : requested) {
            Resolution resolution = resolve(entry.name, entry.setCode, entry.collectorNumber);
            if (!"RESOLVED".equals(resolution.status)) {
                unresolved.add(entry.name + " (" + resolution.status + ")");
                continue;
            }
            String lookupName = entry.name.contains(" // ")
                    ? entry.name.substring(0, entry.name.indexOf(" // ")).trim()
                    : entry.name;
            PaperCard card = StaticData.instance().getCommonCards()
                    .getCard(lookupName, resolution.actualSet, resolution.actualNumber);
            if (card == null) {
                unresolved.add(entry.name + " (LOOKUP_FAILED)");
                continue;
            }
            main.add(card, entry.quantity);
        }

        return new BuiltDeck(deck, unresolved);
    }

    /** A real Forge deck, and what could not be put in it. */
    public static final class BuiltDeck {
        public final forge.deck.Deck deck;
        public final java.util.List<String> unresolved;

        public BuiltDeck(forge.deck.Deck deck, java.util.List<String> unresolved) {
            this.deck = deck;
            this.unresolved = unresolved;
        }
    }

    /** One requested deck line. */
    public static final class DeckRequest {
        public final String name;
        public final String setCode;
        public final String collectorNumber;
        public final int quantity;

        public DeckRequest(String name, String setCode, String collectorNumber, int quantity) {
            this.name = name;
            this.setCode = setCode;
            this.collectorNumber = collectorNumber;
            this.quantity = quantity;
        }
    }

    /** What Forge's own deck contains. */
    public static final class DeckBuild {
        public final int totalCards;
        public final java.util.Map<String, Integer> countsByName;
        public final java.util.List<String> unresolved;

        DeckBuild(int totalCards, java.util.Map<String, Integer> countsByName,
                java.util.List<String> unresolved) {
            this.totalCards = totalCards;
            this.countsByName = countsByName;
            this.unresolved = unresolved;
        }
    }

    /** What happened to one requested card. */
    public static final class Resolution {
        public final String status;
        public final String detail;
        public final String actualSet;
        public final String actualNumber;
        /**
         * PHASE_07 §7.65 (Amendment 10): LAND, CREATURE or SPELL, so
         * the Deck Depot can band a deck the way a player reads one.
         * Forge's type line decides; null when Forge found no card.
         */
        public final String category;

        private Resolution(String status, String detail, String actualSet, String actualNumber,
                String category) {
            this.status = status;
            this.detail = detail;
            this.actualSet = actualSet;
            this.actualNumber = actualNumber;
            this.category = category;
        }

        static Resolution resolved(PaperCard card) {
            return new Resolution("RESOLVED", null, card.getEdition(),
                    card.getCollectorNumber(), categoryOf(card));
        }

        static Resolution notFound(String name) {
            return new Resolution("NOT_FOUND", "Forge does not know a card named \"" + name + "\".",
                    null, null, null);
        }

        static Resolution printingMismatch(String requested, PaperCard got) {
            return new Resolution(
                    "PRINTING_MISMATCH",
                    "Requested " + requested + ", Forge returned "
                            + got.getEdition() + "/" + got.getCollectorNumber() + ".",
                    got.getEdition(), got.getCollectorNumber(), categoryOf(got));
        }

        /**
         * The front face's type line. A land first, so Dryad Arbor is
         * a land, as it is in every decklist; then a creature, so an
         * artifact creature is a creature; everything else a spell.
         */
        static String categoryOf(PaperCard card) {
            CardType type = card.getRules().getType();
            if (type.isLand()) {
                return "LAND";
            }
            return type.isCreature() ? "CREATURE" : "SPELL";
        }
    }

    /**
     * Resolve one deck entry.
     *
     * <p><b>The printing check is the point of this method.</b> Phase
     * 0A measured that Forge's lookup does NOT return null for a bad
     * set or collector number — it quietly returns some other
     * printing of the same name:
     *
     * <pre>
     *   Forest + KTK + 261  ->  TRK/325   different set
     *   Lightning Bolt + ZZZ + 999  ->  SLZ/63   set does not exist
     * </pre>
     *
     * For gameplay that substitution is harmless; one Lightning Bolt
     * plays like another. For Proxic it is not: the printing is what
     * the player chose and what their artwork is keyed to. So the
     * returned card is CHECKED against what was asked for, and a
     * mismatch is an import outcome rather than a silent success
     * (§2.49).
     */
    public Resolution resolve(String requestedName, String setCode, String collectorNumber) {
        ensureLoaded();
        StaticData data = StaticData.instance();

        // A double-faced card is written by Deck Builder with BOTH
        // faces -- "Reckless Stormseeker // Storm-Charged Slasher" --
        // and Forge does not know that string at all. It knows the
        // front face.
        //
        // Measured 2026-10-15, because the first version of this
        // method reported NOT_FOUND and would have rejected every
        // deck containing a transforming card:
        //
        //   "Reckless Stormseeker // Storm-Charged Slasher"  NOT_FOUND
        //   "Reckless Stormseeker"                           RESOLVED
        //   "Storm-Charged Slasher"                          RESOLVED
        //
        // Both faces resolve separately, but the FRONT is the deck
        // entry's identity -- it is the card you put in the deck and
        // the name the artwork is filed under.
        String name = requestedName.contains(" // ")
                ? requestedName.substring(0, requestedName.indexOf(" // ")).trim()
                : requestedName;

        // A name-only entry resolves by name, which is well defined.
        if (setCode == null || setCode.isBlank()) {
            PaperCard byName = data.getCommonCards().getCard(name);
            return byName == null ? Resolution.notFound(name) : Resolution.resolved(byName);
        }

        PaperCard card = (collectorNumber == null || collectorNumber.isBlank())
                ? data.getCommonCards().getCard(name, setCode)
                : data.getCommonCards().getCard(name, setCode, collectorNumber);

        if (card == null) {
            // Fall back to name alone, so a card Forge knows under a
            // printing we cannot match is NOT_FOUND only when the
            // name itself is unknown.
            PaperCard byName = data.getCommonCards().getCard(name);
            if (byName == null) {
                return Resolution.notFound(name);
            }
            return Resolution.printingMismatch(
                    setCode + "/" + (collectorNumber == null ? "?" : collectorNumber), byName);
        }

        boolean setMatches = editionMatches(setCode, card.getEdition());
        boolean numberMatches = collectorNumber == null
                || collectorNumber.isBlank()
                || collectorNumber.equalsIgnoreCase(card.getCollectorNumber());

        if (!setMatches || !numberMatches) {
            return Resolution.printingMismatch(
                    setCode + "/" + (collectorNumber == null ? "?" : collectorNumber), card);
        }
        return Resolution.resolved(card);
    }
}
