// Phase 9 W-14 (owner 2026-11-03, Amendment 11) -- select several, then
// point: your creatures are selected on the page, and one click on what
// they attack or block sends them all there.
//
// Pure, so the rules can be tested without a board. The game still asks
// one creature at a time ("attacker:card:N", then "What does X attack?");
// the page answers those questions from the plan, each checked by the
// game, and stops at the first one it does not offer. Nothing here
// decides what is legal: an option the game does not offer is never sent.

import type { Decision, DecisionOption, Snapshot } from "../match";

/** The two declarations a selection belongs to. */
export const DECLARE_KINDS = new Set(["declareAttackers", "declareBlockers"]);
/** The game's follow-up question for one creature: what it attacks or blocks. */
const FOLLOW_UP: Record<string, string> = {
  declareAttackers: "chooseDefender",
  declareBlockers: "chooseBlockTarget",
};
/** Forge's "every creature still offered" (CombatChoices.ALL_ATTACK). */
export const ALL_ATTACK = "attackers:all";

/** One creature and where it goes. */
export interface CombatStep {
  creature: string;
  target: string;
  /** Its "attacker:" / "blocker:" answer went; the follow-up is next. */
  sent: boolean;
}

export interface CombatPlan {
  kind: string;
  steps: CombatStep[];
  /** Sent as "All attack": every follow-up gets the one target. */
  all: string | null;
}

/** The option that adds this card to the attack or the block. */
export function joinOption(decision: Decision, id: string): DecisionOption | undefined {
  return decision.options.find(
    (o) =>
      o.objectId === id &&
      (o.actionId.startsWith("attacker:") || o.actionId.startsWith("blocker:")),
  );
}

/** Every card the declaration offers to add, in the game's order. */
export function joinable(decision: Decision): string[] {
  return decision.options
    .filter(
      (o) =>
        o.objectId && (o.actionId.startsWith("attacker:") || o.actionId.startsWith("blocker:")),
    )
    .map((o) => o.objectId!);
}

/**
 * A click on your creature, or a pile of them: each click on a pile
 * selects one more; once all of it is selected, the next click unselects
 * it. Null: nothing here can join (a declared creature, a land) -- the
 * click means what it always meant.
 */
export function toggleSelected(
  decision: Decision,
  members: readonly string[],
  selected: readonly string[],
): string[] | null {
  const can = members.filter((id) => joinOption(decision, id));
  if (can.length === 0) return null;
  const next = can.find((id) => !selected.includes(id));
  if (next) return [...selected, next];
  return selected.filter((id) => !can.includes(id));
}

/**
 * What the selection can be pointed at: the other players and their
 * planeswalkers and battles when attacking; their attackers when blocking.
 * The game still decides which one each creature may take.
 */
export function combatTargets(kind: string, board: Snapshot): Set<string> {
  const out = new Set<string>();
  if (kind === "declareAttackers") {
    for (const p of board.players) if (p.seat !== board.seat) out.add(`player:${p.seat}`);
    for (const c of board.battlefield) {
      if (c.seat !== board.seat && /\b(Planeswalker|Battle)\b/.test(c.types)) out.add(c.id);
    }
  } else if (kind === "declareBlockers") {
    for (const c of board.battlefield) if (c.seat !== board.seat && c.attacking) out.add(c.id);
  }
  return out;
}

/**
 * The selection pointed at a target. A pile of attackers takes one blocker
 * on each, in turn; anything else takes them all. "All attack" is used
 * when every creature the game offers goes to the same place.
 */
export function planFor(
  decision: Decision,
  selected: readonly string[],
  targets: readonly string[],
): CombatPlan {
  const steps = selected.map((creature, i) => ({
    creature,
    target: targets[i % targets.length]!,
    sent: false,
  }));
  const offered = joinable(decision);
  const everyone =
    decision.kind === "declareAttackers" &&
    targets.length === 1 &&
    offered.length >= 2 &&
    offered.every((id) => selected.includes(id)) &&
    decision.options.some((o) => o.actionId === ALL_ATTACK);
  return { kind: decision.kind, steps, all: everyone ? targets[0]! : null };
}

export interface PlanMove {
  /** What to answer now; null: nothing (the plan is over, or stopped). */
  answer: string | null;
  plan: CombatPlan | null;
  /** The plan stopped at a creature the game refused: these stay selected. */
  left: string[];
  /** Why, when the game said. */
  why: string | null;
}

/** The plan's answer to the question now on screen. */
export function planAnswer(decision: Decision, plan: CombatPlan): PlanMove {
  const done = { answer: null, plan: null, left: [], why: null };
  const stop = (steps: CombatStep[], why: string | null): PlanMove => ({
    answer: null,
    plan: null,
    left: steps.map((s) => s.creature),
    why,
  });
  if (decision.kind === plan.kind) {
    if (plan.all !== null) {
      // Sent already: back here means every follow-up was answered.
      if (plan.steps.every((s) => s.sent)) return done;
      const all = decision.options.find((o) => o.actionId === ALL_ATTACK);
      if (!all) return planAnswer(decision, { ...plan, all: null });
      return {
        answer: all.actionId,
        plan: { ...plan, steps: plan.steps.map((s) => ({ ...s, sent: true })) },
        left: [],
        why: null,
      };
    }
    // Asked to declare again after a creature went: the game chose its
    // only target itself, and that one is done.
    const steps = plan.steps[0]?.sent ? plan.steps.slice(1) : plan.steps;
    const next = steps[0];
    if (!next) return done;
    const option = joinOption(decision, next.creature);
    if (!option) return stop(steps, decision.unavailable[next.creature] ?? null);
    return {
      answer: option.actionId,
      plan: { ...plan, steps: [{ ...next, sent: true }, ...steps.slice(1)] },
      left: [],
      why: null,
    };
  }
  if (decision.kind === FOLLOW_UP[plan.kind]) {
    const current = plan.steps[0];
    const target = plan.all ?? current?.target;
    const option = target ? decision.options.find((o) => o.objectId === target) : undefined;
    // Not offered: the player answers this one; the rest stay selected.
    if (!option) return stop(plan.steps.slice(1), null);
    return {
      answer: option.actionId,
      plan: plan.all !== null ? plan : { ...plan, steps: plan.steps.slice(1) },
      left: [],
      why: null,
    };
  }
  // Any other question ends it.
  return done;
}
