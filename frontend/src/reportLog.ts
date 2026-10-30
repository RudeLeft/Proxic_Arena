// The page's own log — spec 0039.
//
// What the server cannot know: what this page did. Every click (what was
// clicked), every message from a game summarised (a question, an answer, a
// refusal, a board: turn, step, stack), reconnects, page changes, and any
// error. Kept for the last 15 minutes and at most MAX_LINES lines, in
// memory only; it leaves the browser only inside a report the player sends.

export interface LogLine {
  /** Milliseconds since the epoch. */
  t: number;
  kind: string;
  text: string;
}

export const KEEP_MS = 15 * 60 * 1000;
export const MAX_LINES = 4000;
/** A line longer than this is cut: a board can be long. */
const MAX_TEXT = 400;

const lines: LogLine[] = [];

/** Write a line; older than 15 minutes, or past MAX_LINES, drops off. */
export function logLine(kind: string, text: string, now: number = Date.now()): void {
  lines.push({ t: now, kind, text: text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text });
  const cutoff = now - KEEP_MS;
  let drop = 0;
  while (drop < lines.length && (lines[drop]!.t < cutoff || lines.length - drop > MAX_LINES))
    drop++;
  if (drop) lines.splice(0, drop);
}

/** The kept lines, oldest first. */
export function recentLines(): readonly LogLine[] {
  return lines;
}

/** The kept lines as the report sends them: one JSON object a line. */
export function recentLog(): string {
  return lines.map((line) => JSON.stringify(line)).join("\n") + (lines.length ? "\n" : "");
}

/** For tests. */
export function clearLog(): void {
  lines.length = 0;
}

/** What a clicked element is, in a few words: its card, its name or its text. */
export function describeTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const el =
    target.closest("button, a, [role='button'], [data-object-id], input, select, label") ?? target;
  const id = el.getAttribute("data-object-id");
  const name = (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  const what = [id, name.slice(0, 120)].filter(Boolean).join(" ");
  return what || el.tagName.toLowerCase();
}

/** A plain value as words; anything else as "?". */
function word(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "?";
}

/** A game message summarised: what it was and the facts that matter. */
export function summarise(direction: "in" | "out", frame: Record<string, unknown>): string {
  const type = word(frame["type"]);
  const parts: string[] = [type];
  const pick = (key: string) => {
    const value = frame[key];
    if (value !== undefined && value !== null && typeof value !== "object")
      parts.push(`${key}=${word(value)}`);
  };
  for (const key of ["decisionId", "kind", "actionId", "errorCode", "detail", "authorisedSeat"])
    pick(key);
  const options = frame["options"];
  if (Array.isArray(options)) parts.push(`${options.length} options`);
  const prompt = frame["prompt"];
  if (typeof prompt === "string") parts.push(`"${prompt}"`);
  const state = frame["state"] as Record<string, unknown> | undefined;
  if (state && typeof state === "object") {
    parts.push(
      `turn ${String(state["turn"])} ${String(state["phase"])} active ${String(state["activeSeat"])}`,
    );
    const stack = state["stack"];
    if (Array.isArray(stack) && stack.length) {
      parts.push(
        `stack: ${stack.map((s) => word((s as Record<string, unknown>)["name"])).join(", ")}`,
      );
    }
  }
  return `${direction === "in" ? "←" : "→"} ${parts.join(" ")}`;
}

let installed = false;

/** Start listening: clicks, errors, unhandled rejections. Once per page. */
export function installReportLog(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  document.addEventListener(
    "click",
    (event) => {
      const what = describeTarget(event.target);
      if (what) logLine("click", what);
    },
    { capture: true },
  );
  window.addEventListener("error", (event) => {
    logLine("error", `${event.message} at ${event.filename}:${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as unknown;
    logLine("error", `unhandled: ${reason instanceof Error ? reason.message : String(reason)}`);
  });
  logLine("page", `opened ${location.pathname}`);
}
