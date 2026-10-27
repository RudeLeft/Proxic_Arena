// @vitest-environment jsdom

// Spec 0021 — the Account page's Deck Builder panel, against a fetch that
// answers as the server would: link a computer, see the code, remove one.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeckBuilderLink } from "./DeckBuilderLink";
import { removeDevice, shortDate } from "./devices";

type Call = { url: string; method: string; headers: Headers };

function server(devices: { deviceId: string; name: string }[]) {
  const calls: Call[] = [];
  const fetchFn = vi.fn((input: string, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: input, method, headers: new Headers(init.headers) });
    if (input === "/api/auth/device-codes" && method === "POST") {
      return Promise.resolve(
        new Response(JSON.stringify({ code: "K7QX-M4PD", expiresAt: "2026-10-27T19:42:00Z" })),
      );
    }
    if (input === "/api/auth/devices") {
      const list = devices.map((d) => ({
        ...d,
        createdAt: "2026-10-27T10:00:00Z",
        lastUsedAt: null,
      }));
      return Promise.resolve(new Response(JSON.stringify({ devices: list })));
    }
    if (input.startsWith("/api/auth/devices/") && method === "DELETE") {
      const id = decodeURIComponent(input.substring("/api/auth/devices/".length));
      devices.splice(
        devices.findIndex((d) => d.deviceId === id),
        1,
      );
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    return Promise.resolve(new Response(null, { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchFn);
  return calls;
}

/** Lets the page's fetches answer and React draw what they brought. */
const settle = () => act(async () => {});

afterEach(() => {
  vi.unstubAllGlobals();
  document.cookie = "proxicarena_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
});

describe("the Deck Builder panel", () => {
  it("shows a code to type into the Deck Builder, made with the page's CSRF token", async () => {
    document.cookie = "proxicarena_csrf=csrf-123";
    const calls = server([]);
    render(<DeckBuilderLink />);
    await settle();
    expect(screen.getByText("No computers are linked.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Link a computer" }));
    await settle();
    expect(screen.getByLabelText("Link code").textContent).toBe("K7QX-M4PD");
    expect(screen.getByRole("status").textContent).toContain("It works once");
    const made = calls.find((c) => c.method === "POST")!;
    expect(made.headers.get("X-CSRF-Token")).toBe("csrf-123");
  });

  it("lists linked computers and removes one", async () => {
    server([{ deviceId: "d-1", name: "Pat's desktop" }]);
    render(<DeckBuilderLink />);
    await settle();
    expect(screen.getByText("Pat's desktop")).toBeTruthy();
    expect(screen.getByText(/not used yet/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Remove Pat's desktop" }));
    await settle();
    expect(screen.queryByText("Pat's desktop")).toBeNull();
    expect(screen.getByText("No computers are linked.")).toBeTruthy();
  });
});

describe("the device helpers", () => {
  it("removes by id, escaped, with DELETE", async () => {
    const calls = server([{ deviceId: "a/b", name: "odd" }]);
    expect(await removeDevice("a/b")).toBe(true);
    expect(calls[0]).toMatchObject({ url: "/api/auth/devices/a%2Fb", method: "DELETE" });
  });

  it("dates this year without the year, other years with it", () => {
    const now = new Date("2026-10-27T12:00:00Z");
    expect(shortDate("2026-03-05T12:00:00Z", now)).not.toContain("2026");
    expect(shortDate("2025-03-05T12:00:00Z", now)).toContain("2025");
  });
});
