// Connectivity and service status, as DATA.
//
// PHASE_01 §1.69: "Do not hardcode service-ready indicators. Every
// indicator must reflect an actual backend/runtime check." This module
// is deliberately UI-free so the rules can be tested without a browser
// — the status logic is where the lying would happen, not the pixels.

import { PROTOCOL_VERSION, parseEnvelope, makeEnvelope } from "./protocol";

/** §1.70 — the six states that must be distinguishable. */
export type ServiceState =
  | "loading"
  | "ready"
  | "degraded"
  | "unavailable"
  | "disconnected"
  | "version-mismatch";

export interface VersionInfo {
  proxicVersion: string;
  protocolVersion: number;
  forgeCommit: string;
  forgeRelease: string;
  javaVersion: string;
  buildId: string | null;
}

export interface Readiness {
  status: string;
  checks: Record<string, string>;
}

/**
 * Map one backend check to a display state.
 *
 * "unconfigured" is NOT ready. During Phase 1 the database and worker
 * are legitimately unconfigured, and showing them green would be the
 * precise failure §1.69 prohibits — a status display that reports
 * health it never observed.
 */
export function checkState(value: string | undefined): ServiceState {
  switch (value) {
    case "ok":
      return "ready";
    case undefined:
      return "unavailable";
    case "unconfigured":
      return "degraded";
    default:
      // "missing", "unwritable", anything else the server invents.
      return "degraded";
  }
}

/**
 * Decide the overall state from a version response.
 *
 * A protocol mismatch is its own state, not a generic failure: the
 * server is reachable and healthy, the client simply cannot speak to
 * it, and telling the user "unavailable" would send them debugging the
 * wrong thing.
 */
export function versionState(v: VersionInfo | null): ServiceState {
  if (v === null) return "unavailable";
  if (v.protocolVersion !== PROTOCOL_VERSION) return "version-mismatch";
  return "ready";
}

export interface Snapshot {
  server: ServiceState;
  database: ServiceState;
  forgeRuntime: ServiceState;
  websocket: ServiceState;
  version: VersionInfo | null;
  /**
   * The raw backend check values, kept so the UI can say what the
   * server actually said.
   *
   * Without this every non-ok state collapsed to one label: an
   * UNREACHABLE or INCOMPATIBLE Forge worker displayed as "Not
   * configured", which sends an operator to set a variable that is
   * already set. The backend distinguishes five worker states for a
   * reason; throwing four of them away at the display layer is the
   * same class of dishonesty as a false green.
   */
  checks: Record<string, string>;
}

export const INITIAL_SNAPSHOT: Snapshot = {
  server: "loading",
  database: "loading",
  forgeRuntime: "loading",
  websocket: "loading",
  version: null,
  checks: {},
};

/** Fetch readiness + version. Never throws; failure is a state. */
export async function fetchStatus(
  fetchFn: typeof fetch = fetch,
): Promise<Omit<Snapshot, "websocket">> {
  let version: VersionInfo | null = null;
  let readiness: Readiness | null = null;

  try {
    const r = await fetchFn("/api/version");
    if (r.ok) version = (await r.json()) as VersionInfo;
  } catch {
    version = null;
  }
  try {
    // Readiness answers 503 when degraded, which is a real answer and
    // must be read, not treated as unreachable.
    const r = await fetchFn("/api/health/ready");
    readiness = (await r.json()) as Readiness;
  } catch {
    readiness = null;
  }

  const vState = versionState(version);
  if (vState === "version-mismatch") {
    return {
      server: "version-mismatch",
      database: "version-mismatch",
      forgeRuntime: "version-mismatch",
      version,
      checks: readiness?.checks ?? {},
    };
  }
  if (readiness === null) {
    return {
      server: "unavailable",
      database: "unavailable",
      forgeRuntime: "unavailable",
      version,
      checks: {},
    };
  }
  return {
    server: "ready",
    database: checkState(readiness.checks["database"]),
    forgeRuntime: checkState(readiness.checks["forgeWorker"]),
    version,
    checks: readiness.checks,
  };
}

/**
 * A /ws/system connection reduced to a state.
 *
 * Returns a disposer. Callers MUST call it — §1.18's lifecycle test
 * exists because an undisposed socket or loop is the classic React
 * leak.
 */
export function connectSystemSocket(
  url: string,
  onState: (s: ServiceState) => void,
  WebSocketImpl: typeof WebSocket = WebSocket,
): () => void {
  let closedByUs = false;
  const ws = new WebSocketImpl(url);

  // A handle for the end-to-end test that asserts a DROPPED socket
  // stops showing "Ready" (§1.80). A browser gives a test no other
  // way to reach a socket the page owns. Registration is harmless
  // (it exposes no data and grants nothing a page script could not
  // already do) and the array is cleaned up on dispose, so it
  // cannot become a leak of closed sockets.
  // `window` is absent in the unit-test environment, and the unit
  // tests caught that immediately -- this module is deliberately
  // UI-free and must stay runnable without a DOM.
  const registry: { __proxicSockets?: WebSocket[] } =
    typeof window === "undefined" ? {} : (window as unknown as { __proxicSockets?: WebSocket[] });
  (registry.__proxicSockets ??= []).push(ws);

  ws.addEventListener("open", () => onState("ready"));
  ws.addEventListener("message", (ev: MessageEvent) => {
    const parsed = parseEnvelope(String(ev.data));
    if (!parsed.ok) {
      onState(parsed.errorCode === "PROTOCOL_VERSION_MISMATCH" ? "version-mismatch" : "degraded");
      return;
    }
    if (parsed.envelope.type === "HELLO") {
      onState("ready");
      ws.send(JSON.stringify(makeEnvelope("PING")));
    }
  });
  ws.addEventListener("error", () => onState("unavailable"));
  ws.addEventListener("close", () => {
    if (!closedByUs) onState("disconnected");
  });

  return () => {
    closedByUs = true;
    // `?? []` rather than a possibly-undefined assignment:
    // exactOptionalPropertyTypes makes the difference explicit.
    registry.__proxicSockets = (registry.__proxicSockets ?? []).filter((s) => s !== ws);
    try {
      ws.close();
    } catch {
      /* already closed */
    }
  };
}
