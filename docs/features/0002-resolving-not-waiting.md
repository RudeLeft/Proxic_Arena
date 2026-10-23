# 0002 — "Resolving…", not "Waiting for" the other player

**Status:** Approved 2026-10-23
**Owner decisions:** 2026-10-23 — while the rules engine is working and
nobody has a question, both players see "Resolving…" (chosen over "The
game is working…" and over leaving it as it was).

## What the player sees

RudeLeft taps Krenko, Mob Boss with 120 Goblins out. While the rules
engine makes the new Goblins, neither player has anything to answer.
Before this spec RudeLeft's screen said "Waiting for Pat" and Pat's said
"Waiting for RudeLeft" — each blaming the other (owner report,
2026-10-23). Now both say **"Resolving Krenko, Mob Boss…"** until the
Goblins arrive, and "Waiting for Pat" appears only while Pat really has a
question in front of them.

## Why the screen got it wrong

Each screen guessed whom it was waiting for from the priority seat and
the top of the stack. Neither says whether anybody is being *asked*: the
player with priority has already answered, and the engine is busy. The
server knows exactly — it holds the one pending question
(`LiveMatch.pending`) — but never told the other player anything except
"nothing is asked of you" (`DECISION_CLEARED`).

## Scope

In:
- A public server message, `MATCH_ASKING`, sent to both players whenever
  the question changes hands: `{seat: N}` when seat N is asked,
  `{seat: null}` when an answer has gone in and nothing is asked yet.
  Re-sent on (re)connect.
- The rail's waiting line: "Waiting for <name>" names the seat being
  asked; when nobody is asked for more than half a second it reads
  "Resolving <top of the stack>…", or "Resolving…" with an empty stack.
  The half second keeps the line from flickering between ordinary
  questions, which follow each other in milliseconds.

Out (and why):
- Making a big board faster. Measured separately (owner approved the
  measurement 2026-10-23); this spec changes words, not speed.
- What is being asked. Only *which seat* — the question itself stays
  with the player it is for (HID-001, PHASE_06 §6.39).

## Rules and boundaries

- **Hidden information (HID-001).** "Who is deciding" is what a player
  across a real table can see. The message carries a seat number and
  nothing about the question. Under Mindslaver it names the seat that
  answers (the authorised seat), which is public: the card says who
  controls the turn.
- **The browser decides nothing.** The screen no longer infers "whose
  move" from priority when the server has told it; the old inference
  remains only for a server that never sends `MATCH_ASKING`.
- **PROTO-006.** No prompt text is parsed; the stack entry's name is
  shown as the viewer is allowed to know it ("Face-down spell" stays
  face-down).
- **No engine name in player text** — "Resolving", not "Forge is
  thinking".

## Acceptance tests

| ID | Test | Evidence it needs |
|---|---|---|
| F-0002-A | Asking seat N tells every participant `MATCH_ASKING {seat: N}`; an accepted answer with nothing new pending tells everyone `{seat: null}`; an answer whose clear lost the race to the next question tells nobody. | server unit (fails without the change) |
| F-0002-B | The reducer keeps the latest `MATCH_ASKING`; unknown before the first. | client unit |
| F-0002-C | The rail: asked seat → "Waiting for <their name>"; nobody asked for 500 ms → "Resolving <top>…"; old inference when never told. | client unit |
| F-0002-D | A real game on the local stack: Krenko with many Goblins, both screens read "Resolving Krenko, Mob Boss…" during the activation, screenshots of both. | browser + owner's eyes |

## Amendments

None.
