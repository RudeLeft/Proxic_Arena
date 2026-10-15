package proxic.spike;

import forge.StaticData;
import forge.card.CardType;
import forge.card.CardRules;
import forge.card.MagicColor;
import forge.game.card.Card;
import forge.game.spellability.SpellAbility;
import forge.item.PaperCard;
import forge.ImageKeys;
import forge.CardStorageReader;
import forge.util.FileSection;
import forge.util.FileUtil;
import forge.util.Lang;
import forge.util.Localizer;

import java.io.File;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 0A §0A.5 — Forge bootstrap probe.
 *
 * Determines, step by step and from a clean JVM, what a headless Forge
 * actually requires in order to load its card database and recognise a
 * basic land as a land.
 *
 * This is NOT a copy of the old project's bootstrap. It is the old
 * bootstrap's sequence used as a *hypothesis* (0A.2) and re-derived
 * against Forge 2.0.15, with every resource path independently
 * overridable so that omitting one proves whether it was required.
 *
 * Usage:
 *   BootstrapProbe --res=&lt;dir&gt; [--skip=step,step] [--languages=PATH] ...
 *
 * Steps, in order:
 *   localizer   Localizer.initialize + Lang.createInstance
 *   imagekeys   ImageKeys.initializeDirs
 *   typelists   CardType.Helper.parseTypes from lists/TypeLists.txt
 *   staticdata  CardStorageReader(s) + new StaticData(...)
 *
 * Probes, after bootstrap:
 *   card lookup, basic-land recognition, mana ability, token availability
 *
 * Exit code 0 = probes passed. Non-zero = the configuration failed, which
 * for an omission run is the POINT: it is the observed failure that
 * justifies shipping that resource.
 */
public final class BootstrapProbe {
    private BootstrapProbe() {}

    private static long t0;
    private static void step(String s) {
        System.out.printf("[%6d ms] %s%n", System.currentTimeMillis() - t0, s);
    }

    public static void main(String[] args) {
        t0 = System.currentTimeMillis();
        Map<String, String> opt = new HashMap<>();
        for (String a : args) {
            int eq = a.indexOf('=');
            if (a.startsWith("--") && eq > 0) {
                opt.put(a.substring(2, eq), a.substring(eq + 1));
            }
        }
        String res = opt.getOrDefault("res", "../forge-upstream/forge-gui/res");
        String skip = opt.getOrDefault("skip", "");

        // Each resource path is independently overridable. Pointing one at a
        // nonexistent directory is how §0A.5's "prove it by the failure when
        // it is absent" is performed without copying a 34,000-file tree.
        String languages   = opt.getOrDefault("languages",   res + "/languages");
        String lists       = opt.getOrDefault("lists",       res + "/lists");
        String cardsfolder = opt.getOrDefault("cardsfolder", res + "/cardsfolder");
        String tokenscripts= opt.getOrDefault("tokenscripts",res + "/tokenscripts");
        String editions    = opt.getOrDefault("editions",    res + "/editions");
        String blockdata   = opt.getOrDefault("blockdata",   res + "/blockdata");
        String setlookup   = opt.getOrDefault("setlookup",   res + "/setlookup");

        System.out.println("=== Proxic Phase 0A bootstrap probe ===");
        System.out.println("forge res root : " + new File(res).getAbsolutePath());
        System.out.println("skipping steps : " + (skip.isEmpty() ? "(none)" : skip));
        for (String[] p : new String[][]{
                {"languages", languages}, {"lists", lists}, {"cardsfolder", cardsfolder},
                {"tokenscripts", tokenscripts}, {"editions", editions},
                {"blockdata", blockdata}, {"setlookup", setlookup}}) {
            System.out.printf("  %-13s %-5s %s%n", p[0],
                    new File(p[1]).isDirectory() ? "OK" : "MISS", p[1]);
        }
        System.out.println();

        try {
            if (!skip.contains("localizer")) {
                Localizer.getInstance().initialize("en-US", languages);
                Lang.createInstance("en-US");
                step("localizer initialised");
            } else {
                step("localizer SKIPPED");
            }

            if (!skip.contains("imagekeys")) {
                // Card art is irrelevant to the rules engine, but CardDb's
                // lookup path calls hasImage() unconditionally.
                ImageKeys.initializeDirs("", Collections.emptyMap(), "", "", "", "", "", "", "");
                step("ImageKeys initialised");
            } else {
                step("ImageKeys SKIPPED");
            }

            if (!skip.contains("typelists")) {
                // Populates CardType's runtime type vocabularies. Without
                // this, "Forest" parses as supertypes with no land subtype
                // meaning, and its mana ability never exists.
                Map<String, List<String>> typeLists = FileSection.parseSections(
                        FileUtil.readFile(new File(lists + "/TypeLists.txt")));
                int parsed = 0;
                for (Map.Entry<String, List<String>> s : typeLists.entrySet()) {
                    if (s.getKey().endsWith("Types")) {
                        CardType.Helper.parseTypes(s.getKey(), s.getValue());
                        parsed++;
                    }
                }
                step("type lists parsed (" + parsed + " sections)");
            } else {
                step("type lists SKIPPED");
            }

            if (!skip.contains("staticdata")) {
                CardStorageReader cards = new CardStorageReader(cardsfolder, null, false);
                CardStorageReader tokens = new CardStorageReader(tokenscripts, null, false);
                new StaticData(cards, tokens, null, null, editions, editions,
                        blockdata, setlookup, "Latest", false, false, false, false);
                step("StaticData constructed");
            } else {
                step("StaticData SKIPPED");
            }

            // ---- probes -------------------------------------------------
            StaticData data = StaticData.instance();
            int total = data.getCommonCards().getAllCards().size();
            step("card database loaded: " + total + " cards");

            PaperCard forest = data.getCommonCards().getCard("Forest");
            if (forest == null) throw new IllegalStateException("PROBE FAIL: 'Forest' not found");
            CardRules fr = forest.getRules();
            boolean isLand = fr.getType().isLand();
            boolean isBasic = fr.getType().isBasic();
            boolean hasForestSubtype = fr.getType().hasSubtype("Forest");
            step("Forest: isLand=" + isLand + " isBasic=" + isBasic
                    + " hasSubtype(Forest)=" + hasForestSubtype);
            if (!isLand || !isBasic || !hasForestSubtype) {
                throw new IllegalStateException(
                        "PROBE FAIL: basic land not correctly typed — this is the "
                        + "type-vocabulary trap (lists/TypeLists.txt)");
            }

            // THE sensitive check. Type flags above are NOT enough: the old
            // project's symptom for a missing type vocabulary was that every
            // basic land's MANA ABILITY silently failed to exist while the
            // card still looked like a land. Checking isLand() would have
            // passed straight through that bug.
            Card forestCard = Card.fromPaperCard(forest, null);
            SpellAbility greenMana =
                    forestCard.getCurrentState().getLandManaForColor(MagicColor.Color.GREEN);
            int manaAbilityCount = 0;
            for (SpellAbility ignored : forestCard.getManaAbilities()) {
                manaAbilityCount++;
            }
            step("Forest card: getLandManaForColor(GREEN)=" + (greenMana != null)
                    + " manaAbilities=" + manaAbilityCount);
            if (greenMana == null && manaAbilityCount == 0) {
                throw new IllegalStateException(
                        "PROBE FAIL: Forest has no mana ability -- this is the "
                        + "type-vocabulary trap (lists/TypeLists.txt)");
            }

            PaperCard bolt = data.getCommonCards().getCard("Lightning Bolt");
            step("Lightning Bolt found: " + (bolt != null));

            // Tokens. getAllTokens() returns a LAZILY populated map, so a
            // count of zero before preload proves nothing -- asking it was
            // the wrong question (EVID-002: absence of a count is not
            // absence of capability). What matters is (a) the token
            // database exists at all, and (b) the token RULES parsed from
            // tokenscripts/ are present, which is what a token-creating
            // effect actually resolves against.
            var tokenDb = data.getAllTokens();
            if (tokenDb == null) {
                throw new IllegalStateException(
                        "PROBE FAIL: token database is null -- a token-creating "
                        + "effect would NPE at StaticData.getAllTokens()");
            }
            int lazyCount = tokenDb.getAllTokens().size();
            boolean knownRule = tokenDb.containsRule("r_1_1_goblin");
            step("token db present; lazily-loaded=" + lazyCount
                    + "; containsRule(r_1_1_goblin)=" + knownRule);
            if (!knownRule) {
                throw new IllegalStateException(
                        "PROBE FAIL: token rules not parsed from tokenscripts/");
            }

            int editionCount = data.getEditions() == null
                    ? -1 : com.google.common.collect.Iterables.size(data.getEditions());
            step("editions loaded: " + editionCount);

            // ---- §0A.9A: exact-printing resolution --------------
            // Proves name + set + collector number resolves to a
            // specific PaperCard, and that the result really is that
            // printing rather than a silent fall-back to "some
            // Lightning Bolt". The old bridge matched the [SET:NUM]
            // tag in a NON-CAPTURING group and resolved by name alone,
            // so this is a known gap being closed, not an open
            // question.
            System.out.println();
            System.out.println("=== 0A.9A exact printing ===");
            var db = data.getCommonCards();
            String[][] probes = {
                {"Lightning Bolt", "LEA", "161"},   // valid
                {"Forest",         "KTK", "266"},   // valid
                {"Shock",          "M21", "159"},   // valid
                {"Forest",         "KTK", "261"},   // INVALID number for KTK
                {"Lightning Bolt", "ZZZ", "999"},   // INVALID set entirely
            };
            int exact = 0, fellBack = 0;
            for (String[] q : probes) {
                PaperCard byName = db.getCard(q[0]);
                PaperCard bySet  = db.getCard(q[0], q[1]);
                PaperCard byNum  = db.getCard(q[0], q[1], q[2]);
                String r = String.format("    %-16s name=%s  set=%s  set+num=%s",
                        q[0],
                        byName == null ? "MISS" : byName.getEdition(),
                        bySet  == null ? "MISS" : bySet.getEdition(),
                        byNum  == null ? "MISS" : byNum.getEdition() + "/" + byNum.getCollectorNumber());
                System.out.println(r);
                boolean asked = byNum != null
                        && q[1].equals(byNum.getEdition())
                        && q[2].equals(byNum.getCollectorNumber());
                if (asked) exact++;
                else if (byNum != null) {
                    fellBack++;
                    System.out.println("        ^^ SILENT FALLBACK: asked " + q[1] + "/" + q[2]
                            + ", got " + byNum.getEdition() + "/" + byNum.getCollectorNumber());
                }
            }
            System.out.println("    exact printing resolved: " + exact + "/" + probes.length
                    + "   silently fell back: " + fellBack);
            System.out.println("    -> Phase 2 MUST verify the returned PaperCard matches the");
            System.out.println("       requested set and collector number. The lookup does not.");

            System.out.println();
            System.out.println("RESULT: PASS");
            System.exit(0);
        } catch (Throwable t) {
            System.out.println();
            System.out.println("RESULT: FAIL");
            System.out.println("  " + t.getClass().getName() + ": " + t.getMessage());
            StackTraceElement[] st = t.getStackTrace();
            for (int i = 0; i < Math.min(6, st.length); i++) {
                System.out.println("    at " + st[i]);
            }
            System.exit(1);
        }
    }
}
