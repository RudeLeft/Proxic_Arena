# Phase 0A — P0A-G / P0A-H: decision authority and reconnect

**Sections:** `PHASE_00A` §0A.8, §0A.12 (P0A-G, P0A-H);
`PHASE_00` §0.67, §0.68, §0.69, §0.70, §0.71
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15
**Components:** `DecisionGate.java`, `AdversarialClient.java`

---

## 1. Result — PASSED

```text
[RUN] 3 consecutive games, adversarial clients on both seats,
      attacking a LIVE game through the real boundary

      run 1  PASS  accepted 257  wrong-seat 36  dup 135  staleId 42  staleVer 31  resumes 4  LEAKS 0
      run 2  PASS  accepted 260  wrong-seat 36  dup 132  staleId 42  staleVer 31  resumes 4  LEAKS 0
      run 3  PASS  accepted 270  wrong-seat 38  dup 141  staleId 44  staleVer 33  resumes 4  LEAKS 0
```

Every injected category was rejected, with **exact correspondence**
between what the client sent and what the gate refused:

```text
      wrong-seat sent 35 -> WRONG_SEAT     35
      never-asked id  41 -> STALE_DECISION 41
      old state ver   30 -> STALE_STATE    30
```

The games completed normally with the attacks running throughout, and
no adversarial message ever became an answer.

---

## 2. What the boundary is allowed to know

`PHASE_00 §0.71`. `DecisionGate` knows only:

```text
connection / seat / decision id / state version / decision owner
```

It contains no Magic concepts. It cannot tell a legal target from an
illegal one, and does not try. Rejection is on **ownership, identity
and freshness** — never on content.

The adversarial client attacks through the **same entry point a real
client uses** (`DecisionGate.submit`). There is no privileged test-only
path, per `PHASE_00 §6.6` Layer C and AGENTS TEST-002: a harness that
bypasses the boundary it is testing proves nothing.

It is also exercised against a **live, blocked engine** — the gate sits
inside `chooseSpellAbilityToPlay` and `declareAttackers`, so Forge is
genuinely waiting on a synchronous call while the attacks arrive. That
is the only condition under which §0.68's hazard can occur at all.

---

## 3. The §0.68 hazard is real, and the defence is layered

The important part of this test is not that the guards pass; it is what
happens when they are removed.

### Control A — remove the duplicate ledger only

```text
[RUN] answers LEAKED into a later question : 0
```

**No leak.** Not because duplicates are harmless, but because a second,
independent guard caught them: the accepted-answer slot has capacity 1
and is cleared when a new question is asked, so a late answer is
discarded before the next `ask()` can consume it.

Worth recording plainly — the ledger was **not** the load-bearing part
in this configuration, and a test that only removed the ledger would
have concluded the ledger was unnecessary.

### Control B — remove the ledger *and* the clear-on-new-question

```text
[RUN] answers LEAKED into a later question : 203  <-- SILENT WRONG MOVE
```

With both removed, **203 answers in a single game** were consumed as
the answer to a question they were not sent for. No exception, no
rejection, no log line — the game simply played differently.

That is exactly the failure `PHASE_00 §0.68` describes, reproduced on
demand. It is also why that section insists rejection happen *before*
the synchronous waiter: once a stray value is in the queue, nothing
downstream can tell it apart from a real answer.

**Conclusion for Phase 6:** keep both. They are independent defences
against the same failure, and the controls show each can mask the
other's absence. Document them as a pair so neither is later removed as
redundant.

---

## 4. Reconnect (P0A-H)

```text
[RUN] disconnects 4, reconnects 4, resume requests served 3-4 per game
      games completed normally after every reconnect
```

Behaviour verified:

- A client drops mid-game. **The worker stays alive** and the question
  stands unanswered — a disconnected seat has simply not answered yet.
- On reconnect the gate returns the latest state version and the
  outstanding decision **if that decision belongs to that seat**.
- Play continues and the game reaches a normal outcome.

The old project's trap was explicitly avoided: its first reconnect test
asserted only that a snapshot arrived, which proves nothing because the
relay replays the last snapshot on resume whether or not the match is
alive. Here the assertion is that the **game completes** after the
reconnects, which it does in every run.

`resumes served` is sometimes 3 against 4 reconnects. That is correct,
not a defect: a client that drops while no decision is outstanding for
its seat has nothing to be re-offered, and `resume()` returns null.

---

## 5. A reporting correction worth keeping

The first adversarial run reported:

```text
stale responses sent 56   ->   STALE_DECISION 0
```

Every stale injection used an **already-answered** id, so the duplicate
ledger caught them first and they were counted as `DUPLICATE`. The
rejection was correct; the *evidence* was mislabelled, and would have
supported a false claim that §0.69 was covered.

Fixed by injecting three distinct stale shapes:

```text
(a) already-answered id  -> DUPLICATE        (correct classification)
(b) never-asked id       -> STALE_DECISION   (the real §0.69 branch)
(c) old state version    -> STALE_STATE      (right decision, stale view)
```

Only (b) exercises the branch §0.69 is about. This is the same class of
error as P0A-C's "a targeted spell was cast" versus "the opponent
responded": the counter said something true that did not support the
claim being made.

---

## 6. Recommendations for Phase 6

1. **Typed, server-issued decision ids.** The gate rejects on id
   identity; combined with P0A-F's finding that card and stack id
   spaces overlap, every id crossing the wire needs a kind.
2. **Keep both duplicate defences** — ledger and single-slot
   clear-on-ask (§3).
3. **Reject before the waiter, always.** Not "ignore afterwards".
4. **`state_version` must be server-authoritative and monotonic.** It
   is what makes STALE_STATE detectable at all, and it is cheap.
5. **A dropped seat keeps its decision.** Do not cancel or auto-answer
   on disconnect; the worker outlives the connection.
6. **Reject on ownership, not content.** The transport must never
   acquire a reason to understand the game.

---

## 7. Status

| Test | State |
| --- | --- |
| P0A-A Forge builds | PASSED |
| P0A-B headless two-player game | PASSED 10/10 |
| P0A-C target + stack | PASSED, draw-dependent |
| P0A-D resource inventory | PASSED |
| P0A-E hidden information | PASSED, both halves |
| P0A-F object identity | PASSED + typed-id requirement |
| **P0A-G decision authority** | **PASSED**, all four rejection classes, leak reproduced on removal |
| **P0A-H reconnect** | **PASSED**, game completes after reconnect |
| P0A-K zone coverage | not started (replaces Commander) |
| P0A-J adapter recommendation | pending owner acceptance |

Deferred as scoped: the Mindslaver runtime test (0B.6). §0A.8's
*protocol* requirement — carrying "acted for" separately from
"authorised to answer" — is unaffected by this result and still stands
for Phase 6.
