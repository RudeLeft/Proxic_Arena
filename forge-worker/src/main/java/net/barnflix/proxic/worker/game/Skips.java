package net.barnflix.proxic.worker.game;

import forge.game.card.Card;
import forge.game.replacement.ReplacementEffect;
import forge.game.replacement.ReplacementType;

/**
 * Spec 0102, item 3 (owner, missed Q8 A, Decided 2) -- what a skip effect
 * skips, read from the effect card Forge made for it.
 *
 * Forge fires no event when a turn or a step is skipped: SkipTurnEffect and
 * SkipPhaseEffect each put an effect card into the skipping player's command
 * zone carrying a replacement of mode BeginTurn ("Skip your next turn") or
 * BeginPhase ("Phase$ BeginCombat"), applied later by PhaseHandler. So the
 * skip is told as that card arrives, while its effect resolves -- whose it
 * is (the card's owner, Forge's createEffect) and what it skips (the
 * replacement's own parameters), never the card's text.
 */
final class Skips {

    private Skips() {
    }

    /** A skip: [step] the step or phase in the reader's words, or null for [turns] whole turns. */
    record Skip(String step, int turns) {}

    /** What [effect] skips, or null when it is not a skip effect. */
    static Skip of(Card effect) {
        if (effect == null) {
            return null;
        }
        for (ReplacementEffect re : effect.getReplacementEffects()) {
            if (re.getMode() == ReplacementType.BeginTurn) {
                return new Skip(null, turns(effect.getSVar("NumTurns")));
            }
            if (re.getMode() == ReplacementType.BeginPhase && re.hasParam("Phase")) {
                return new Skip(stepWords(re.getParam("Phase")), 0);
            }
        }
        return null;
    }

    /** "Number$2" (SkipTurnEffect's own SVar) -> 2; anything else -> 1. */
    static int turns(String svar) {
        if (svar != null && svar.startsWith("Number$")) {
            try {
                return Math.max(1, Integer.parseInt(svar.substring("Number$".length()).trim()));
            } catch (NumberFormatException e) {
                return 1;
            }
        }
        return 1;
    }

    /** Forge's phase name (PhaseType's) in the player's words: "BeginCombat" -> "combat". */
    static String stepWords(String phase) {
        String p = phase.replace(" ", "").toLowerCase(java.util.Locale.ROOT);
        return switch (p) {
            case "untap" -> "untap step";
            case "upkeep" -> "upkeep";
            case "draw" -> "draw step";
            case "main", "main1", "main2" -> "main phase";
            case "begincombat", "combat", "combat_begin" -> "combat";
            case "endofturn", "end", "endturn" -> "end step";
            case "cleanup" -> "cleanup step";
            // Spec 0113 (W1-156) -- never Forge's PhaseType text ("combat_declare_attackers").
            case "combat_declare_attackers", "declareattackers" -> "declare attackers step";
            case "combat_declare_blockers", "declareblockers" -> "declare blockers step";
            case "combat_first_strike_damage", "combat_damage", "combatdamage" -> "combat damage step";
            case "combat_end", "endcombat" -> "end of combat step";
            default -> p.replaceAll("^combat_", "").replace('_', ' ') + " step";
        };
    }
}
