package net.barnflix.proxic.worker.game;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import forge.game.ability.ApiType;
import forge.game.spellability.SpellAbility;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/**
 * Spec 0101, item 2 -- stack entries that left the stack without resolving.
 *
 * Forge does not move a countered ability anywhere (CounterEffect
 * #removeFromStack moves nothing for an ability) and Time Stop clears the
 * whole stack (EndTurnEffect: MagicStack#clear). Both fire
 * GameEventSpellRemovedFromStack (MagicStack#remove, #clear). The worker
 * notes, as Forge fires it, which entry left while WHICH effect resolved: a
 * Counter part (ApiType.Counter -- a counterspell, Stifle, a ward trigger)
 * or an end-the-turn part (ApiType.EndTurn). The round then lists
 *
 *   left  [{stack: "stack:N", why: "countered" | "ended", by?: "card:N"}]
 *
 * so the page knows an ability was countered when no card moves (it must not
 * guess it from an entry vanishing: an ability that resolves vanishes the
 * same way). A countered spell keeps its card move too. Public: stack ids
 * and what resolved are seen by everyone; only entries a board has already
 * shown are listed (GameHost#leftFor), and `by` is a card id HiddenIds strips
 * when that card is now somewhere the viewer cannot see.
 */
final class StackLeft {

    private StackLeft() {
    }

    /** One entry that left: its stack instance id, why, and the card whose effect did it (0: none). */
    record Left(int stack, String why, int by) {}

    /**
     * Why an entry leaving the stack while [resolving] resolves did not
     * resolve: "countered" when a part of it counters, "ended" when a part of
     * it ends the turn, else null (it left some other way: told by nothing).
     */
    static String why(SpellAbility resolving) {
        boolean counters = false;
        boolean ends = false;
        for (SpellAbility part = resolving; part != null; part = part.getSubAbility()) {
            ApiType api = part.getApi();
            counters |= api == ApiType.Counter;
            ends |= api == ApiType.EndTurn;
        }
        return ends ? "ended" : counters ? "countered" : null;
    }

    /** The round's entries as the snapshot says them, those in [told] only (a board showed them). */
    static JsonArray json(List<Left> left, Set<Integer> told) {
        JsonArray out = new JsonArray();
        Set<Integer> said = new java.util.HashSet<>();
        for (Left each : left) {
            if (!told.contains(each.stack()) || !said.add(each.stack())) {
                continue;
            }
            JsonObject entry = new JsonObject();
            entry.addProperty("stack", "stack:" + each.stack());
            entry.addProperty("why", each.why());
            if (each.by() != 0) {
                entry.addProperty("by", "card:" + each.by());
            }
            out.add(entry);
        }
        return out;
    }

    /** For the unit test: the entries of [all] other than [resolving] that a clear ended. */
    static List<Left> ended(Iterable<Integer> all, int resolving, int by) {
        List<Left> out = new ArrayList<>();
        for (int id : all) {
            if (id != resolving) {
                out.add(new Left(id, "ended", by));
            }
        }
        return out;
    }
}
