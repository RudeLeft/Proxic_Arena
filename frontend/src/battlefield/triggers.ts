// Many copies of one trigger, answered once — PHASE_09 W-04, W-05, W-06
// (owner 2026-10-30, "answer once for all the copies").
//
// Seven Goblins die with Boggart Shenanigans out: seven copies of one
// trigger. The worker no longer asks their order (they are copies) and
// tells each target question which copy it is ("2 of 7"). This is what the
// page then answers for the player BECAUSE THE PLAYER SAID SO -- "Same
// target for all 7", "Yes to all 7" -- and the plain words a yes/no
// question is put in. Pure: no React, no socket; the game screen keeps the
// state and sends the answers.

import type { Decision, DecisionOption, StackEntry } from "../match";

/** What the player chose to answer once for a batch of copies. */
export interface Copies {
  /** The card the copies come from, as the question names it. */
  name: string;
  /** "Same target for all": the target's object id ("player:2", "card:N"). */
  target: string | null;
  /** "Yes to all": how many more yes questions to answer for the player. */
  yesLeft: number;
}

/** The yes/no questions (askYesNo in the worker: "Yes — <question>", "No"). */
export const CONFIRM_KINDS = new Set([
  "confirmTrigger",
  "confirmAction",
  "confirmPayment",
  "confirmReplacementEffect",
  "confirmStaticApplication",
]);

/** A target question for one of several copies of a trigger. */
export function isCopyTarget(decision: Decision): boolean {
  return (
    decision.kind === "chooseTargetsFor" &&
    decision.about?.kind === "trigger" &&
    (decision.about.copies ?? 0) > 1
  );
}

/** The yes and the no of a yes/no question, when it is one. */
export function yesNo(decision: Decision): { yes: DecisionOption; no: DecisionOption } | null {
  if (!CONFIRM_KINDS.has(decision.kind)) return null;
  const yes = decision.options.find((o) => (o.label ?? "").startsWith("Yes"));
  const no = decision.options.find((o) => o !== yes);
  return yes && no ? { yes, no } : null;
}

/**
 * A yes/no question as a title in plain words: "Yes — use the triggered
 * ability of Boggart Shenanigans?" becomes "Use Boggart Shenanigans?".
 */
export function confirmTitle(yesLabel: string): string {
  const question = yesLabel.replace(/^Yes\s*[—-]\s*/, "").trim();
  const trigger = /^use the triggered ability of (.+?)\?$/.exec(question);
  if (trigger) return `Use ${trigger[1]}?`;
  return question.charAt(0).toUpperCase() + question.slice(1);
}

/**
 * The words copies share: Forge's description without its cause ("...
 * [Zone Changer: Goblin Token (155)]") and without its card numbers
 * ("Goblin Arsonist (65)"), so copies of one card's trigger, or of other
 * copies of that card, read the same (owner 2026-10-30).
 */
const copyWords = (words: string) =>
  words.replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*\(\d+\)/g, "");

/**
 * How many copies of the trigger now resolving are on the stack, this one
 * included: triggers of the same card (or other copies of it) with the
 * same words and the same targets -- only what caused each is allowed to
 * differ. What "Yes to all N" counts.
 */
export function copiesOnStack(stack: readonly StackEntry[], name: string): number {
  const top = stack.find((s) => s.kind === "trigger" && s.name === name);
  if (!top) return 0;
  const words = copyWords(top.description);
  return stack.filter(
    (s) => s.kind === "trigger" && s.name === top.name && copyWords(s.description) === words,
  ).length;
}

/**
 * The answer the page gives for the player, or null to ask them: the same
 * target again ("Same target for all"), or yes again ("Yes to all"). Only
 * for the same card's copies, and only while the remembered target is
 * still one of the choices -- otherwise the player is asked.
 */
export function autoAnswer(decision: Decision, copies: Copies | null): string | null {
  if (!copies || decision.about?.name !== copies.name) return null;
  if (isCopyTarget(decision) && copies.target !== null && (decision.about.copy ?? 1) > 1) {
    return decision.options.find((o) => o.objectId === copies.target)?.actionId ?? null;
  }
  if (decision.kind === "confirmTrigger" && copies.yesLeft > 0) {
    return yesNo(decision)?.yes.actionId ?? null;
  }
  return null;
}

/** After the page answered for the player: one fewer yes to give. */
export function afterAuto(decision: Decision, copies: Copies): Copies {
  return decision.kind === "confirmTrigger" ? { ...copies, yesLeft: copies.yesLeft - 1 } : copies;
}

/**
 * Whether a question ends what the player chose: a different card's
 * trigger, or a new batch starting (copy 1 of a target question).
 */
export function endsCopies(decision: Decision, copies: Copies | null): boolean {
  if (!copies) return false;
  if (isCopyTarget(decision)) {
    return decision.about?.name !== copies.name || decision.about.copy === 1;
  }
  if (CONFIRM_KINDS.has(decision.kind)) return decision.about?.name !== copies.name;
  return false;
}

/**
 * The ability's own words, from an order question's label: "Blood Artist —
 * Whenever Blood Artist or another creature dies, ... [Zone Changer: X]"
 * becomes "Whenever Blood Artist or another creature dies, ...".
 */
export function abilityWords(label: string, name: string): string {
  let words = label.replace(/\s*\[[^\]]*\]\s*$/, "").trim();
  if (words.startsWith(name)) words = words.slice(name.length).replace(/^\s*—\s*/, "");
  // A cost ("{0} —") before the words.
  words = words.replace(/^\{[^}]*\}(?:\{[^}]*\})*\s*—\s*/, "");
  return words;
}

/** W-05 — one card in the order tray: an ability, and its copies. */
export interface OrderGroup {
  key: string;
  options: DecisionOption[];
}

/**
 * The order question's options as the tray shows them: copies of one
 * ability (the same card's, or other copies of that card's -- the same
 * words without their cause) are one card, "×7",
 * so seven Boggart Shenanigans triggers beside a Goblin Arsonist's are two
 * cards to put in order, not eight.
 */
export function orderGroups(options: readonly DecisionOption[]): OrderGroup[] {
  const groups = new Map<string, OrderGroup>();
  for (const option of options) {
    const key = copyWords(option.label ?? option.actionId);
    const group = groups.get(key) ?? { key, options: [] };
    group.options.push(option);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The order clicked, every copy of a card together, the rest after. */
export function orderOf(
  groups: readonly OrderGroup[],
  picked: readonly string[],
): DecisionOption[] {
  const first = picked.map((key) => groups.find((g) => g.key === key)!);
  const rest = groups.filter((g) => !picked.includes(g.key));
  return [...first, ...rest].flatMap((g) => g.options);
}
