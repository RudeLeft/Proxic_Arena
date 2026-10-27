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
}
