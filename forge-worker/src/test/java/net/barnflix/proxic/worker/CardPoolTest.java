package net.barnflix.proxic.worker;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Spec 0021 — CARD_POOL lists exactly what Forge resolves (F-0021-A, B).
 *
 * The pool is only worth sending if a printing it lists is one this very
 * worker accepts and one it leaves out is refused. So the check asks
 * {@link ForgeRuntime#resolve} — import's own path — rather than restating
 * what Forge should do. Forge's resources are required, never skipped,
 * as {@code UnreachableQuestionsTest} requires them.
 */
class CardPoolTest {

    private static ForgeRuntime runtime;
    private static JsonObject pool;
    private static final Map<String, JsonObject> BY_NAME = new HashMap<>();

    @BeforeAll
    static void loadForge() {
        List<Path> candidates = new ArrayList<>();
        String given = System.getProperty("forge.res", System.getenv("FORGE_RES"));
        if (given != null) {
            candidates.add(Path.of(given));
        }
        candidates.add(Path.of("..", "spikes", "forge-phase0a", "forge-upstream", "forge-gui", "res"));
        candidates.add(Path.of("/forge/forge-gui/res"));
        Path res = candidates.stream().filter(p -> Files.isDirectory(p.resolve("cardsfolder"))).findFirst()
                .orElseThrow(() -> new AssertionError("Forge's resources not found in " + candidates
                        + " -- set -Dforge.res=<forge-gui/res>"));
        runtime = new ForgeRuntime(new File(res.toAbsolutePath().toString()));
        pool = CardPool.describe(runtime);
        for (JsonElement card : pool.getAsJsonArray("cards")) {
            BY_NAME.put(card.getAsJsonObject().get("name").getAsString(), card.getAsJsonObject());
        }
    }

    private static List<String> printings(String name) {
        List<String> found = new ArrayList<>();
        BY_NAME.get(name).getAsJsonArray("printings").forEach(p -> found.add(p.getAsString()));
        return found;
    }

    /** F-0021-A: a sample of every listed printing, asked back by set and number, resolves. */
    @Test
    void everyListedPrintingResolves() {
        int asked = 0;
        int step = 0;
        for (JsonObject card : BY_NAME.values()) {
            for (JsonElement printing : card.getAsJsonArray("printings")) {
                // Every 25th, so the whole pool is crossed in seconds.
                if (step++ % 25 != 0) {
                    continue;
                }
                String[] parts = printing.getAsString().split(" ", 2);
                ForgeRuntime.Resolution answer = runtime.resolve(card.get("name").getAsString(), parts[0], parts[1]);
                assertEquals("RESOLVED", answer.status,
                        card.get("name").getAsString() + " " + printing.getAsString() + ": " + answer.detail);
                asked++;
            }
        }
        assertTrue(asked > 3000, "the sample covered the pool: " + asked);
    }

    /** And a printing it leaves out is refused: the 2026-10-23 refusals, at this pin. */
    @Test
    void anUnlistedPrintingIsRefused() {
        assertFalse(printings("Island").contains("MDD 294"));
        assertEquals("PRINTING_MISMATCH", runtime.resolve("Island", "MDD", "294").status);
        assertTrue(printings("Island").contains("M21 263"));
        assertTrue(printings("Space Beleren").contains("UNF 178"));
    }

    /** F-0021-B: set codes are Forge's own lookup -- a second code finds its edition, a Scryfall code alone does not. */
    @Test
    void setCodesAreForgesLookup() {
        JsonObject codes = pool.getAsJsonObject("setCodes");
        assertEquals("CFX", codes.get("CON").getAsString());
        assertEquals("M21", codes.get("M21").getAsString());
        assertNull(codes.get("UGIN"), "Ugin's Fate answers to UGF, not its Scryfall code");
        assertEquals("RESOLVED", runtime.resolve("Hellspark Elemental", "CON", "65").status);
        assertEquals("PRINTING_MISMATCH", runtime.resolve("Ugin, the Spirit Dragon", "UGIN", "1").status);
    }

    /** The playable pool only: Contraptions in, with their deck; planes and schemes out, as import has it. */
    @Test
    void sideDeckCardsAreMarkedAndOtherVariantsLeftOut() {
        boolean contraption = false;
        for (JsonObject card : BY_NAME.values()) {
            JsonElement section = card.get("section");
            if (section != null && "CONTRAPTIONS".equals(section.getAsString())) {
                contraption = true;
            }
        }
        assertTrue(contraption, "Unstable's Contraptions are listed, marked");
        assertNull(BY_NAME.get("Esper"), "a plane is not a card a deck can hold");
        assertEquals("NOT_FOUND", runtime.resolve("Esper", null, null).status);
    }

    /** A face's name is not a card's: Emeritus of Conflict's other face is Lightning Bolt. */
    @Test
    void facesAreListedUnderTheirCard() {
        JsonObject emeritus = BY_NAME.get("Emeritus of Conflict");
        assertNotNull(emeritus);
        JsonArray faces = emeritus.getAsJsonArray("faces");
        assertTrue(faces.toString().contains("Lightning Bolt"));
        assertTrue(printings("Lightning Bolt").contains("M10 146"), "Lightning Bolt keeps its own printings");
    }

    /**
     * Spec 0022, F-0022-G -- printings come in Forge's own order: the first
     * listed is the edition Forge picks under that preference.
     */
    @Test
    void printingsComeInForgesOrder() {
        for (String name : List.of("Lightning Bolt", "Llanowar Elves", "Counterspell", "Island", "Sol Ring")) {
            forge.item.PaperCard pick = forge.StaticData.instance().getCommonCards()
                    .getCardFromEditions(name, CardPool.ORDER, 1, null);
            assertNotNull(pick, name);
            String first = printings(name).get(0);
            assertEquals(pick.getEdition(), first.substring(0, first.indexOf(' ')),
                    name + ": first listed " + first + ", Forge picks " + pick.getEdition());
        }
    }

    private static Map<String, String> editionTypes() {
        Map<String, String> types = new HashMap<>();
        for (JsonElement edition : pool.getAsJsonArray("editions")) {
            JsonObject one = edition.getAsJsonObject();
            types.put(one.get("code").getAsString(), one.get("type").getAsString());
        }
        return types;
    }

    /**
     * Spec 0023, F-0023-A -- each edition has the type its own file gives
     * it. Forge was once handed the editions folder a second time as custom
     * editions, and every edition read as a custom set (682 of 682), so
     * F-0022-G's order had nothing to sort on. Only Forge's own bucket for
     * custom cards, USER, is a custom set.
     */
    @Test
    void editionsHaveTheirOwnType() {
        Map<String, String> types = editionTypes();
        List<String> custom = new ArrayList<>();
        types.forEach((code, type) -> {
            if ("CUSTOM_SET".equals(type)) {
                custom.add(code);
            }
        });
        assertEquals(List.of("USER"), custom, "custom sets");
        assertEquals("CORE", types.get("M10"));
        assertEquals("EXPANSION", types.get("ZEN"));
        assertEquals("REPRINT", types.get("DMR"));
        assertEquals("COLLECTOR_EDITION", types.get("SLZ"));
        assertEquals("PROMO", types.get("PF26"));
    }

    /**
     * Spec 0024, F-0024-E (worker half) -- the cards whose printing changes
     * what they do are marked, and only those: 24 at forge-2.0.15. A
     * printing that only shows another name (Adeline's Godzilla-style
     * flavour name) plays the same and is not marked.
     */
    @Test
    void cardsWhosePrintingMattersAreMarked() {
        List<String> marked = new ArrayList<>();
        for (JsonObject card : BY_NAME.values()) {
            JsonElement flag = card.get("printingMatters");
            if (flag != null && flag.getAsBoolean()) {
                marked.add(card.get("name").getAsString());
            }
        }
        assertEquals(24, marked.size(), "marked: " + marked);
        assertTrue(marked.contains("Everythingamajig"));
        assertTrue(marked.contains("Balloon Stand"), "an Attraction's lights differ by printing");
        assertFalse(marked.contains("Lightning Bolt"));
        assertFalse(marked.contains("Adeline, Resplendent Cathar"), "a flavour name only");

        ForgeRuntime.Resolution attraction = runtime.resolve("Balloon Stand", "ZZZ", "1");
        assertEquals("PRINTING_MISMATCH", attraction.status);
        assertTrue(attraction.printingMatters);
        assertFalse(runtime.resolve("Lightning Bolt", "ZZZ", "1").printingMatters);
    }

    /**
     * Spec 0023, F-0023-B -- F-0022-G compares the list with Forge, which
     * read the same wrong types, so it passed either way. This asks what the
     * first printing IS: a core, expansion or reprint set, not the newest
     * special printing (Lightning Bolt was SLZ 184, a collector edition).
     */
    @Test
    void firstPrintingIsFromAnOrdinarySet() {
        Map<String, String> types = editionTypes();
        for (String name : List.of("Lightning Bolt", "Counterspell", "Llanowar Elves", "Sol Ring")) {
            String first = printings(name).get(0);
            String type = types.get(first.substring(0, first.indexOf(' ')));
            assertTrue(List.of("CORE", "EXPANSION", "REPRINT").contains(type),
                    name + ": first listed " + first + " is " + type);
        }
    }
}
