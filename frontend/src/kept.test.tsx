// @vitest-environment jsdom

// PHASE_11 P11-E7 / P11-E8 -- pages keep their data (kept.ts): a revisit
// draws what was kept at once and reads again; one person's data is never
// another's; signing out forgets it, including a read still under way; the
// latest read wins, and an action's re-read can't be overtaken by a read
// that started before it.

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { forgetKept, keptFor, readAhead, supersede, useKept } from "./kept";

/** A read the test answers by hand, in any order. */
function reads<T>() {
  const pending: ((value: T | null) => void)[] = [];
  const read = () => new Promise<T | null>((resolve) => pending.push(resolve));
  return { read, pending };
}

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

beforeEach(() => forgetKept());

describe("kept data (P11-E8)", () => {
  it("a revisit draws what was kept at once, reads again, and the fresh answer replaces it", async () => {
    const r = reads<string>();
    const first = renderHook(() => useKept("u-pat", "hall", r.read));
    expect(first.result.current.value).toBeUndefined();
    r.pending[0]!("Season 1");
    await settle();
    expect(first.result.current.value).toBe("Season 1");
    first.unmount();

    const again = renderHook(() => useKept("u-pat", "hall", r.read));
    // Drawn before any answer: the kept one.
    expect(again.result.current.value).toBe("Season 1");
    expect(r.pending).toHaveLength(2);
    r.pending[1]!("Season 2");
    await settle();
    expect(again.result.current.value).toBe("Season 2");
  });

  it("one person's kept data is never handed to another (two people, one tab)", async () => {
    const r = reads<string>();
    const pat = renderHook(() => useKept("u-pat", "decks", r.read));
    r.pending[0]!("Pat's decks");
    await settle();
    pat.unmount();
    expect(keptFor("u-pat", "decks")).toBe("Pat's decks");

    expect(keptFor("u-rude", "decks")).toBeUndefined();
    const rude = renderHook(() => useKept("u-rude", "decks", r.read));
    expect(rude.result.current.value).toBeUndefined();
    r.pending[1]!("RudeLeft's decks");
    await settle();
    expect(rude.result.current.value).toBe("RudeLeft's decks");
    // And nobody signed in reads nothing and is handed nothing.
    expect(keptFor(null, "decks")).toBeUndefined();
    const nobody = renderHook(() => useKept(null, "decks", r.read));
    expect(nobody.result.current.value).toBeUndefined();
    expect(r.pending).toHaveLength(2);
  });

  it("signing out forgets everything, and a read still under way is not kept after it", async () => {
    const r = reads<string>();
    const view = renderHook(() => useKept("u-pat", "hall", r.read));
    r.pending[0]!("Season 1");
    await settle();
    view.unmount();
    // A visit starts a read; the player signs out before it lands.
    const visit = renderHook(() => useKept("u-pat", "hall", r.read));
    forgetKept();
    visit.unmount();
    expect(keptFor("u-pat", "hall")).toBeUndefined();
    r.pending[1]!("Season 1, read before signing out");
    await settle();
    expect(keptFor("u-pat", "hall")).toBeUndefined();
    // So the same person signing in again starts from the server too.
    const back = renderHook(() => useKept("u-pat", "hall", r.read));
    expect(back.result.current.value).toBeUndefined();
  });

  it("the latest read wins: an earlier one landing later is dropped", async () => {
    const r = reads<string>();
    const view = renderHook(() => useKept("u-pat", "admin/accounts", r.read));
    act(() => {
      void view.result.current.refresh();
    });
    expect(r.pending).toHaveLength(2);
    r.pending[1]!("after");
    await settle();
    r.pending[0]!("before");
    await settle();
    expect(view.result.current.value).toBe("after");
    expect(keptFor("u-pat", "admin/accounts")).toBe("after");
  });

  it("an action supersedes reads under way: one started before it can't land after it", async () => {
    const r = reads<string>();
    const view = renderHook(() => useKept("u-rude", "admin/accounts", r.read));
    r.pending[0]!("Pat active");
    await settle();
    // The 30 s re-read starts, then an administrator disables Pat.
    act(() => {
      void view.result.current.refresh();
    });
    supersede(["admin/accounts"]);
    r.pending[1]!("Pat active (read before the action)");
    await settle();
    expect(view.result.current.value).toBe("Pat active");
    act(() => {
      void view.result.current.refresh();
    });
    r.pending[2]!("Pat disabled");
    await settle();
    expect(view.result.current.value).toBe("Pat disabled");
  });

  it("a failed read keeps what is shown; with nothing kept it says it failed", async () => {
    const r = reads<string>();
    const view = renderHook(() => useKept("u-pat", "hall", r.read));
    r.pending[0]!(null);
    await settle();
    expect(view.result.current.failed).toBe(true);
    act(() => {
      void view.result.current.refresh();
    });
    r.pending[1]!("Season 1");
    await settle();
    expect(view.result.current.failed).toBe(false);
    act(() => {
      void view.result.current.refresh();
    });
    r.pending[2]!(null);
    await settle();
    expect(view.result.current.value).toBe("Season 1");
    expect(view.result.current.failed).toBe(false);
  });

  it("reading ahead keeps the answer for the next visit, unless it was forgotten meanwhile", async () => {
    const r = reads<string>();
    void readAhead("u-rude", "admin/rooms", r.read);
    r.pending[0]!("two rooms");
    await settle();
    expect(keptFor("u-rude", "admin/rooms")).toBe("two rooms");
    void readAhead("u-rude", "admin/games", r.read);
    forgetKept((key) => key === "admin/games");
    r.pending[1]!("games");
    await settle();
    expect(keptFor("u-rude", "admin/games")).toBeUndefined();
  });
});
