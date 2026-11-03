// Phase 9 W-16 -- an ability's line, split for the menu: its cost first,
// large (a loyalty +1 or -3, or mana), then what it does. The game's own
// words are only split, never changed; a line with no cost stays whole.

export type CostKind = "up" | "down" | "loyalty" | "mana";

const LOYALTY = /^[+−-]?(\d+|X)$/;

/** Something a cost can be: a loyalty change, or mana and tap symbols. */
function looksLikeCost(text: string): boolean {
  return LOYALTY.test(text) || /^(\{[^}]+\}\s*,?\s*)+$/.test(text);
}

export function costKind(cost: string): CostKind {
  if (!LOYALTY.test(cost)) return "mana";
  if (cost.startsWith("+")) return "up";
  if (cost.startsWith("-") || cost.startsWith("−")) return "down";
  return "loyalty";
}

/**
 * "Elspeth Resplendent — +1: Choose up to one…" → cost "+1", the words;
 * "Fiery Temper — {1}{R}{R} — Fiery Temper deals 3…" → "{1}{R}{R}", the words.
 */
export function abilityParts(
  label: string,
  name: string,
): { cost: string | null; kind: CostKind | null; text: string } {
  let rest = label.trim();
  for (const dash of [" — ", " - "]) {
    if (rest.startsWith(name + dash)) {
      rest = rest.slice(name.length + dash.length).trim();
      break;
    }
  }
  const segments = rest.split(" — ");
  if (segments.length > 1 && looksLikeCost(segments[0]!.trim())) {
    const cost = segments[0]!.trim();
    return { cost, kind: costKind(cost), text: segments.slice(1).join(" — ").trim() };
  }
  const colon = /^([^:]{1,40}):\s+([\s\S]+)$/.exec(rest);
  if (colon && looksLikeCost(colon[1]!.trim())) {
    const cost = colon[1]!.trim();
    return { cost, kind: costKind(cost), text: colon[2]!.trim() };
  }
  return { cost: null, kind: null, text: rest };
}
