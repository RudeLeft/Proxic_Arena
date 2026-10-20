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

## Searchable decisions (Phase 6, P6-AG)

Some questions offer too many answers to send. Naming any card
(Pithing Needle, Phyrexian Revoker, Meddling Mage) allows ~34,000
names. Owner decision 2026-10-20: **search, then pick** — the answer
is still one of Forge's options, chosen from results the server sent.

```text
server → browser  DECISION_REQUEST   searchable: true, optionCount: 34334,
                                     options: []   (none sent)
browser → server  DECISION_SEARCH    decisionId, query
server → browser  DECISION_OPTIONS   decisionId, query, total,
                                     options: [{actionId, label}]  (best 50)
browser → server  DECISION_RESPONSE  decisionId, actionId   (as for any question)
server → browser  DECISION_SEARCH_REFUSED  decisionId, reason
```

Rules the server enforces, so a client cannot get round them:

- Only the player being asked may search, and only the question
  outstanding. A search is not an answer: nothing in the game moves.
- **The answer must be a name this player was sent** in a
  `DECISION_OPTIONS`. A guessed id is refused before Forge sees it,
  even when Forge would allow the name.
- Results are ranked exact match, then name-starts-with, then a word
  starts with, then anywhere; case and accents are ignored. `total`
  is how many matched; only the best 50 are sent.
- A query is trimmed and cut to 64 characters.

The worker holds every allowed name in its decision gate and checks
the answer against them as it checks any answer; the list itself is
Forge's (`streamAllFaces` filtered by the effect's own predicate).
