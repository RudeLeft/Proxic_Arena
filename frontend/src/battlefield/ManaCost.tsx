// Mana costs as mana symbols (owner 2026-10-21).
//
// A cost arrives in Forge's notation ("{1}{R}", "{X}{W}{W}", "{W/U}",
// "{2/W}", "{R/P}"). On a card it is drawn as the symbols in the name bar,
// as a printed card shows it -- and it is the cost the cast would
// actually take right now when Forge has said so (a reduction or a tax), the
// printed cost otherwise. The symbol pictures are the Proxic Deck Builder's
// (assets/mana), copied, not drawn here.

import type { CSSProperties, ReactNode } from "react";

const PICTURES = import.meta.glob<string>("../assets/mana/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

/** One mana symbol's picture ("W", "2G"); undefined when there is none. */
export function symbolUrl(symbol: string): string | undefined {
  return PICTURES[`../assets/mana/sym_${symbol}.png`];
}

/** The symbols of a cost, in order, as the picture names spell them ("1", "R", "WU", "2W", "RP"). */
export function manaSymbols(cost: string | null | undefined): string[] {
  if (!cost) return [];
  const out: string[] = [];
  for (const match of cost.matchAll(/\{([^}]+)\}/g)) {
    out.push(match[1]!.toUpperCase().replace(/\//g, ""));
  }
  return out;
}

/** A cost's mana value: numbers count as themselves, X as nothing, every other symbol as one ({2/W} as two). */
export function manaValue(cost: string | null | undefined): number {
  let total = 0;
  for (const symbol of manaSymbols(cost)) {
    if (/^\d+$/.test(symbol)) total += Number(symbol);
    else if (/^2[WUBRG]$/.test(symbol)) total += 2;
    else if (!/^[XYZ]$/.test(symbol)) total += 1;
  }
  return total;
}

/** Whether the cost now is lower, higher or the same as the printed one. */
export function costChange(
  now: string | null | undefined,
  printed: string | null | undefined,
): "down" | "up" | null {
  if (!now || !printed || now === printed) return null;
  const a = manaValue(now);
  const b = manaValue(printed);
  return a < b ? "down" : a > b ? "up" : null;
}

export function ManaCost({
  cost,
  change = null,
  style,
}: {
  cost: string;
  /** Lower or higher than printed, right now: the symbols carry a green or red edge. */
  change?: "down" | "up" | null;
  style?: CSSProperties;
}) {
  const symbols = manaSymbols(cost);
  if (symbols.length === 0) return null;
  const words =
    change === "down" ? `, less than printed` : change === "up" ? `, more than printed` : "";
  return (
    <span
      className={`bf-cost${change ? ` bf-cost-${change}` : ""}`}
      role="img"
      aria-label={`Costs ${cost}${words}`}
      style={style}
    >
      {symbols.map((symbol, i) => {
        const url = symbolUrl(symbol);
        return url ? (
          <img key={i} className="bf-pip" src={url} alt="" draggable={false} />
        ) : (
          // A symbol without a picture (a rare hybrid Phyrexian): its letters.
          <span key={i} className="bf-pip bf-pip-text">
            {symbol}
          </span>
        );
      })}
    </span>
  );
}

/** Card text with every cost in it ("Spectacle {R}") drawn as symbols. */
export function withSymbols(text: string): ReactNode[] {
  return text
    .split(/((?:\{[^}]+\})+)/)
    .map((part, i) => (part.startsWith("{") ? <ManaCost key={i} cost={part} /> : part));
}
