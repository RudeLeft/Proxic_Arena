// PHASE_11 P11-E6 -- the mana symbols' pictures are built as files of their
// own, never inlined as text into the board's code (they were 145 KB of
// base64 in it). The build's rule, read from the build's own config.

import { describe, expect, it } from "vitest";
import config from "../../vite.config";
import { isManaPicture } from "../../src/earlyPages";

const inline = config.build?.assetsInlineLimit;

describe("P11-E6: mana pictures are files", () => {
  it("names a mana picture by its source path, either slash", () => {
    expect(isManaPicture("C:/x/frontend/src/assets/mana/sym_U.png")).toBe(true);
    expect(isManaPicture("C:\\x\\frontend\\src\\assets\\mana\\sym_2W.png")).toBe(true);
    expect(isManaPicture("/app/frontend/src/assets/mana/sym_T.png")).toBe(true);
    expect(isManaPicture("/app/frontend/src/assets/logo-header.webp")).toBe(false);
    expect(isManaPicture("/app/frontend/src/assets/mana/sym_U.svg")).toBe(false);
    expect(isManaPicture("/app/frontend/src/assets/avatars/mana/x.png")).toBe(false);
  });

  it("the build never inlines one, and keeps its own rule for everything else", () => {
    expect(typeof inline).toBe("function");
    const rule = inline as (file: string, content: Buffer) => boolean | undefined;
    // A small one (U is 3.3 KB, under Vite's 4 KB) is a file too.
    expect(rule("/app/frontend/src/assets/mana/sym_U.png", Buffer.alloc(3341))).toBe(false);
    expect(rule("/app/frontend/src/assets/mana/sym_W.png", Buffer.alloc(5265))).toBe(false);
    expect(rule("/app/frontend/src/assets/other.png", Buffer.alloc(100))).toBeUndefined();
  });
});
