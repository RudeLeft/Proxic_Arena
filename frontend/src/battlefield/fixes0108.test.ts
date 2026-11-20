// Spec 0108, item 12 -- the worker strips Forge's "(Targeting: ...)" note
// (PlainWords#stackText), so no stack description the page's tests feed it
// carries one: a fixture that still did would keep a page test passing on a
// clause the page never sees. (Its own file: a test file's raw import of
// itself is empty, so triggers.test.ts could not check its own fixtures.)

import { describe, expect, it } from "vitest";
describe("no Forge targeting note in a page fixture (spec 0108, item 12)", () => {
  it("no stack description the tests feed the page carries one", () => {
    const sources = import.meta.glob<string>("../**/*.{ts,tsx}", {
      query: "?raw",
      import: "default",
      eager: true,
    });
    // A stack description, or any string a fixture builds one from.
    const carrying = Object.entries(sources).filter(
      ([, text]) =>
        /description:\s*[`"'][^`"'\n]*(Targeting:|\[\[)/.test(text) ||
        /[`"'][^`"'\n]*\(Targeting: ?\[\[/.test(text),
    );
    expect(Object.keys(sources).length).toBeGreaterThan(100);
    expect(carrying.map(([file]) => file)).toEqual([]);
  });
});
