// What a click means, given the question Forge is asking — PHASE_07
// §7.24-§7.33.
//
// Pure, so the rules can be tested without a board:
//
// - Every gesture ends in a server-issued actionId (§7.24). Nothing here
//   makes one up, reads a label to decide what it does, or decides what
//   is legal: the options ARE the legal answers, and each says which
//   object it is about (§7.61 B5).
// - On your move (AMENDMENT 12, owner 2026-10-21): a card with exactly
//   ONE thing it can do does it on the click -- play the land, tap it for
//   mana, cast the spell. With several, they are offered (§7.28). A click
//   never ATTACKS: attacking is Forge's declare-attackers question, a
//   context of its own (§7.26, §6.52).
// - A card nothing is asked about is just selected (§7.25).
// - Inside one (choose a target, an attacker, a card to discard...), the
//   context defines the click (§7.27): a highlighted object with exactly
//   one answer is that answer; with several, they are offered (§7.29).
// - Options about nothing on the board (a mode, a colour, a card in a
//   library) are listed, so every answer stays reachable (§7.29, §7.33).

import type { Decision, DecisionOption } from "../match";

/** Forge's main question: what to do with priority. */
export const PRIORITY_KIND = "chooseSpellAbilityToPlay";

export interface Question {
  /** "priority" — clicks select; "choose" — the context defines the click. */
  context: "priority" | "choose";
  /** Options about an object the board can show, by that object's id. */
  onBoard: Map<string, DecisionOption[]>;
  /** Everything else, listed so it stays reachable. */
  listed: DecisionOption[];
  /** Whether "no" / pass is an answer (§6.x: some questions have none). */
  canPass: boolean;
}

/**
 * Sort a question's options into the ones the board answers by
 * clicking and the ones a list answers. [visible] is every object id
 * the board is drawing (permanents, hand, stack entries, players as
 * "player:SEAT").
 */
export function questionOf(decision: Decision, visible: ReadonlySet<string>): Question {
  const context = decision.kind === PRIORITY_KIND ? "priority" : "choose";
  const onBoard = new Map<string, DecisionOption[]>();
  for (const option of decision.options) {
    if (option.objectId && visible.has(option.objectId)) {
      onBoard.set(option.objectId, [...(onBoard.get(option.objectId) ?? []), option]);
    }
  }
  // Listed: what the board cannot show, and -- inside a context -- what
  // it cannot tell apart: two modes of one spell are one card on the
  // board, so they are listed too (the card still offers them).
  const listed = decision.options.filter((option) => {
    const mine = option.objectId ? onBoard.get(option.objectId) : undefined;
    return !mine || (context === "choose" && mine.length > 1);
  });
  return {
    context,
    onBoard,
    listed,
    canPass: !decision.mandatory,
  };
}

/** What clicking one object does now. */
export type ClickResult =
  /** Send this answer. */
  | { kind: "answer"; actionId: string }
  /** Show these answers for the object, and let the player pick (§7.28). */
  | { kind: "offer"; objectId: string; options: DecisionOption[] }
  /** Just select it: inspect, no answer (§7.25). */
  | { kind: "select"; objectId: string };

export function clickOn(question: Question | null, objectId: string): ClickResult {
  const options = question?.onBoard.get(objectId) ?? [];
  if (!question || options.length === 0) return { kind: "select", objectId };
  // Spec 0042 (owner 2026-10-30): a click on a creature that is attacking
  // or blocking takes it back -- even when it could also block another.
  const back = options.find((o) => /^un(attack|block):/.test(o.actionId));
  if (back) return { kind: "answer", actionId: back.actionId };
  // AMENDMENT 12 (on your move) and §7.27 (inside Forge's context): the
  // click IS the choice when there is only one thing it could mean.
  if (options.length === 1) return { kind: "answer", actionId: options[0]!.actionId };
  return { kind: "offer", objectId, options };
}
