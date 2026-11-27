// A game spec closes the browser contexts it opens, in a `finally`.
//
// CI run 46043095260: match-game-ahead (the first spec on CI machine 5)
// never closed its two pages. Signed in as the shared test accounts, they
// followed both players into every later game on that machine, a second tab
// of each -- and in match-window the host's countdown, paused by the test on
// the test's own page, ran out on the forgotten tab and passed for the host
// ("still paused after the countdown's 5 s"). A page left open is a player
// left at the table: every game spec that opens a context closes it whatever
// happens, so a failure can't leave one either.

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const e2e = join(dirname(fileURLToPath(import.meta.url)), "..", "e2e");

/** The text of every `finally { ... }` block in [source]. */
export function finallyBlocks(source: string): string {
  let out = "";
  let at = source.indexOf("finally {");
  while (at >= 0) {
    let depth = 0;
    let i = source.indexOf("{", at);
    const start = i;
    for (; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}" && --depth === 0) break;
    }
    out += source.slice(start, i + 1) + "\n";
    at = source.indexOf("finally {", i);
  }
  return out;
}

/** The game specs that open a browser context and do not close it in a `finally`. */
export function leaking(files: { name: string; source: string }[]): string[] {
  return files
    .filter(({ source }) => source.includes("browser.newContext("))
    .filter(({ source }) => !/close\(|cleanUp\(/.test(finallyBlocks(source)))
    .map(({ name }) => name);
}

describe("game specs close what they open", () => {
  it("every match*.spec.ts that opens a browser context closes it in a finally", () => {
    const files = readdirSync(e2e)
      .filter((name) => /^match.*\.spec\.ts$/.test(name))
      .map((name) => ({ name, source: readFileSync(join(e2e, name), "utf8") }));
    expect(files.length).toBeGreaterThan(50);
    expect(leaking(files)).toEqual([]);
  });

  it("the rule sees a spec that only clears its game, and one that closes at the end but not in a finally", () => {
    const open = "const host = await (await browser.newContext()).newPage();\n";
    expect(
      leaking([
        { name: "a", source: `${open}try { x(); } finally { await clearEverything(host); }` },
        { name: "b", source: `${open}x();\nawait host.context().close();` },
        { name: "c", source: `${open}try { x(); } finally { await host.context().close(); }` },
      ]),
    ).toEqual(["a", "b"]);
  });
});
