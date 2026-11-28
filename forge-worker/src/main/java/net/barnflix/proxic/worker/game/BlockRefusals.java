package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;
import java.util.function.IntPredicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Spec 0125, item 1 (owner 2026-11-27, "At the refusal") -- a lone block of a
 * menace attacker, refused, told to every board.
 *
 * Forge refuses the whole block when the defender says "done"
 * (CombatUtil#validateBlocks, CombatChoices#blocksAccepted). Its reason names
 * the attacker with its game id ("Boggart Brute (38) cannot be blocked with 1
 * creatures you've assigned"). Spec 0097 says that only on the defender's
 * question asked again (`refused`, the combat button's note). This tells
 * every board, once, on the round's next snapshots:
 *
 *   blockRefused  [{attacker: "card:N", blockers: ["card:M", ...], why: "menace"}]
 *
 * so both pages pop the attacker's menace square at the refusal. Only a
 * refusal whose attacker has menace (Forge's keyword on the card) is told;
 * any other "too few blockers" refusal is the defender's note alone, as
 * before. Public: the attacker and the tentative block are already on every
 * board (`combat.blocks`), and the snapshot's ids pass HiddenIds like any.
 */
final class BlockRefusals {

    private BlockRefusals() {
    }

    /** One refused lone block: the menace attacker and the creatures that tried to block it. */
    record Refused(int attacker, List<Integer> blockers) {}

    private static final Pattern TOO_FEW =
            Pattern.compile("^(.+?)\\s\\((\\d+)\\) cannot be blocked with (\\d+) creatures you've assigned\\.?$");

    /**
     * The attacker's game id when Forge's reason [problem] is "too few
     * blockers" for an attacker that [hasMenace] says has menace; else null.
     */
    static Integer menaceAttacker(String problem, IntPredicate hasMenace) {
        if (problem == null) {
            return null;
        }
        Matcher m = TOO_FEW.matcher(problem.trim());
        if (!m.matches()) {
            return null;
        }
        int id = Integer.parseInt(m.group(2));
        return hasMenace.test(id) ? id : null;
    }

    /** The round's refusals as the snapshot says them (one per attacker), and [now] emptied: told once. */
    static JsonArray drain(List<Refused> now) {
        JsonArray out = new JsonArray();
        List<Refused> taken;
        synchronized (now) {
            taken = new ArrayList<>(now);
            now.clear();
        }
        java.util.Set<Integer> said = new java.util.HashSet<>();
        for (Refused each : taken) {
            if (!said.add(each.attacker())) {
                continue;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("attacker", "card:" + each.attacker());
            JsonArray blockers = new JsonArray();
            each.blockers().forEach(id -> blockers.add("card:" + id));
            entry.add("blockers", blockers);
            entry.addProperty("why", "menace");
            out.add(entry);
        }
        return out;
    }
}
