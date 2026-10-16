import { describe, expect, it, vi } from "vitest";
import { fetchAuthState, isSessionExpired, login, safeReturnPath } from "./auth";

/**
 * Authentication client — PHASE_03 §3.68, §3.72, §3.74.
 */

function respondWith(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
      }),
    ),
  ) as unknown as typeof fetch;
}

describe("safeReturnPath (§3.68)", () => {
  it("keeps an application-local path", () => {
    expect(safeReturnPath("/decks")).toBe("/decks");
    expect(safeReturnPath("/decks?open=abc")).toBe("/decks?open=abc");
    expect(safeReturnPath("/a/b/c")).toBe("/a/b/c");
  });

  it("refuses anything that could leave the application", () => {
    // An open redirect turns the login page into a credible
    // phishing launchpad: a link to the real site, a real login,
    // then a bounce to a page asking for the password "again".
    const hostile = [
      "https://evil.example",
      "http://evil.example/decks",
      // Protocol-relative: a browser treats this as absolute.
      "//evil.example",
      "///evil.example",
      // Some browsers normalise backslashes to slashes.
      String.raw`/\evil.example`,
      String.raw`\\evil.example`,
      "javascript:alert(1)",
      "decks",
      "",
    ];
    for (const path of hostile) {
      expect(safeReturnPath(path), path).toBe("/");
    }
  });

  it("refuses a path containing control characters", () => {
    expect(safeReturnPath("/decks\u0000https://evil.example")).toBe("/");
    expect(safeReturnPath("/decks\nhttps://evil.example")).toBe("/");
  });

  it("falls back to the home page for nothing at all", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
  });
});

describe("fetchAuthState (§3.72)", () => {
  it("reports an authenticated user", async () => {
    const state = await fetchAuthState(
      respondWith(200, {
        authenticated: true,
        user: { userId: "1", username: "RudeLeft", displayName: "Eric", role: "ADMIN" },
      }),
    );
    expect(state.status).toBe("authenticated");
    if (state.status === "authenticated") expect(state.user.username).toBe("RudeLeft");
  });

  it("reports anonymous without erroring", async () => {
    // §3.49 — the server answers 200 with authenticated:false. A
    // page that treated this as an error would show "broken"
    // instead of a login form.
    const state = await fetchAuthState(respondWith(200, { authenticated: false }));
    expect(state.status).toBe("anonymous");
  });

  it("treats an unreachable server as anonymous rather than crashing", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    expect((await fetchAuthState(dead)).status).toBe("anonymous");
  });
});

describe("login", () => {
  it("returns the user on success", async () => {
    const result = await login(
      "RudeLeft",
      "a passphrase",
      respondWith(200, {
        authenticated: true,
        user: { userId: "1", username: "RudeLeft", displayName: "Eric", role: "ADMIN" },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("passes the server's own message through, inventing nothing", async () => {
    // §3.44 — the server never says "no such user", and the page
    // must not add it. A helpful-looking client-side message would
    // reintroduce the enumeration oracle the server avoids.
    const result = await login(
      "nobody",
      "wrong",
      respondWith(401, {
        errorCode: "INVALID_CREDENTIALS",
        detail: "That username and password do not match.",
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.detail).toBe("That username and password do not match.");
      expect(result.failure.detail).not.toMatch(/no such user|unknown user|does not exist/i);
    }
  });

  it("surfaces how long to wait when throttled", async () => {
    const result = await login(
      "RudeLeft",
      "wrong",
      respondWith(
        429,
        { errorCode: "TOO_MANY_ATTEMPTS", detail: "Too many sign-in attempts." },
        { "Retry-After": "420" },
      ),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.retryAfterSeconds).toBe(420);
  });

  it("reports an unreachable server as a failure, not a crash", async () => {
    const dead = vi.fn(() => Promise.reject(new Error("down"))) as unknown as typeof fetch;
    const result = await login("RudeLeft", "x", dead);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.errorCode).toBe("NETWORK");
  });
});

describe("isSessionExpired (§3.74)", () => {
  it("recognises a 401 and nothing else", () => {
    expect(isSessionExpired(new Response("", { status: 401 }))).toBe(true);
    // 403 is a CSRF or permission failure: the session is fine and
    // signing the person out would be wrong.
    expect(isSessionExpired(new Response("", { status: 403 }))).toBe(false);
    expect(isSessionExpired(new Response("", { status: 404 }))).toBe(false);
    expect(isSessionExpired(new Response("", { status: 500 }))).toBe(false);
  });
});
