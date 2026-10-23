package net.barnflix.proxic.worker.game;

import forge.game.GameRules;
import forge.game.player.PlayerController;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Enumeration;
import java.util.List;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Forge questions that cannot arise in a Proxic game -- PHASE_08 P8-D.
 *
 * The record calls these UNREACHABLE. Saying so is not evidence: each is
 * proven here by the condition that keeps it away, read from the code
 * that runs, at the Forge version pinned, so a change that makes one
 * reachable (ante turned on, a Forge update that starts calling a method)
 * fails the build instead of reaching a player as a stopped game.
 *
 * (Proofs that need Forge's card files -- no card pays shards, a Backup
 * Plan in a deck never asks for a starting hand -- are
 * scripts/check-unreachable.py, which has them.)
 */
class UnreachableQuestionsTest {

    /**
     * Forge's GameType reads its names through the Localizer, as the
     * worker initialises it (ForgeRuntime). The resources are where the
     * worker build has them: here, or /forge in the Docker build. Not
     * found is a FAILURE, never a skip: a proof that does not run is the
     * bypass Phase 8 exists to close.
     */
    @BeforeAll
    static void forgeLanguages() {
        List<Path> candidates = new ArrayList<>();
        String given = System.getProperty("forge.res", System.getenv("FORGE_RES"));
        if (given != null) {
            candidates.add(Path.of(given));
        }
        candidates.add(Path.of("..", "spikes", "forge-phase0a", "forge-upstream", "forge-gui", "res"));
        candidates.add(Path.of("/forge/forge-gui/res"));
        Path res = candidates.stream().filter(p -> Files.isDirectory(p.resolve("languages"))).findFirst()
                .orElseThrow(() -> new AssertionError("Forge's resources not found in " + candidates
                        + " -- set -Dforge.res=<forge-gui/res>"));
        forge.util.Localizer.getInstance().initialize("en-US", res.toAbsolutePath() + "/languages");
        cardsFolder = res.resolve("cardsfolder");
    }

    private static Path cardsFolder;

    /**
     * No card pays a cost of choosing a colour (CostChooseColor, script
     * "ChooseColor<"): in every card script Forge has at the pin, joke
     * sets included, none uses it, so Forge never asks it. (Choosing a
     * colour as an EFFECT is another question, chooseColor, built.)
     */
    @Test
    void noCardPaysTheChooseAColourCost() throws Exception {
        assertTrue(cardsUsing("ChooseColor<").isEmpty(),
                "a card now pays ChooseColor<...> as a cost -- build CostChooseColor: " + cardsUsing("ChooseColor<"));
    }

    /** A search that finds nothing proves nothing: the same search finds a cost that is used. */
    @Test
    void theCardSearchFindsACostThatIsUsed() throws Exception {
        assertTrue(cardsUsing("AddCounterYou<").stream().anyMatch(f -> f.endsWith("the_serpent_society.txt")),
                "the search should find The Serpent Society's AddCounterYou ward");
    }

    private static List<String> cardsUsing(String text) throws Exception {
        try (Stream<Path> files = Files.walk(cardsFolder)) {
            List<String> found = new ArrayList<>();
            for (Path file : files.filter(f -> f.toString().endsWith(".txt")).collect(Collectors.toList())) {
                if (Files.readString(file).contains(text)) {
                    found.add(file.getFileName().toString());
                }
            }
            return found;
        }
    }

    /**
     * Ante is not played: Forge asks which won cards join a deck
     * (chooseCardsYouWonToAddToDeck) only when the rules play for ante.
     */
    @Test
    void anteIsNotPlayed() {
        assertFalse(GameHost.matchRules().useAnte(), "a Proxic game must not play for ante");
    }

    /**
     * The legacy damage-assignment order (orderAttackers, orderBlocker,
     * orderBlockers): Forge's Combat asks for it only when the rules turn
     * it on. Off by default, and Proxic never turns it on.
     */
    @Test
    void blockersAreNotOrderedForDamage() {
        assertFalse(GameHost.matchRules().hasOrderCombatants(),
                "the legacy order-combatants rule must stay off");
    }

    /**
     * Sideboarding between games (sideboard): Forge offers it only before
     * a match's SECOND game. A Proxic match is one game.
     */
    @Test
    void oneGamePerMatchSoNoSideboarding() {
        GameRules rules = GameHost.matchRules();
        assertEquals(1, rules.getGamesPerMatch(), "one game per match");
    }

    /**
     * "Your deck has cards the computer cannot play" (revealAISkipCards):
     * Forge sends it only with the cards a controller complained about,
     * and the worker's controller never complains -- it keeps Forge's own
     * default, which complains about nothing.
     */
    @Test
    void theWorkerNeverComplainsAboutAiCards() throws NoSuchMethodException {
        Method complain = MatchController.class.getMethod(
                "complainCardsCantPlayWell", forge.deck.Deck.class);
        assertEquals(PlayerController.class, complain.getDeclaringClass(),
                "overriding complainCardsCantPlayWell could make revealAISkipCards reachable");
    }

    /** Never called by Forge's rules at the pin: orderSimultaneousSa. */
    @Test
    void orderSimultaneousSaIsNeverCalled() throws Exception {
        assertNeverCalled(PlayerController.class.getMethod("orderSimultaneousSa", List.class));
    }

    /**
     * Never called by Forge's rules: the filter form of chooseSingleCardFace
     * (only Forge's desktop calls it, inside its own card naming).
     */
    @Test
    void theFilterCardFaceChoiceIsNeverCalled() throws Exception {
        assertNeverCalled(PlayerController.class.getMethod("chooseSingleCardFace",
                forge.game.spellability.SpellAbility.class, String.class,
                java.util.function.Predicate.class, String.class));
    }

    /**
     * The search below must find a call that exists, or "never called"
     * proves nothing: Combat calls orderBlockers (when the rule is on).
     */
    @Test
    void theSearchFindsACallThatExists() throws Exception {
        Method called = PlayerController.class.getMethod("orderBlockers",
                forge.game.card.Card.class, forge.game.card.CardCollection.class);
        List<String> callers = callersOf(called);
        assertTrue(callers.stream().anyMatch(c -> c.endsWith("Combat.class")),
                "the search should find Combat calling orderBlockers, found " + callers);
    }

    // --- the search ------------------------------------------------------------

    static void assertNeverCalled(Method method) throws Exception {
        List<String> callers = callersOf(method);
        assertTrue(callers.isEmpty(), method.getName() + " is called by " + callers
                + " -- it can arise now: classify and build it");
    }

    /**
     * Every class in Forge's rules engine (the jar or directory holding
     * PlayerController) whose constant pool names both the method and its
     * exact descriptor -- which a call to it must. The controllers that
     * DECLARE it are left out.
     */
    static List<String> callersOf(Method method) throws Exception {
        byte[] name = method.getName().getBytes(StandardCharsets.UTF_8);
        byte[] descriptor = descriptorOf(method).getBytes(StandardCharsets.UTF_8);
        URI where = PlayerController.class.getProtectionDomain().getCodeSource().getLocation().toURI();
        Path path = Path.of(where);
        List<String> callers = new ArrayList<>();
        if (Files.isDirectory(path)) {
            try (Stream<Path> files = Files.walk(path)) {
                for (Path file : files.filter(f -> f.toString().endsWith(".class")).collect(Collectors.toList())) {
                    String entry = path.relativize(file).toString().replace('\\', '/');
                    if (calls(entry, Files.readAllBytes(file), name, descriptor)) {
                        callers.add(entry);
                    }
                }
            }
            return callers;
        }
        try (JarFile jar = new JarFile(path.toFile())) {
            Enumeration<JarEntry> entries = jar.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (!entry.getName().startsWith("forge/game/") || !entry.getName().endsWith(".class")) {
                    continue;
                }
                try (InputStream in = jar.getInputStream(entry)) {
                    if (calls(entry.getName(), readAll(in), name, descriptor)) {
                        callers.add(entry.getName());
                    }
                }
            }
        }
        return callers;
    }

    private static boolean calls(String entry, byte[] bytes, byte[] name, byte[] descriptor) {
        if (entry.contains("PlayerController")) {
            return false; // declares it, does not call it
        }
        return indexOf(bytes, name) >= 0 && indexOf(bytes, descriptor) >= 0;
    }

    static String descriptorOf(Method method) {
        String params = Arrays.stream(method.getParameterTypes())
                .map(UnreachableQuestionsTest::typeDescriptor).collect(Collectors.joining());
        return "(" + params + ")" + typeDescriptor(method.getReturnType());
    }

    private static String typeDescriptor(Class<?> type) {
        if (type.isArray()) {
            return "[" + typeDescriptor(type.getComponentType());
        }
        if (type.isPrimitive()) {
            if (type == void.class) return "V";
            if (type == boolean.class) return "Z";
            if (type == byte.class) return "B";
            if (type == char.class) return "C";
            if (type == short.class) return "S";
            if (type == int.class) return "I";
            if (type == long.class) return "J";
            if (type == float.class) return "F";
            return "D";
        }
        return "L" + type.getName().replace('.', '/') + ";";
    }

    private static byte[] readAll(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        in.transferTo(out);
        return out.toByteArray();
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i <= haystack.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return i;
        }
        return -1;
    }
}
