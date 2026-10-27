// Spec 0017 — the type scale is the only way to size text (F-0017-A).
//
// Every `font-size` in the app's stylesheets is one of the scale's
// steps (styles.css), and every typeface is one of the two shared ones.
// The only sizes allowed outside the scale are text drawn ON a card,
// which grows with the card (`--card-h`): it is part of the measured
// board, and spec 0017 leaves it alone.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SHEETS = ["styles.css", "shell/base.css", "shell/app.css", "battlefield/game.css"];
const STEPS = ["xs", "sm", "md", "base", "lg", "xl", "2xl"];

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

/** Every value a declaration of [property] has in [css], with its line. */
function values(css: string, property: string): { line: number; value: string }[] {
  const found: { line: number; value: string }[] = [];
  css.split("\n").forEach((text, index) => {
    const match = new RegExp(`(?:^|[\\s;{])${property}:\\s*([^;]+);`).exec(text);
    if (match) found.push({ line: index + 1, value: match[1]!.trim() });
  });
  return found;
}

const onTheScale = new RegExp(`^var\\(--pa-size-(${STEPS.join("|")})\\)$`);
const onACard = /^calc\(var\(--card-h\) \* [0-9.]+\)$/;

describe("the type scale", () => {
  it("defines every step in rem, so the browser's own text size is followed", () => {
    const root = read("styles.css");
    for (const step of STEPS) {
      expect(root, step).toMatch(new RegExp(`--pa-size-${step}: [0-9.]+rem;`));
    }
    // Nothing under 12px (owner T1): the smallest step is 0.75rem.
    expect(root).toMatch(/--pa-size-xs: 0\.75rem;/);
  });

  for (const sheet of SHEETS) {
    it(`${sheet}: every text size is a step on the scale`, () => {
      const off = values(read(sheet), "font-size").filter(
        ({ value }) => !onTheScale.test(value) && !onACard.test(value),
      );
      expect(off, `sizes off the scale in ${sheet}`).toEqual([]);
      // The `font:` shorthand sizes text too.
      const shorthand = values(read(sheet), "font").filter(
        ({ value }) => value !== "inherit" && !/var\(--pa-size-/.test(value),
      );
      expect(shorthand, `font shorthand off the scale in ${sheet}`).toEqual([]);
    });

    it(`${sheet}: every typeface is one of the shared ones`, () => {
      const typed = values(read(sheet), "font-family").filter(
        ({ value }) => value !== "inherit" && !/^var\(--pa-(display|text|mono)\b/.test(value),
      );
      // Only styles.css itself names the faces, in their variables.
      expect(typed, `hand-typed typeface in ${sheet}`).toEqual([]);
    });
  }
});
