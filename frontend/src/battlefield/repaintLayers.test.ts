// P11-C5 -- the effects overlay keeps a layer of its own, so a card starting
// to glide or fly does not make the browser draw the whole window again
// (measured: tools/measure/repaint.spec.ts, PHASE_11 "As built: P11-C5").
// The layer must change nothing that is seen: the overlay already stacks on
// its own (a z-index), so `will-change` adds no new stacking, and it holds no
// fixed-position part a new containing block would move.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Z_EFFECTS } from "./effects";

const css = readFileSync(join(process.cwd(), "src", "battlefield", "battlefield.css"), "utf-8");
const board = readFileSync(join(process.cwd(), "src", "battlefield", "Board.tsx"), "utf-8");

/** The declarations of the first rule whose selector is exactly [selector]. */
function rule(selector: string): string {
  const at = css.search(new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{`));
  expect(at, `${selector} is in battlefield.css`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("the effects overlay's own layer (P11-C5)", () => {
  it("is asked for: will-change: transform on .bf-effects", () => {
    expect(rule(".bf-effects")).toMatch(/(^|\n)\s*will-change:\s*transform;/);
  });

  it("adds no stacking: the overlay is positioned and has its z-index on the board", () => {
    expect(rule(".bf-effects")).toMatch(/position:\s*absolute;/);
    expect(Z_EFFECTS).toBeGreaterThan(0);
    expect(board).toMatch(/className="bf-effects" style=\{\{ zIndex: Z_EFFECTS \}\}/);
  });
});
