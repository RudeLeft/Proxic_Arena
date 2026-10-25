import { describe, expect, it, vi } from "vitest";
import { fetchAuthState, isSessionExpired, login } from "./auth";

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
