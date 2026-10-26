// @vitest-environment jsdom

// Spec 0015 — a close-up never shows half-painted, and is fetched once.

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Pictures the page asked for, in order; each arrives when the test says. */
let loads: { src: string; arrive: () => void; fail: () => void }[] = [];

class FakeImage {
  decoding = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode = () => Promise.resolve();
  set src(url: string) {
    loads.push({ src: url, arrive: () => this.onload?.(), fail: () => this.onerror?.() });
  }
}

beforeEach(() => {
  loads = [];
  vi.stubGlobal("Image", FakeImage);
  vi.resetModules();
});
afterEach(() => vi.unstubAllGlobals());

const settle = () => act(async () => {});

describe("SharpCard", () => {
  it("shows the table copy until the close-up is whole, then the close-up", async () => {
    const { SharpCard } = await import("./closeUp");
    render(<SharpCard low="/a" high="/a?size=full" alt="Card" />);
    expect(screen.getByAltText("Card").getAttribute("src")).toBe("/a");

    loads.find((load) => load.src === "/a?size=full")!.arrive();
    await settle();
    expect(screen.getByAltText("Card").getAttribute("src")).toBe("/a?size=full");
  });

  it("keeps the table copy when the close-up will not load", async () => {
    const { SharpCard } = await import("./closeUp");
    render(<SharpCard low="/b" high="/b?size=full" alt="Card" />);
    loads[0]!.fail();
    await settle();
    expect(screen.getByAltText("Card").getAttribute("src")).toBe("/b");
  });

  it("is sharp from the first frame when it was fetched ahead", async () => {
    const { SharpCard, fetchAhead } = await import("./closeUp");
    fetchAhead(["/c?size=full"]);
    loads[0]!.arrive();
    await settle();
    render(<SharpCard low="/c" high="/c?size=full" alt="Card" />);
    expect(screen.getByAltText("Card").getAttribute("src")).toBe("/c?size=full");
    expect(loads).toHaveLength(1);
  });
});

describe("fetchAhead", () => {
  it("fetches each picture once, two at a time", async () => {
    const { fetchAhead } = await import("./closeUp");
    fetchAhead(["/1", "/2", "/3", "/1"]);
    fetchAhead(["/2", "/4"]);
    expect(loads.map((load) => load.src)).toEqual(["/1", "/2"]);

    loads[0]!.arrive();
    await settle();
    expect(loads.map((load) => load.src)).toEqual(["/1", "/2", "/3"]);
    loads[1]!.fail();
    await settle();
    expect(loads.map((load) => load.src)).toEqual(["/1", "/2", "/3", "/4"]);
  });
});
