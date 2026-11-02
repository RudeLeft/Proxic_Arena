// @vitest-environment jsdom
// Spec 0050 — the Sounds switch and the tab title's count (F-0050-I).

import { afterEach, describe, expect, it } from "vitest";
import { setSoundsOn, soundsOn } from "./sounds";
import { setTitleCount } from "./tabTitle";

afterEach(() => {
  window.localStorage.clear();
  setTitleCount("chat", 0);
  setTitleCount("questions", 0);
});

describe("sounds", () => {
  it("are on until switched off, and the switch is kept", () => {
    expect(soundsOn()).toBe(true);
    setSoundsOn(false);
    expect(soundsOn()).toBe(false);
    setSoundsOn(true);
    expect(soundsOn()).toBe(true);
  });
});

describe("the tab title", () => {
  it("counts unread chat and waiting questions together", () => {
    setTitleCount("questions", 1);
    expect(document.title).toBe("(1) Proxic Arena");
    setTitleCount("chat", 3);
    expect(document.title).toBe("(4) Proxic Arena");
    setTitleCount("questions", 0);
    setTitleCount("chat", 0);
    expect(document.title).toBe("Proxic Arena");
  });
});
