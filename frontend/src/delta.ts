/**
 * P11-D4 (spec 0117, 2026-11-23) -- each page is sent only what changed.
 *
 * The server sends a board as a MATCH_DELTA made from the board THIS
 * connection was last sent (server `BoardDelta.kt`, `BoardStream.kt`):
 *
 *   gameEpoch, from, to   the game, the base's stateRevision, the new one
 *   set    {key: value}   top-level keys whose value changed, whole
 *   unset  [key]          top-level keys the new board no longer has
 *   lists  {key: {put, drop, order?}}  a list of objects keyed by a unique
 *          `id` (or, with no id, `seat`) patched by item: `put` each new or
 *          changed item whole, `drop` the keys of items gone, `order` every
 *          key in the new order when it is not "kept items as they were, then
 *          the new ones"
 *   kept, payments, rolls, notices   P11-D3's history, unchanged (history.ts)
 *   whole  TEST ONLY (PROXIC_TEST_DELTA_CHECK): the full board, to compare
 *
 * `applyDelta` rebuilds the board from the base the page holds. Every item,
 * list and value the delta does not name is the SAME object as in the base,
 * which P11-C2 builds on. The history lists come from the delta as sent, and
 * `withHistory` (history.ts) finishes them, as for a MATCH_SNAPSHOT.
 *
 * `deltaOf` and `DeltaStream` mirror the server's rule for tools and tests
 * (the jumps check's JUMPS_DELTAS, the shared fixtures); the page never
 * calls them. Kept in step by protocol/fixtures/delta/.
 */
import { HISTORY_KEYS, trimHistory, withHistory, type HeldHistory } from "./history";

type Json = unknown;
type Board = Record<string, Json>;
type Patch = { put?: Json[]; drop?: Json[]; order?: Json[] };

const NOT_PATCHED = new Set<string>([...HISTORY_KEYS, "kept"]);

/** A delta that does not fit its base (a list it patches is missing, an order that names a missing key). */
export class DeltaError extends Error {}

function isObject(value: Json): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Two JSON values are equal when their JSON is, ignoring key order. */
export function sameJson(a: Json, b: Json): boolean {
  return firstDifference(a, b) === null;
}

/** The first path at which two JSON values differ ("" for the top), or null when they are equal. */
export function firstDifference(a: Json, b: Json, path = ""): string | null {
  if (a === b) return null;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return path || "/";
    if (a.length !== b.length) return `${path}/length`;
    for (let i = 0; i < a.length; i += 1) {
      const d = firstDifference(a[i], b[i], `${path}/${i}`);
      if (d !== null) return d;
    }
    return null;
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!(key in a) || !(key in b)) return `${path}/${key}`;
      const d = firstDifference(a[key], b[key], `${path}/${key}`);
      if (d !== null) return d;
    }
    return null;
  }
  return path || "/";
}

/** A canonical text for a JSON value (keys sorted), to key items by. */
function canon(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canon(value[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** "id" or "seat" when both lists are keyed by it (every entry an object, each key unique), else null. */
export function keyedBy(old: readonly Json[], now: readonly Json[]): "id" | "seat" | null {
  const items = [...old, ...now];
  if (!items.every(isObject)) return null;
  const objects = items;
  let by: "id" | "seat";
  if (objects.every((x) => "id" in x)) by = "id";
  else if (!objects.some((x) => "id" in x) && objects.every((x) => "seat" in x)) by = "seat";
  else return null;
  for (const list of [old, now]) {
    const keys = list.map((x) => canon((x as Record<string, Json>)[by]));
    if (new Set(keys).size !== keys.length) return null;
  }
  return by;
}

function patchOf(old: readonly Json[], now: readonly Json[], by: "id" | "seat"): Patch {
  const key = (x: Json) => canon((x as Record<string, Json>)[by]);
  const had = new Map(old.map((x) => [key(x), x]));
  const nowKeys = now.map(key);
  const nowSet = new Set(nowKeys);
  const put = now.filter((x) => {
    const before = had.get(key(x));
    return before === undefined || !sameJson(before, x);
  });
  const drop = old.filter((x) => !nowSet.has(key(x))).map((x) => (x as Record<string, Json>)[by]);
  const kept = old.map(key).filter((k) => nowSet.has(k));
  const added = nowKeys.filter((k) => !had.has(k));
  const out: Patch = {};
  if (put.length > 0) out.put = put;
  if (drop.length > 0) out.drop = drop;
  const fallback = [...kept, ...added];
  if (fallback.length !== nowKeys.length || fallback.some((k, i) => k !== nowKeys[i]))
    out.order = now.map((x) => (x as Record<string, Json>)[by]);
  return out;
}

/**
 * The server's diff (`BoardDelta.diff`), for tools and tests: how [base]
 * becomes [board], for every key but the history lists.
 */
export function deltaOf(base: Board, board: Board): Board {
  const set: Board = {};
  const lists: Record<string, Patch> = {};
  for (const [key, value] of Object.entries(board)) {
    if (NOT_PATCHED.has(key)) continue;
    const old = base[key];
    if (key in base && sameJson(old, value)) continue;
    const by = Array.isArray(old) && Array.isArray(value) ? keyedBy(old, value) : null;
    if (!(key in base) || by === null) set[key] = value;
    else lists[key] = patchOf(old as Json[], value as Json[], by);
  }
  const unset = Object.keys(base).filter((k) => !NOT_PATCHED.has(k) && !(k in board));
  const out: Board = {};
  if (Object.keys(set).length > 0) out["set"] = set;
  if (unset.length > 0) out["unset"] = unset;
  if (Object.keys(lists).length > 0) out["lists"] = lists;
  return out;
}

/**
 * P11-C2 (2026-11-25) -- a list this page rebuilt, and the key of each item
 * in it, so the next delta to that list need not read every item again.
 */
interface ListKeys {
  by: "id" | "seat";
  at: ReadonlyMap<string, number>;
}
const listKeys = new WeakMap<readonly Json[], ListKeys>();

/**
 * P11-C2 -- the common patch, in time with what changed: items put in their
 * own places (none new, none dropped, the order kept) on a list rebuilt here
 * before. Returns null for anything else (the full rule below). The same
 * answer as the full rule: the same checks on `put` (objects, keyed the same
 * way, each key once), each put item at its key's place, every other item the
 * same object.
 */
function patchedInPlace(old: readonly Json[], patch: Record<string, Json>): Json[] | null {
  const held = listKeys.get(old);
  if (!held || patch["drop"] !== undefined || patch["order"] !== undefined) return null;
  const put = Array.isArray(patch["put"]) ? (patch["put"] as Json[]) : [];
  const seen = new Set<string>();
  const places: number[] = [];
  for (const x of put) {
    if (!isObject(x)) return null;
    if (held.by === "id" ? !("id" in x) : "id" in x || !("seat" in x)) return null;
    const k = canon(x[held.by]);
    const at = held.at.get(k);
    if (at === undefined || seen.has(k)) return null;
    seen.add(k);
    places.push(at);
  }
  const out = old.slice();
  put.forEach((x, i) => (out[places[i]!] = x));
  listKeys.set(out, held);
  return out;
}

function applyList(old: readonly Json[], patch: Json): Json[] {
  if (!isObject(patch)) throw new DeltaError("a list patch that is not an object");
  const quick = patchedInPlace(old, patch);
  if (quick) return quick;
  const out = applyListFully(old, patch);
  const by = keyedBy(out, []);
  if (by && out.length > 0) {
    const keys = out.map((x) => canon((x as Record<string, Json>)[by]));
    listKeys.set(out, { by, at: new Map(keys.map((k, i) => [k, i])) });
  }
  return out;
}

function applyListFully(old: readonly Json[], patch: Record<string, Json>): Json[] {
  const put = Array.isArray(patch["put"]) ? (patch["put"] as Json[]) : [];
  const by = keyedBy(old, put);
  if (by === null) throw new DeltaError("a list that is not keyed");
  const key = (x: Json) => canon((x as Record<string, Json>)[by]);
  const drop = new Set((Array.isArray(patch["drop"]) ? (patch["drop"] as Json[]) : []).map(canon));
  const putBy = new Map(put.map((x) => [key(x), x]));
  const oldKeys = new Set(old.map(key));
  const items = old
    .filter((x) => !drop.has(key(x)))
    .map((x) => putBy.get(key(x)) ?? x)
    .concat(put.filter((x) => !oldKeys.has(key(x))));
  const order = patch["order"];
  if (order === undefined) return items;
  if (!Array.isArray(order)) throw new DeltaError("an order that is not a list");
  const byKey = new Map(items.map((x) => [key(x), x]));
  const keys = order.map(canon);
  if (keys.length !== items.length || keys.some((k) => !byKey.has(k)))
    throw new DeltaError("an order that does not fit");
  return keys.map((k) => byKey.get(k)!);
}

/**
 * The board a MATCH_DELTA makes of [base] (the last whole board the page
 * took, as sent): every key but the history lists patched; those, and
 * `kept`, as the delta carries them, for `withHistory` to finish. Throws
 * `DeltaError` on a delta that does not fit (the page then asks for a full
 * board). Whatever the delta does not name is the base's own object.
 */
export function applyDelta(base: Board, delta: Board): Board {
  const out: Board = {};
  for (const [key, value] of Object.entries(base)) if (!NOT_PATCHED.has(key)) out[key] = value;
  const unset = delta["unset"];
  if (unset !== undefined) {
    if (!Array.isArray(unset)) throw new DeltaError("unset is not a list");
    for (const key of unset) delete out[String(key)];
  }
  const set = delta["set"];
  if (set !== undefined) {
    if (!isObject(set)) throw new DeltaError("set is not an object");
    Object.assign(out, set);
  }
  const lists = delta["lists"];
  if (lists !== undefined) {
    if (!isObject(lists)) throw new DeltaError("lists is not an object");
    for (const [key, patch] of Object.entries(lists)) {
      const old = base[key];
      if (!Array.isArray(old)) throw new DeltaError(`no list ${key} to patch`);
      out[key] = applyList(old, patch);
    }
  }
  for (const key of NOT_PATCHED) if (key in delta) out[key] = delta[key];
  return out;
}

/** What each envelope adds to its body (the server's BoardStream.DELTA_ENVELOPE / SNAPSHOT_ENVELOPE). */
const DELTA_ENVELOPE = 92;
const SNAPSHOT_ENVELOPE = 105;

/**
 * The server's BoardStream, for tools and tests that play boards into a page
 * as the server sends them (the jumps check's JUMPS_DELTAS): a whole board
 * first and at every new game or turn, deltas between, P11-D3's history
 * trimmed throughout. The page never uses it.
 */
export class DeltaStream {
  private held: HeldHistory = {};
  private revision: number | null = null;
  private base: Board | null = null;

  step(state: Board): { type: "MATCH_SNAPSHOT" | "MATCH_DELTA"; body: Board } {
    const rev = typeof state["stateRevision"] === "number" ? state["stateRevision"] : null;
    if (rev !== null && this.revision !== null && rev < this.revision)
      return { type: "MATCH_SNAPSHOT", body: state };
    if (rev !== null) this.revision = rev;
    const had = this.base;
    const checkpoint =
      had !== null &&
      (!sameJson(had["gameEpoch"], state["gameEpoch"]) || !sameJson(had["turn"], state["turn"]));
    if (checkpoint) this.held = {};
    const { sent, held } = trimHistory(this.held, state);
    this.held = held;
    this.base = state;
    if (had === null || checkpoint) return { type: "MATCH_SNAPSHOT", body: sent };
    const delta: Board = {};
    if ("gameEpoch" in state) delta["gameEpoch"] = state["gameEpoch"];
    if ("stateRevision" in had) delta["from"] = had["stateRevision"];
    if ("stateRevision" in state) delta["to"] = state["stateRevision"];
    Object.assign(delta, deltaOf(had, state));
    for (const key of [...HISTORY_KEYS, "kept"]) if (key in sent) delta[key] = sent[key];
    if (
      JSON.stringify(delta).length + DELTA_ENVELOPE >=
      JSON.stringify(sent).length + SNAPSHOT_ENVELOPE
    )
      return { type: "MATCH_SNAPSHOT", body: sent };
    return { type: "MATCH_DELTA", body: delta };
  }
}

/**
 * For browser tests that read or re-send boards off the match socket: the
 * page's own rebuild, kept per socket (P11-D3's history, P11-D4's base).
 * `take` gives a MATCH_SNAPSHOT or MATCH_DELTA frame's text back as a WHOLE
 * MATCH_SNAPSHOT (as the worker made it), so a test that clones the last
 * board and sends it again sends a whole board, never one trimmed against a
 * list it then doubles or a delta built on a board the page no longer has.
 * The page takes a full board at any time. Other frames come back unchanged.
 */
export class WholeBoards {
  private held: HeldHistory | undefined;
  private base: Board | null = null;
  private revision = -Infinity;
  /** The last whole board this socket's page took (not one older than its own), or null. */
  last: Record<string, unknown> | null = null;
  /** How many boards came trimmed (with `kept`), by list: snapshots and deltas. */
  readonly trimmed: Record<string, number> = {};
  /** How many boards came as deltas, and how many of those did not fit what this copy holds. */
  deltas = 0;
  misfits = 0;

  take(frame: string): string {
    const message = JSON.parse(frame) as Record<string, unknown>;
    const type = message["type"];
    if (type !== "MATCH_SNAPSHOT" && type !== "MATCH_DELTA") return frame;
    let raw: Record<string, unknown> | null;
    if (type === "MATCH_DELTA") {
      this.deltas += 1;
      const base = this.base;
      if (
        !base ||
        base["gameEpoch"] !== message["gameEpoch"] ||
        base["stateRevision"] !== message["from"]
      ) {
        this.misfits += 1;
        return frame;
      }
      try {
        raw = applyDelta(base, message);
      } catch {
        this.misfits += 1;
        return frame;
      }
    } else {
      raw = message["state"] as Record<string, unknown> | null;
    }
    const kept = raw?.["kept"];
    for (const key of Object.keys(typeof kept === "object" && kept !== null ? kept : {}))
      this.trimmed[key] = (this.trimmed[key] ?? 0) + 1;
    const { state, history } = withHistory(this.held, raw);
    const rev = (state as { stateRevision?: unknown } | null)?.stateRevision;
    // The page keeps the boards it takes: not one older than its own.
    if (typeof rev === "number" && rev >= this.revision) {
      this.revision = rev;
      this.held = history;
      this.last = state as Record<string, unknown>;
      this.base = state as Board;
    }
    const envelope: Record<string, unknown> = {};
    for (const key of ["protocolVersion", "messageId"])
      if (key in message) envelope[key] = message[key];
    return JSON.stringify({ ...envelope, type: "MATCH_SNAPSHOT", state });
  }
}
