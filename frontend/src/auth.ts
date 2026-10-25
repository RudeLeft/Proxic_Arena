// Authentication client — PHASE_03 §3.65–§3.76.
//
// UI-free on purpose, like status.ts and decks.ts: the rules worth
// testing are "what counts as a safe return path" and "what happens
// when a session expires", and both should be checkable without a
// browser.
//
// §3.24: nothing here stores a token. The session lives in an
// HttpOnly cookie the page cannot read, and the only authentication
// state the app holds is "who the server says I am", refetched from
// the server rather than remembered.

export interface AuthUser {
  userId: string;
  username: string;
  displayName: string;
  role: string;
}

/** §3.73 — loading is a real state, not "unauthenticated yet". */
export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser }
  | { status: "anonymous"; reason?: "expired" };

export interface LoginFailure {
  errorCode: string;
  detail: string;
  retryAfterSeconds?: number;
}

/** The CSRF token, from the cookie the server left readable (§3.51). */
export function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)proxicarena_csrf=([^;]+)/);
  return match?.[1] ?? null;
}

/**
 * Fetch, with the CSRF header attached to mutating requests.
 *
 * Every call in the app should go through this: a request that
 * forgets the header gets a 403 that looks like a permissions bug
 * and is really a missing header.
 */
export async function apiFetch(
  input: string,
  init: RequestInit = {},
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const token = csrfToken();
    if (token) headers.set("X-CSRF-Token", token);
  }
  return fetchFn(input, { ...init, headers, credentials: "same-origin" });
}

/** §3.72 — authoritative state, asked of the server. */
export async function fetchAuthState(fetchFn: typeof fetch = fetch): Promise<AuthState> {
  try {
    const response = await fetchFn("/api/auth/me", { credentials: "same-origin" });
    // 204: not signed in -- the server tells a stranger nothing more
    // (owner 2026-10-24).
    if (!response.ok || response.status === 204) return { status: "anonymous" };
    const body = (await response.json()) as { authenticated: boolean; user?: AuthUser };
    return body.authenticated && body.user
      ? { status: "authenticated", user: body.user }
      : { status: "anonymous" };
  } catch {
    // The server being unreachable is not the same as being signed
    // out, but the page can do nothing either way, and claiming to
    // be signed in without a server would be worse.
    return { status: "anonymous" };
  }
}

export async function login(
  username: string,
  password: string,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; user: AuthUser } | { ok: false; failure: LoginFailure }> {
  let response: Response;
  try {
    response = await fetchFn("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return {
      ok: false,
      failure: { errorCode: "NETWORK", detail: "The server could not be reached." },
    };
  }

  if (response.ok) {
    const body = (await response.json()) as { user: AuthUser };
    return { ok: true, user: body.user };
  }

  const payload = (await response.json().catch(() => null)) as {
    errorCode?: string;
    detail?: string;
  } | null;

  const failure: LoginFailure = {
    errorCode: payload?.errorCode ?? "INVALID_CREDENTIALS",
    // The server's own sentence. Never "no such user" — the server
    // does not say that, and the page must not invent it (§3.44).
    detail: payload?.detail ?? "That username and password do not match.",
  };
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) failure.retryAfterSeconds = Number(retryAfter);
  return { ok: false, failure };
}

export async function logout(fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    await apiFetch("/api/auth/logout", { method: "POST" }, fetchFn);
  } catch {
    // Logging out is best-effort from the page's point of view: the
    // cookie is cleared by the server, and a failure here must not
    // leave someone stuck on a page they are trying to leave.
  }
}

/**
 * §3.74 — did this response mean the session ended?
 *
 * A 401 from any API call means the session expired or was revoked
 * while the page was open. The page clears its state and sends the
 * person to login with a message, rather than showing an error that
 * looks like the feature is broken.
 */
/**
 * §3.34 — end every session, on every device, including this one.
 *
 * Not best-effort, unlike `logout`: if this fails, sessions
 * elsewhere are still live and saying "signed out everywhere" would
 * be a lie. The caller is told so it can say something true.
 */
export async function logoutEverywhere(fetchFn: typeof fetch = fetch): Promise<number | null> {
  try {
    const response = await apiFetch("/api/auth/logout-all", { method: "POST" }, fetchFn);
    if (!response.ok) return null;
    const body = (await response.json()) as { revokedSessions?: number };
    return body.revokedSessions ?? 0;
  } catch {
    return null;
  }
}

export function isSessionExpired(response: Response): boolean {
  return response.status === 401;
}
