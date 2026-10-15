// The browser half of the Phase 1 infrastructure protocol.
//
// PHASE_01 1.31-1.33. This file and the Kotlin `Protocol.kt` describe
// the SAME wire format, and `protocol.test.ts` parses the SAME
// fixtures the Kotlin suite parses. That is what stops the two sides
// drifting.

/** PHASE_01 1.32. A mismatch fails loudly; it is never interpreted. */
export const PROTOCOL_VERSION = 1;

export interface Envelope {
  protocolVersion: number;
  type: string;
  messageId: string;
  payload: Record<string, string>;
}

export type ParseResult =
  | { ok: true; envelope: Envelope }
  | { ok: false; errorCode: "MALFORMED_MESSAGE" | "PROTOCOL_VERSION_MISMATCH"; detail: string };

/**
 * Parse an inbound frame.
 *
 * Returns a result rather than throwing, and reports a reason CODE
 * rather than a message, because client behaviour must never depend on
 * parsing human-readable text (1.34, AGENTS PROTO-006).
 */
export function parseEnvelope(raw: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, errorCode: "MALFORMED_MESSAGE", detail: "not JSON" };
  }
  if (typeof value !== "object" || value === null) {
    return { ok: false, errorCode: "MALFORMED_MESSAGE", detail: "not an object" };
  }
  const v = value as Partial<Envelope>;
  if (typeof v.type !== "string" || v.type.length === 0) {
    return { ok: false, errorCode: "MALFORMED_MESSAGE", detail: "missing type" };
  }
  if (typeof v.messageId !== "string" || v.messageId.length === 0) {
    // Identity is not optional: duplicate and stale rejection depend
    // on it, and Phase 0A measured what happens without those guards.
    return { ok: false, errorCode: "MALFORMED_MESSAGE", detail: "missing messageId" };
  }
  if (typeof v.protocolVersion !== "number") {
    return { ok: false, errorCode: "MALFORMED_MESSAGE", detail: "missing protocolVersion" };
  }
  if (v.protocolVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      errorCode: "PROTOCOL_VERSION_MISMATCH",
      detail: `expected ${PROTOCOL_VERSION}, received ${v.protocolVersion}`,
    };
  }
  return {
    ok: true,
    envelope: {
      protocolVersion: v.protocolVersion,
      type: v.type,
      messageId: v.messageId,
      payload: v.payload ?? {},
    },
  };
}

export function makeEnvelope(
  type: string,
  payload: Record<string, string> = {},
  messageId: string = crypto.randomUUID(),
): Envelope {
  return { protocolVersion: PROTOCOL_VERSION, type, messageId, payload };
}
