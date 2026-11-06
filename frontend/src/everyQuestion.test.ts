// Phase 9 Amendment 20 -- the audit, kept: every question the game can put
// to a player (the Phase 8 record, forge-worker's forge-questions.tsv, the
// one list of them) has its own window title and its own help line or
// none: never the "Your move" fallback title, never the filler that a kind
// the page has never seen gets ("Choose one of these.", §7.33). A new
// question added to the record without words fails here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { headingFor, hintFor } from "./matchText";

const RECORD = join(
  __dirname,
  "..",
  "..",
  "forge-worker",
  "src",
  "test",
  "resources",
  "forge-questions.tsv",
);

/** The kinds the record says Proxic ASKS a player. */
function askedKinds(): string[] {
  const kinds = new Set<string>();
  for (const line of readFileSync(RECORD, "utf-8").split(/\r?\n/)) {
    if (line.startsWith("#")) continue;
    const cells = line.split("\t");
    if (cells[1] !== "ASKS" || !cells[2]) continue;
    for (const kind of cells[2].split(",")) kinds.add(kind.trim());
  }
  return [...kinds].sort();
}

// The "your move" question is the act button, not a window.
const NOT_A_WINDOW = new Set(["chooseSpellAbilityToPlay"]);
const UNSEEN = "aKindThisPageHasNeverSeen";

describe("every question the game asks (Phase 9 Amendment 20)", () => {
  const kinds = askedKinds();

  it("reads the record: dozens of kinds", () => {
    expect(kinds.length).toBeGreaterThan(80);
  });

  it.each(kinds.filter((k) => !NOT_A_WINDOW.has(k)))("%s has its own title", (kind) => {
    expect(headingFor(kind)).not.toBe(headingFor(UNSEEN));
    expect(headingFor(kind)).not.toBe("Your move");
  });

  it.each(kinds)("%s never shows the unknown-kind filler", (kind) => {
    expect(hintFor(kind, 2)).not.toBe(hintFor(UNSEEN, 2));
    expect(hintFor(kind, 2)).not.toMatch(/These are the actions you can take/);
  });
});
