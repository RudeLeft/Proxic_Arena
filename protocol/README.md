# Protocol

The wire contract between the browser and the Arena Server.

`PHASE_01` §1.31–§1.33. Phase 1 defines **infrastructure messages
only** — no Magic concepts. Game messages arrive in Phase 6.

## Why fixtures exist

`fixtures/` holds canonical JSON for every message type. **Both the
Kotlin and the TypeScript test suites parse the same files.** If one
side's model drifts from the other, a test fails rather than a game
breaking at runtime.

## Envelope

Every message carries:

```text
protocolVersion   a mismatch fails loudly, it is never interpreted
type              what this message is
messageId         identity; duplicate/stale rejection depends on it
payload           type-specific
```

`messageId` is present from the first infrastructure message on
purpose. Phase 0A's decision gate rejects duplicate and stale
responses **by identity**, and proved that removing those guards let
203 answers in a single game be consumed as the answer to a question
they were not sent for. Identity has to exist before it can be
checked.

## Rules that outlive Phase 1

- Client behaviour must never depend on parsing human-readable text
  (§1.34, AGENTS PROTO-006). Branch on `errorCode`, never on `detail`.
- Object ids crossing this boundary must be **typed** — `card:51`,
  `stack:3` — because Forge's card and stack id spaces overlap
  (Phase 0A P0A-F).
