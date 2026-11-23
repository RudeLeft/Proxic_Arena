/**
 * P11-D3 (2026-11-22) -- history sent once.
 *
 * A board's history lists (`payments`, `rolls`, `notices`: "the last N"
 * as the worker keeps them) are no longer sent whole on every board. The
 * server remembers, per connection, the lists this page holds and sends
 * only the entries the page lacks, with `kept` saying how many of its own
 * the page keeps: `{ "payments": 23 }` = "keep the last 23 of your
 * payments, then add this board's" (server `BoardHistory.kt`).
 *
 * `withHistory` rebuilds the whole board before anything reads it, so every
 * part of the page sees the board the worker made, exactly as before. A
 * board without `kept` (a connection's first board, an older server, a test
 * or the jumps check feeding whole boards) carries its lists whole.
 */

/** The lists sent once, by the snapshot key (the server's `HISTORY_KEYS`). */
export const HISTORY_KEYS = ["payments", "rolls", "notices"] as const;

/** The raw lists the page holds, as the last board it took had them. */
export type HeldHistory = Readonly<Record<string, readonly unknown[]>>;

/**
 * The whole board for [raw], a MATCH_SNAPSHOT's `state`, given what the
 * page holds; and what it holds once it takes that board. Not a board
 * (not an object): returned as it is, the history unchanged.
 */
export function withHistory(
  held: HeldHistory | undefined,
  raw: unknown,
): { state: unknown; history: HeldHistory } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { state: raw, history: held ?? {} };
  }
  const sent = raw as Record<string, unknown>;
  const kept = sent["kept"];
  const keep = typeof kept === "object" && kept !== null ? (kept as Record<string, unknown>) : null;
  const state: Record<string, unknown> = { ...sent };
  delete state["kept"];
  const history: Record<string, readonly unknown[]> = {};
  for (const key of HISTORY_KEYS) {
    const m = keep ? keep[key] : undefined;
    const add = Array.isArray(sent[key]) ? (sent[key] as unknown[]) : [];
    if (typeof m === "number" && m > 0) {
      const had = held?.[key] ?? [];
      state[key] = [...had.slice(Math.max(0, had.length - m)), ...add];
    }
    history[key] = Array.isArray(state[key]) ? (state[key] as unknown[]) : [];
  }
  return { state, history };
}

/**
 * The server's rule (`BoardHistory.kt` `trim`), for tools and tests that
 * play boards into a page as the server now sends them (the jumps check's
 * JUMPS_HISTORY_ONCE): [state] trimmed to what a page holding [held] lacks,
 * and what that page holds once it takes it. The page never calls it.
 */
export function trimHistory(
  held: HeldHistory | undefined,
  state: Record<string, unknown>,
): { sent: Record<string, unknown>; held: HeldHistory } {
  const sent: Record<string, unknown> = { ...state };
  const kept: Record<string, number> = {};
  const holds: Record<string, readonly unknown[]> = {};
  for (const key of HISTORY_KEYS) {
    const now = Array.isArray(state[key]) ? (state[key] as unknown[]) : [];
    holds[key] = now;
    const had = held?.[key] ?? [];
    let m = Math.min(had.length, now.length);
    while (m > 0 && JSON.stringify(had.slice(had.length - m)) !== JSON.stringify(now.slice(0, m)))
      m -= 1;
    if (m === 0) continue;
    kept[key] = m;
    const rest = now.slice(m);
    if (rest.length > 0) sent[key] = rest;
    else delete sent[key];
  }
  if (Object.keys(kept).length > 0) sent["kept"] = kept;
  return { sent, held: holds };
}

/**
 * For browser tests that read or re-send boards off the match socket: the
 * page's own rebuild, kept per socket. `take` gives a MATCH_SNAPSHOT
 * frame's text back whole (as the worker made it), so a test that clones
 * the last board and sends it again sends a whole board, never one trimmed
 * against a list it then doubles.
 */
export class WholeBoards {
  private held: HeldHistory | undefined;
  private revision = -Infinity;
  /** The last whole board this socket's page took (not one older than its own), or null. */
  last: Record<string, unknown> | null = null;
  /** How many boards came trimmed (with `kept`), by list. */
  readonly trimmed: Record<string, number> = {};

  take(frame: string): string {
    const message = JSON.parse(frame) as Record<string, unknown>;
    if (message["type"] !== "MATCH_SNAPSHOT") return frame;
    const raw = message["state"] as { kept?: Record<string, unknown> } | null;
    for (const key of Object.keys(raw?.kept ?? {}))
      this.trimmed[key] = (this.trimmed[key] ?? 0) + 1;
    const { state, history } = withHistory(this.held, raw);
    const rev = (state as { stateRevision?: unknown } | null)?.stateRevision;
    // The page keeps the history of the boards it takes: not one older than its own.
    if (typeof rev === "number" && rev >= this.revision) {
      this.revision = rev;
      this.held = history;
      this.last = state as Record<string, unknown>;
    }
    return JSON.stringify({ ...message, state });
  }
}
