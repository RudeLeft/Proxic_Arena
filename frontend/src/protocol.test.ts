import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseEnvelope, makeEnvelope, PROTOCOL_VERSION } from "./protocol";

const FIXTURES = join(__dirname, "..", "..", "protocol", "fixtures");

describe("protocol envelope", () => {
  // PHASE_01 1.33 -- the SAME files the Kotlin suite parses.
  it("parses every canonical fixture", () => {
    const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const result = parseEnvelope(readFileSync(join(FIXTURES, f), "utf8"));
      expect(result.ok, `${f} failed to parse`).toBe(true);
      if (result.ok) {
        expect(result.envelope.protocolVersion).toBe(PROTOCOL_VERSION);
        expect(result.envelope.type.length).toBeGreaterThan(0);
        expect(result.envelope.messageId.length).toBeGreaterThan(0);
      }
    }
  });

  it("refuses a protocol version mismatch instead of interpreting it", () => {
    const r = parseEnvelope(
      JSON.stringify({ protocolVersion: 99, type: "PING", messageId: "x", payload: {} }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("PROTOCOL_VERSION_MISMATCH");
  });

  it("refuses a message with no identity", () => {
    // messageId is what duplicate and stale rejection key on.
    const r = parseEnvelope(
      JSON.stringify({ protocolVersion: 1, type: "PING", payload: {} }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("MALFORMED_MESSAGE");
  });

  it("refuses malformed JSON", () => {
    const r = parseEnvelope("{not json");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errorCode).toBe("MALFORMED_MESSAGE");
  });

  it("round-trips what it builds", () => {
    const sent = makeEnvelope("PING");
    const r = parseEnvelope(JSON.stringify(sent));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.envelope.messageId).toBe(sent.messageId);
  });
});
