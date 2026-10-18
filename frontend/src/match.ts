// The match, as DATA — PHASE_06 §6.99–§6.104, §6.110–§6.113.
//
// UI-free, like lobby.ts and decks.ts, and for the same reason:
// everything that could be WRONG about a match in a browser lives
// here, and none of it should need a browser to test.
//
// ONE RULE runs through the whole file, inherited from §5.132 and
// sharpened by §6.39: FORGE OWNS THE GAME. This module never
// decides whether an action is legal, never removes an option it
// thinks has become invalid, never guesses what a choice will do
// and never answers on the player's behalf. It renders the
// question the server sent and sends back the answer the player
// picked. A client that filtered its own options would be a
// second rules engine (§6.50), and a second rules engine is a
// disagreement waiting to happen.
//
// The other rule, §6.100: the browser's own idea of who it is
// carries no authority. Nothing sent from here names a seat, a
// user or a state version — only which decision, and which
// action. Everything else is the server's to know.

/** §6.49 — a presentation hint, never authority. */
export interface DecisionOption {
  actionId: string;
  label: string | null;
}

export interface Decision {
  decisionId: number;
  /**
   * The seat the decision is ABOUT.
   *
   * Usually your own. Under a control effect it is somebody
   * else's, and you need to be told, because "choose an attacker"
   * means something different when the creatures are not yours.
   *
   * There is no `authorisedSeat` here on purpose: that is the
   * server's conclusion, and this frame only ever reaches the
   * player it authorised (§6.38).
   */
  actedForSeat: number;
  kind: string;
  stateVersion: number;
  options: DecisionOption[];
}

export type MatchConnection = "connecting" | "open" | "closed";

export interface MatchState {
  connection: MatchConnection;
  /** Your own seat, as the server greeted you (§6.110). */
  seat: number | null;
  /** What Forge is waiting for, or null when it is not waiting on you. */
  decision: Decision | null;
  /**
   * An answer that has been sent and not yet resolved.
   *
   * Held so the buttons can be disabled without removing the
   * question: §6.112 says a decision stays pending until it is
   * answered, and a page that cleared it optimistically would
   * show an empty game if the gate refused.
   */
  awaiting: number | null;
  notice: string | null;
}

export const EMPTY_MATCH: MatchState = {
  connection: "connecting",
  seat: null,
  decision: null,
  awaiting: null,
  notice: null,
};

/**
 * Apply one server message.
 *
 * Unknown types return the state unchanged. A newer server that
 * invents a message must not blank an older client's game.
 */
export function reduceMatch(state: MatchState, message: Record<string, unknown>): MatchState {
  const type = typeof message["type"] === "string" ? message["type"] : "";

  switch (type) {
    case "MATCH_HELLO": {
      const seat = asNumber(message["seat"]);
      if (seat === null) return state;
      return { ...state, connection: "open", seat };
    }

    case "DECISION_REQUEST": {
      const decision = asDecision(message);
      if (!decision) return state;
      // A new question clears any answer still in flight: the
      // server only asks once the previous one was taken.
      return { ...state, decision, awaiting: null, notice: null };
    }

    case "DECISION_ACCEPTED": {
      const decisionId = asNumber(message["decisionId"]);
      // Only the one we are waiting on. A receipt for an older
      // decision must not clear the question we are now being
      // asked — the server and Forge write those two from
      // different threads, so they can arrive in either order.
      if (decisionId === null || state.decision?.decisionId !== decisionId) return state;
      return { ...state, decision: null, awaiting: null };
    }

    case "DECISION_CLEARED": {
      // Priority moved to somebody else. Only one player holds it
      // at a time, so a prompt left on screen here is a prompt for
      // a question that no longer exists -- which is what the
      // first build did, and it made the game look broken.
      //
      // The notice goes too: whatever it said was about the
      // question being removed.
      return { ...state, decision: null, awaiting: null, notice: null };
    }

    case "DECISION_REFUSED": {
      const decisionId = asNumber(message["decisionId"]);
      if (decisionId === null) return state;
      // The question STAYS. A refusal means the answer did not
      // take, not that the game moved on — and if it did move on,
      // the next DECISION_REQUEST is what says so.
      return {
        ...state,
        awaiting: null,
        notice: refusalText(asString(message["reason"])),
      };
    }

    default:
      return state;
  }
}

/** §6.104 and friends, in words a player can act on. */
function refusalText(reason: string | null): string {
  switch (reason) {
    case "STALE_STATE":
    case "STALE_DECISION":
      return "The game moved on before that arrived. Have another look.";
    case "DUPLICATE":
      return "That was already answered.";
    case "NOT_PENDING":
      return "There was nothing waiting for an answer.";
    case "WRONG_SEAT":
    case "NOT_YOURS":
      return "That decision is not yours to make.";
    case "UNREACHABLE":
      return "The game did not receive that. It may have stopped.";
    default:
      return "That answer was not accepted.";
  }
}

function asDecision(message: Record<string, unknown>): Decision | null {
  const decisionId = asNumber(message["decisionId"]);
  const actedForSeat = asNumber(message["actedForSeat"]);
  const stateVersion = asNumber(message["stateVersion"]);
  if (decisionId === null || actedForSeat === null || stateVersion === null) return null;
  return {
    decisionId,
    actedForSeat,
    stateVersion,
    kind: asString(message["kind"]) ?? "unknown",
    options: asOptions(message["options"]),
  };
}

function asOptions(value: unknown): DecisionOption[] {
  if (!Array.isArray(value)) return [];
  const options: DecisionOption[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as Record<string, unknown>;
    const actionId = asString(row["actionId"]);
    // An option with no id is one that cannot be chosen. Dropped
    // rather than shown as a button that does nothing.
    if (!actionId) continue;
    options.push({ actionId, label: asString(row["label"]) });
  }
  return options;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  // The server writes ids as JSON numbers, but Kotlin's Long and
  // JavaScript's number disagree about size, so a string form is
  // accepted too rather than becoming NaN silently.
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export interface MatchSocket {
  /** §6.100 — the decision and the action. Nothing else. */
  answer(decisionId: number, actionId: string | null): void;
  close(): void;
}

/**
 * Connect to a match — §6.107.
 *
 * No reconnect loop here yet: §6.111's reconnect is a real
 * sequence (re-authenticate, re-verify participation, re-send the
 * snapshot and the still-valid pending interaction) and the
 * server performs all of it on a fresh connection. Reloading the
 * page does exactly that today, which is honest; a silent
 * auto-reconnect that skipped a step would be the dangerous
 * version.
 */
export function connectMatch(
  url: string,
  onState: (apply: (previous: MatchState) => MatchState) => void,
  factory: (url: string) => WebSocket = (u) => new WebSocket(u),
): MatchSocket {
  const socket = factory(url);

  socket.onmessage = (event) => {
    const parsed = parse(event.data);
    if (!parsed) return;
    onState((previous) => reduceMatch(previous, parsed));
  };
  socket.onclose = () => onState((previous) => ({ ...previous, connection: "closed" }));
  socket.onerror = () => onState((previous) => ({ ...previous, connection: "closed" }));

  return {
    answer(decisionId, actionId) {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send(
        JSON.stringify(
          // A null action is a PASS, and it is sent explicitly
          // rather than by omitting the field, so "I choose to do
          // nothing" and "this message lost a field" are not the
          // same message.
          { type: "DECISION_RESPONSE", decisionId, actionId },
        ),
      );
    },
    close() {
      socket.close();
    },
  };
}

function parse(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as unknown;
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
