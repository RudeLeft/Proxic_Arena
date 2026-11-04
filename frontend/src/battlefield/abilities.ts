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
  for (const dash of [" · ", " — ", " - "]) {
    if (rest.startsWith(name + dash)) {
      rest = rest.slice(name.length + dash.length).trim();
      break;
    }
  }
  // " · " since Amendment 13 (item 11); " — " from an older worker.
  const segments = rest.split(/ [·—] /);
  // Amendment 13 (item 4) -- "no cost — Play land": nothing to pay.
  if (segments.length > 1 && /^no cost$/i.test(segments[0]!.trim())) {
    return { cost: null, kind: null, text: plainLand(segments.slice(1).join(" — ").trim()) };
  }
  if (segments.length > 1 && looksLikeCost(segments[0]!.trim())) {
    const cost = segments[0]!.trim();
    return { cost, kind: costKind(cost), text: segments.slice(1).join(" — ").trim() };
  }
  // Amendment 13 (item 4) -- mana and an action ("{R}, Discard Forgotten Cave
  // — Cycling ({R}, Discard this card: Draw a card.)"): the mana is the cost;
  // the words say the action and what it does, without the bracketed reminder.
  const mixed =
    segments.length > 1 ? /^((?:\{[^}]+\}\s*)+),\s*(.+)$/.exec(segments[0]!.trim()) : null;
  if (mixed) {
    const cost = mixed[1]!.trim();
    const action = mixed[2]!.replaceAll(name, "this card").trim();
    const words = segments.slice(1).join(" — ").trim();
    const keyword = /^([^(]+?)\s*\((.*)\)\s*$/.exec(words);
    if (keyword) {
      const reminder = keyword[2]!;
      const effect = reminder.includes(":") ? reminder.slice(reminder.indexOf(":") + 1).trim() : "";
      const does = effect ? `: ${effect.charAt(0).toLowerCase()}${effect.slice(1)}` : "";
      return { cost, kind: "mana", text: `${keyword[1]!.trim()} · ${action}${does}` };
    }
    return { cost, kind: "mana", text: `${action}: ${words}` };
  }
  const colon = /^([^:]{1,40}):\s+([\s\S]+)$/.exec(rest);
  if (colon && looksLikeCost(colon[1]!.trim())) {
    const cost = colon[1]!.trim();
    return { cost, kind: costKind(cost), text: colon[2]!.trim() };
  }
  return { cost: null, kind: null, text: plainLand(rest) };
}

/** "Play land" said as the menu says it: "Play this land". */
function plainLand(text: string): string {
  return /^play land$/i.test(text) ? "Play this land" : text;
}
