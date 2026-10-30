// Spec 0041 — every box says whether it's right, and the button what's missing.

import { describe, expect, it } from "vitest";
import { fitScale } from "./FitName";
import {
  againOk,
  displayNameMissing,
  displayNameOk,
  passwordMissing,
  passwordOk,
  passwordRule,
  usernameOk,
} from "./fieldChecks";

describe("the password checks", () => {
  it("are the server's rule: 12 characters, not only spaces", () => {
    expect(passwordOk("eleven chars")).toBe(true);
    expect(passwordOk("short pass")).toBe(false);
    expect(passwordOk(" ".repeat(12))).toBe(false);
  });

  it("count down what's left", () => {
    expect(passwordRule("")).toBe("At least 12 characters");
    expect(passwordRule("short pass")).toBe("At least 12 characters · 2 more");
    expect(passwordRule("a long enough password")).toBe("At least 12 characters");
  });

  it("say exactly what is still missing, and nothing once it's right", () => {
    expect(passwordMissing("", "")).toEqual([
      "a password of at least 12 characters",
      "the password again",
    ]);
    expect(passwordMissing("short pass", "")).toEqual([
      "2 more password characters",
      "the password again",
    ]);
    expect(passwordMissing("a long enough password", "a long enough")).toEqual([
      "the second password to match the first",
    ]);
    expect(passwordMissing("a long enough password", "a long enough password")).toEqual([]);
    expect(againOk("a long enough password", "a long enough password")).toBe(true);
  });
});

describe("the display name", () => {
  it("is required and at most 12 characters", () => {
    expect(displayNameOk("")).toBe(false);
    expect(displayNameOk("   ")).toBe(false);
    expect(displayNameOk("Penelope Mar")).toBe(true);
    expect(displayNameOk("Penelope Marc")).toBe(false);
    expect(displayNameMissing("")).toEqual(["a display name"]);
    expect(displayNameMissing("Penelope Marchbanks")).toEqual([
      "a shorter display name (7 too many characters)",
    ]);
  });

  it("the username keeps the server's shape", () => {
    expect(usernameOk("newplayer")).toBe(true);
    expect(usernameOk("ab")).toBe(false);
    expect(usernameOk("new player")).toBe(false);
  });
});

describe("a name too wide for its place", () => {
  it("gets smaller in steps until it fits, never below 60%", () => {
    expect(fitScale(() => true)).toBe(1);
    expect(fitScale((scale) => scale <= 0.8)).toBe(0.8);
    expect(fitScale(() => false)).toBe(0.6);
  });
});
