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
        // loadNonLegalCards TRUE -- owner, 2026-10-23 (Phase 8 Amendment
        // 3): Open Format's pool is unrestricted, joke sets included.
        // Forge otherwise leaves out every silver-bordered card, and
        // Unstable's Contraptions and the cards that assemble them could
        // not even be imported.
        new StaticData(
                cards, tokens, null, null,
                root + "/editions", root + "/editions",
                root + "/blockdata", root + "/setlookup",
                "Latest", false, true, false, false);

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
        // The cards that went to a contraption or attraction deck, by name.
        java.util.Map<String, String> sections = new java.util.TreeMap<>();
        for (forge.deck.DeckSection side : java.util.List.of(
                forge.deck.DeckSection.Contraptions, forge.deck.DeckSection.Attractions)) {
            if (built.deck.has(side)) {
                for (PaperCard card : built.deck.get(side).toFlatList()) {
                    sections.put(card.getName(), side.name().toUpperCase(java.util.Locale.ROOT));
                }
            }
        }
        return new DeckBuild(
                built.deck.getMain().toFlatList().size(), counts, built.unresolved, sections);
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
            PaperCard card = lookup(lookupName, resolution.actualSet, resolution.actualNumber);
            if (card == null) {
                unresolved.add(entry.name + " (LOOKUP_FAILED)");
                continue;
            }
            // Phase 8 Amendment 3 (owner, 2026-10-23): a Contraption or an
            // Attraction goes to its own deck, by Forge's own test of the
            // card, and Forge deals those decks from these sections.
            String section = Resolution.sectionOf(card);
            if (section == null) {
                main.add(card, entry.quantity);
            } else {
                deck.getOrCreate(forge.deck.DeckSection.valueOf(section)).add(card, entry.quantity);
            }
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
        /** Cards in a contraption or attraction deck: name to CONTRAPTIONS or ATTRACTIONS. */
        public final java.util.Map<String, String> sections;

        DeckBuild(int totalCards, java.util.Map<String, Integer> countsByName,
                java.util.List<String> unresolved, java.util.Map<String, String> sections) {
            this.totalCards = totalCards;
            this.countsByName = countsByName;
            this.unresolved = unresolved;
            this.sections = sections;
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
        /**
         * Phase 8 Amendment 3: CONTRAPTIONS or ATTRACTIONS for a card
         * that goes to its own deck, else null (the main deck).
         */
        public final String section;
        /**
         * Spec 0008: the name of the face a card turns over to (Delver of
         * Secrets -> Insectile Aberration), so the Deck Depot can show its
         * picture; null for a card with one face.
         */
        public final String backFace;
        /**
         * Spec 0012: the card's colour identity as Forge reads it, in
         * WUBRG order ("WR"; "" for colourless), so the Deck Depot can
         * suggest a deck icon; null when Forge found no card.
         */
        public final String colors;

        private Resolution(String status, String detail, String actualSet, String actualNumber,
                String category, String section, String backFace, String colors) {
            this.status = status;
            this.detail = detail;
            this.actualSet = actualSet;
            this.actualNumber = actualNumber;
            this.category = category;
            this.section = section;
            this.backFace = backFace;
            this.colors = colors;
        }

        static Resolution resolved(PaperCard card) {
            return new Resolution("RESOLVED", null, card.getEdition(),
                    card.getCollectorNumber(), categoryOf(card), sectionOf(card), backFaceOf(card),
                    colorsOf(card));
        }

        static Resolution notFound(String name) {
            return new Resolution("NOT_FOUND", "Forge does not know a card named \"" + name + "\".",
                    null, null, null, null, null, null);
        }

        static Resolution printingMismatch(String requested, PaperCard got) {
            return new Resolution(
                    "PRINTING_MISMATCH",
                    "Requested " + requested + ", Forge returned "
                            + got.getEdition() + "/" + got.getCollectorNumber() + ".",
                    got.getEdition(), got.getCollectorNumber(), categoryOf(got), sectionOf(got),
                    backFaceOf(got), colorsOf(got));
        }

        /**
         * Forge's own set of cards with two faces (transform, modal
         * double-faced, meld): the other face's name. A split or
         * adventure card is one face with two halves, and keeps null.
         */
        static String backFaceOf(PaperCard card) {
            forge.card.CardRules rules = card.getRules();
            if (!forge.card.CardSplitType.DUAL_FACED_CARDS.contains(rules.getSplitType())
                    || rules.getOtherPart() == null) {
                return null;
            }
            return rules.getOtherPart().getName();
        }

        /** Forge's colour identity of the card, as "WUBRG" letters in that order. */
        static String colorsOf(PaperCard card) {
            forge.card.ColorSet identity = card.getRules().getColorIdentity();
            StringBuilder letters = new StringBuilder(5);
            if (identity.hasWhite()) {
                letters.append('W');
            }
            if (identity.hasBlue()) {
                letters.append('U');
            }
            if (identity.hasBlack()) {
                letters.append('B');
            }
            if (identity.hasRed()) {
                letters.append('R');
            }
            if (identity.hasGreen()) {
                letters.append('G');
            }
            return letters.toString();
        }

        /** Forge's own test: the deck a Contraption or an Attraction belongs in, else null. */
        static String sectionOf(PaperCard card) {
            if (forge.deck.DeckSection.Contraptions.validate(card)) {
                return "Contraptions";
            }
            return forge.deck.DeckSection.Attractions.validate(card) ? "Attractions" : null;
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
    /**
     * A card by name, and set and number when given. Forge files
     * Contraptions and Attractions with its "variant" cards (planes,
     * schemes...), so those two -- and only those, Phase 8 Amendment 3 --
     * are looked up there too; a plane or a scheme stays not found.
     */
    private static PaperCard lookup(String name, String setCode, String collectorNumber) {
        StaticData data = StaticData.instance();
        PaperCard card = find(data.getCommonCards(), name, setCode, collectorNumber);
        if (card != null) {
            return card;
        }
        PaperCard variant = find(data.getVariantCards(), name, setCode, collectorNumber);
        return variant != null && Resolution.sectionOf(variant) != null ? variant : null;
    }

    private static PaperCard find(forge.card.CardDb db, String name, String setCode, String collectorNumber) {
        if (setCode == null || setCode.isBlank()) {
            return db.getCard(name);
        }
        return collectorNumber == null || collectorNumber.isBlank()
                ? db.getCard(name, setCode)
                : db.getCard(name, setCode, collectorNumber);
    }

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
            PaperCard byName = lookup(name, null, null);
            return byName == null ? Resolution.notFound(name) : Resolution.resolved(byName);
        }

        PaperCard card = lookup(name, setCode, collectorNumber);

        if (card == null) {
            // Fall back to name alone, so a card Forge knows under a
            // printing we cannot match is NOT_FOUND only when the
            // name itself is unknown.
            PaperCard byName = lookup(name, null, null);
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
