// PHASE_09 group 3 (W-07..W-10, owner 2026-11-01) -- the answers a tray
// gives for the player's one set of clicks.
//
// The game asks some of these one card at a time: "which do you want to
// draw first?", then "next?"; scry's "which go to the bottom?" one pick
// at a time, then "which goes on top?"; Fact or Fiction's pile 1 one card
// at a time. The tray asks once, with every card in view, and the page
// answers the game's questions from what the player clicked -- each step
// only if the game asks exactly what it expects, never a guess (PHASE_09
// W-06's rule: nothing is answered without the player's click).

import type { Decision, Snapshot, SnapshotCard } from "../match";

/** One answer to a question still to come. */
export type PlanStep =
  /** The option about this card ("card:N"). */
  | { kind: string; card: string }
  /** No more ("Done"): a pass, where the game allows one. */
  | { kind: string; pass: true }
  /** A yes or a no -- Ponder's "Do you want to shuffle the library?". */
  | { kind: string; yes: boolean }
  /** An option by its id -- the defending player, for trample (item 5). */
  | { kind: string; action: string }
  /** W-11 -- the option worth this number (arrange's values, in the options' order). */
  | { kind: string; value: number };

/**
 * The answer `step` gives `decision`: an action id, null for a pass, or
 * undefined when the game asked something the step does not fit -- the
 * plan then stops and the player answers it themselves.
 */
export function stepAnswer(step: PlanStep, decision: Decision): string | null | undefined {
  if (step.kind !== decision.kind) return undefined;
  if ("card" in step) {
    return decision.options.find((o) => o.objectId === step.card)?.actionId ?? undefined;
  }
  if ("pass" in step) return decision.mandatory ? undefined : null;
  if ("action" in step) {
    return decision.options.some((o) => o.actionId === step.action) ? step.action : undefined;
  }
  if ("value" in step) {
    const values = decision.arrange?.divide?.values ?? decision.arrange?.number?.values ?? [];
    const at = values.indexOf(step.value);
    return at >= 0 ? (decision.options[at]?.actionId ?? undefined) : undefined;
  }
  const word = step.yes ? /^yes\b/i : /^no\b/i;
  return decision.options.find((o) => word.test(o.label ?? ""))?.actionId ?? undefined;
}

/**
 * W-07 -- an order the player numbered, as the game's questions: one per
 * card but the last, which the game places itself.
 */
export function orderSteps(kind: string, numbered: readonly string[]): PlanStep[] {
  return numbered.slice(0, -1).map((card) => ({ kind, card }));
}

/**
 * W-08 -- scry or surveil's two rows: first the cards sent away (bottom,
 * or graveyard), one pick each, then "that's all" unless every card went;
 * then the top row in draw order, one pick per card but the last.
 */
export function rowSteps(
  kind: string,
  open: readonly string[],
  away: readonly string[],
  top: readonly string[],
): PlanStep[] {
  const steps: PlanStep[] = away.map((card) => ({ kind, card }));
  if (away.length < open.length) steps.push({ kind, pass: true });
  return [...steps, ...orderSteps(kind, top)];
}

/**
 * W-10 -- the split: pile 1's cards picked one at a time, then "that's
 * all" unless every card is in pile 1.
 */
export function splitSteps(
  kind: string,
  open: readonly string[],
  pileOne: readonly string[],
): PlanStep[] {
  const picks: PlanStep[] = open
    .filter((card) => pileOne.includes(card))
    .map((card) => ({ kind, card }));
  return picks.length < open.length ? [...picks, { kind, pass: true }] : picks;
}

/** The kinds a tray asks: the order of cards, and scry's and surveil's rows. */
export const ROW_KINDS = new Set(["arrangeForScry", "arrangeForSurveil", "willPutCardOnTop"]);

/**
 * Which tray, if any, a question is: W-07 order, W-08 rows, W-09 a hidden
 * zone, W-10 the split or the piles. Null: it keeps its own window.
 */
export function trayOf(
  decision: Decision,
): "order" | "rows" | "hidden" | "split" | "piles" | "damage" | "divide" | null {
  const arrange = decision.arrange;
  // W-11: a split, the whole of it in one tray -- from its first share
  // (a share asked again part way keeps its own window).
  if (decision.kind === "divideAsYouChoose" && arrange?.divide?.at === 0) return "divide";
  // Item 5: combat damage among blockers, the whole fight in one tray.
  if (decision.kind === "assignCombatDamage" && arrange?.damage) return "damage";
  if (decision.kind === "chooseCardsPile" && arrange?.piles) return "piles";
  if (arrange?.split) return "split";
  if (decision.looking.length === 0) return null;
  if (decision.kind === "orderMoveToZoneList") return "order";
  if (ROW_KINDS.has(decision.kind)) {
    // The second half of a scry of several: "which goes on top?", asked
    // one card at a time -- the order tray, to the top.
    return decision.mandatory && decision.options.every((o) => o.objectId) ? "order" : "rows";
  }
  if (arrange?.zone) return "hidden";
  return null;
}

/**
 * Who is asking, by name: the game's own word for it, else the spell or
 * ability resolving -- the top of the stack -- never the first card name
 * the question's words happen to contain (a search's words list the
 * library: "Sensei's Divining Top" named an Evolving Wilds, 2026-11-01).
 */
export function askingName(board: Snapshot, decision: Decision): string | null {
  return decision.about?.name ?? board.stack[0]?.name ?? null;
}

/**
 * W-09 -- the game's words for a choice, without what the pictures already
 * show: "Select a card from your library Demonic Tutor - Looking at cards
 * in Island, Swamp, …" reads "Select a card from your library."
 */
export function plainPrompt(prompt: string | null, asking: string | null): string | null {
  if (!prompt) return null;
  let words = prompt
    .replace(/\s*-?\s*(Looking at cards in|You are looking at:)[\s\S]*$/, "")
    .trim();
  if (asking && words.endsWith(` ${asking}`)) words = words.slice(0, -asking.length).trim();
  if (!words) return null;
  return /[.?!)]$/.test(words) ? words : `${words}.`;
}

/** Cards grouped by name, for W-09's "one picture per card, ×4". */
export interface CardGroup {
  card: SnapshotCard;
  /** The copies' ids, each the object of an option. */
  ids: string[];
  /** Why none of them can be chosen; null when they can. */
  why: string | null;
}

const isLand = (card: SnapshotCard) => card.kind === "land" || /\bLand\b/.test(card.types);

/**
 * W-09 -- why a card the player can see is not offered: what the offered
 * cards all are and it is not ("a land" for Thoughtseize). Null when the
 * game's choice is not that plain.
 */
export function notOffered(card: SnapshotCard, offered: readonly SnapshotCard[]): string {
  if (offered.length > 0 && offered.every((c) => !isLand(c)) && isLand(card)) return "a land";
  if (
    offered.length > 0 &&
    offered.every((c) => !/\bCreature\b/.test(c.types)) &&
    /\bCreature\b/.test(card.types)
  )
    return "a creature";
  return "can't be chosen";
}

/**
 * W-09 -- the cards as groups: one per name (×N), spells before lands,
 * then by name; cards not offered after, dimmed with why.
 */
export function cardGroups(
  offered: readonly SnapshotCard[],
  shownOnly: readonly SnapshotCard[] = [],
): CardGroup[] {
  const byName = new Map<string, CardGroup>();
  for (const card of offered) {
    const group = byName.get(card.name);
    if (group) group.ids.push(card.id);
    else byName.set(card.name, { card, ids: [card.id], why: null });
  }
  const sorted = [...byName.values()].sort(
    (a, b) =>
      Number(isLand(a.card)) - Number(isLand(b.card)) || a.card.name.localeCompare(b.card.name),
  );
  const others = shownOnly.map((card) => ({ card, ids: [], why: notOffered(card, offered) }));
  return [...sorted, ...others];
}

/** "Top card", "2nd from the top", … -- where a numbered card ends up. */
export function placeWords(index: number, to: string | null, first: string | null): string {
  const nth = (n: number) =>
    `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
  if (to === "top") return index === 0 ? "Top card" : `${nth(index + 1)} from the top`;
  if (to === "bottom" && first === "bottom")
    return index === 0 ? "Very bottom" : `${nth(index + 1)} from the bottom`;
  if (to === "bottom") return index === 0 ? "Highest of them" : `${nth(index + 1)} down`;
  return `${nth(index + 1)} in`;
}

/** The defending player, among the damage question's options. */
export const DAMAGE_TO_PLAYER = "damage:defender";

/**
 * Item 5 -- the usual split, to start from: lethal damage to each blocker
 * in the game's order; what is left to the player when it can take it,
 * else to the last blocker.
 */
export function usualSplit(fight: {
  damage: number;
  blockers: readonly { card: string; lethal: number }[];
  trample: boolean;
  divides: boolean;
}): { blockers: number[]; player: number } {
  let left = fight.damage;
  const blockers = fight.blockers.map((b) => {
    const give = Math.min(b.lethal, left);
    left -= give;
    return give;
  });
  if (left > 0 && (fight.trample || fight.divides)) return { blockers, player: left };
  if (left > 0 && blockers.length > 0) blockers[blockers.length - 1]! += left;
  return { blockers, player: 0 };
}

/**
 * Item 5 -- the damage questions, one point each, from the split: every
 * blocker's points first (trample reaches the player only once each has
 * lethal, CR 702.19c), then the player's.
 */
export function damageSteps(
  kind: string,
  blockers: readonly string[],
  split: { blockers: readonly number[]; player: number },
): PlanStep[] {
  const steps: PlanStep[] = [];
  blockers.forEach((card, i) => {
    for (let n = 0; n < (split.blockers[i] ?? 0); n++) steps.push({ kind, card });
  });
  for (let n = 0; n < split.player; n++) steps.push({ kind, action: DAMAGE_TO_PLAYER });
  return steps;
}

/**
 * W-11 (Amendment 14) -- a split to start from: 1 to each target, then
 * enough to kill each creature in the order chosen, the rest to the first
 * player chosen, else to the last target.
 */
export function usualDivide(split: {
  total: number;
  targets: readonly { object: string | null; lethal: number | null }[];
}): number[] {
  const shares = split.targets.map(() => 1);
  let left = split.total - shares.length;
  split.targets.forEach((t, i) => {
    if (t.lethal === null || left <= 0) return;
    const more = Math.min(left, Math.max(0, t.lethal - 1));
    shares[i]! += more;
    left -= more;
  });
  if (left > 0 && shares.length > 0) {
    const player = split.targets.findIndex((t) => t.object?.startsWith("player:"));
    shares[player >= 0 ? player : shares.length - 1]! += left;
  }
  return shares;
}

/**
 * W-11 -- the split as the game's questions: each target but the last is
 * asked its share in order, and only when it has a choice (the game puts
 * the 1 that is all a target can get without asking); the last takes the
 * rest.
 */
export function divideSteps(kind: string, total: number, shares: readonly number[]): PlanStep[] {
  const steps: PlanStep[] = [];
  let left = total;
  shares.slice(0, -1).forEach((share, i) => {
    const most = left - (shares.length - 1 - i);
    if (most > 1) steps.push({ kind, value: share });
    left -= share;
  });
  return steps;
}
