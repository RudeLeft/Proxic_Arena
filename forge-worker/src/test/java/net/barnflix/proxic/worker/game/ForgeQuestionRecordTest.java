package net.barnflix.proxic.worker.game;

import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * The Phase 8 record cannot drift from the code -- PHASE_08 P8-A, P8-B.
 *
 * The record (forge-questions.tsv) is a row per question Forge's
 * PlayerController can put to a player, and per cost kind its cost
 * visitor can ask to have paid. The entries are read HERE, from the
 * compiled interfaces at whatever Forge version is pinned, never from
 * anybody's memory, and the build fails when:
 *
 *   - Forge has an entry the record has no row for (a Forge update added
 *     a question: nobody ships until it is classified), or the record
 *     names one Forge does not have;
 *   - a row's status disagrees with what the code does, either way: a row
 *     that says a question is answered while the worker still stops on it
 *     loudly, or one that says UNBUILT while the worker answers it.
 *
 * What the code does is read from where each method is implemented:
 * MatchController / MatchCostDecision answer; GeneratedControllerBase /
 * GeneratedCostDecisionBase are the loud stops (STUB-002); a method left
 * to PlayerController is Forge's own default.
 *
 * The rest of the gate needs the repository, not just the worker:
 * scripts/check-question-record.py (every piece of evidence exists and
 * runs in CI) and scripts/check-questions-asked.py (every answered
 * question was really asked in that CI run's Mechanics Lab games).
 */
class ForgeQuestionRecordTest {

    static final String RECORD = "/forge-questions.tsv";

    /** Answered by Proxic: the evidence says how it was proven. */
    static final Set<String> ANSWERED = Set.of("ASKS", "TELLS", "ENGINE");
    static final Set<String> STATUSES = Set.of(
            "ASKS", "TELLS", "ENGINE", "UNBUILT", "UNREACHABLE", "ROUTES-TO", "NOT-A-QUESTION");

    static String signature(Method m) {
        return m.getName() + "(" + Arrays.stream(m.getParameterTypes())
                .map(Class::getSimpleName).collect(Collectors.joining(",")) + ")";
    }

    /** Every entry Forge has, keyed as the record keys it, to who implements it. */
    static Map<String, String> entries() throws ClassNotFoundException, NoSuchMethodException {
        Map<String, String> out = new TreeMap<>();
        Class<?> forge = Class.forName("forge.game.player.PlayerController");
        for (Method m : forge.getDeclaredMethods()) {
            int mod = m.getModifiers();
            if (!Modifier.isPublic(mod) || Modifier.isStatic(mod) || Modifier.isFinal(mod)) {
                continue;
            }
            Method impl = MatchController.class.getMethod(m.getName(), m.getParameterTypes());
            out.put("Q " + signature(m), impl.getDeclaringClass().getSimpleName());
        }
        Class<?> visitor = Class.forName("forge.game.cost.ICostVisitor");
        for (Method m : visitor.getDeclaredMethods()) {
            if (!m.getName().equals("visit")) {
                continue;
            }
            Method impl = MatchCostDecision.class.getMethod(m.getName(), m.getParameterTypes());
            out.put("C " + m.getParameterTypes()[0].getSimpleName(), impl.getDeclaringClass().getSimpleName());
        }
        return out;
    }

    /** The record's rows: entry -> status. Comments (#) and the header are skipped. */
    static Map<String, String> record() throws Exception {
        Map<String, String> rows = new LinkedHashMap<>();
        List<String> problems = new ArrayList<>();
        try (InputStream in = ForgeQuestionRecordTest.class.getResourceAsStream(RECORD)) {
            assertNotNull(in, "the record " + RECORD + " is missing");
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line;
            boolean header = true;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank() || line.startsWith("#")) {
                    continue;
                }
                if (header) {
                    header = false;
                    continue;
                }
                String[] cells = line.split("\t", -1);
                if (rows.put(cells[0], cells.length > 1 ? cells[1] : "") != null) {
                    problems.add("two rows for " + cells[0]);
                }
            }
        }
        assertTrue(problems.isEmpty(), String.join("\n", problems));
        return rows;
    }

    /** P8-A: a row for every entry, and no row for an entry Forge does not have. */
    @Test
    void everyForgeQuestionHasARow() throws Exception {
        Map<String, String> entries = entries();
        Map<String, String> rows = record();
        Set<String> missing = new TreeSet<>(entries.keySet());
        missing.removeAll(rows.keySet());
        Set<String> stale = new TreeSet<>(rows.keySet());
        stale.removeAll(entries.keySet());
        if (!missing.isEmpty() || !stale.isEmpty()) {
            fail("the record and Forge disagree.\n"
                    + (missing.isEmpty() ? "" : "Forge asks, no row (classify it first): " + missing + "\n")
                    + (stale.isEmpty() ? "" : "a row for something Forge does not have: " + stale));
        }
    }

    /** P8-B: the record never claims more, or less, than the code does. */
    @Test
    void everyStatusIsWhatTheCodeDoes() throws Exception {
        Map<String, String> entries = entries();
        List<String> wrong = new ArrayList<>();
        record().forEach((entry, status) -> {
            String who = entries.get(entry);
            if (who == null) {
                return; // the test above names it
            }
            if (!STATUSES.contains(status)) {
                wrong.add(entry + ": unknown status '" + status + "'");
                return;
            }
            boolean answers = who.equals("MatchController") || who.equals("MatchCostDecision");
            boolean loud = who.equals("GeneratedControllerBase") || who.equals("GeneratedCostDecisionBase");
            boolean forgeDefault = who.equals("PlayerController");
            if (ANSWERED.contains(status) && !answers) {
                wrong.add(entry + ": says " + status + ", but " + who + " implements it -- nothing answers it");
            }
            if (status.equals("UNBUILT") && !loud) {
                wrong.add(entry + ": says UNBUILT, but " + who + " answers it -- the row is out of date");
            }
            if (status.equals("ROUTES-TO") && !forgeDefault) {
                wrong.add(entry + ": says ROUTES-TO (Forge's default), but " + who + " implements it");
            }
            if (loud && !(status.equals("UNBUILT") || status.equals("UNREACHABLE"))) {
                wrong.add(entry + ": is a loud stop in " + who + ", so it is UNBUILT or UNREACHABLE, not " + status);
            }
        });
        assertTrue(wrong.isEmpty(), "the record says something the code does not:\n" + String.join("\n", wrong));
    }
}
