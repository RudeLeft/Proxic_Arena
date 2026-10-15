# Phase 0A — §0A.8A protocol lessons, §0A.9A printing identity, P0A-K zone coverage

**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15

---

# Part 1 — §0A.8A: protocol lessons review

`PHASE_00 §0.63` requires a verdict on each concept the old protocol
established. Source: `Proxic_Arena_OLD/PROTOCOL.md` and the executable
behaviour of the old bridge.

| Concept | Verdict | Reason |
| --- | --- | --- |
| `decision_request` / `decision_response` | **KEEP** | Matches Forge's synchronous controller exactly; P0A-G/H proved the shape works under adversarial load. |
| `choice_type` | **KEEP** | The semantic layer that stopped the client reading English. Phase 7 §7.27 derives interaction mode from it. |
| candidate `kind` (CARD/PLAYER/ABSTRACT) | **KEEP** | Exists because classification-by-guessing produced the "confusing my cards with your cards" bug. |
| `card_id` on a multi-action candidate | **CHANGE** | Keep the *idea*, but generalise: P0A-F proved ids must be **typed** (`card:51`, `stack:3`), because stack-instance ids occupy the same integer range as card ids. |
| `source_id` | **KEEP** | Cheap, and the client needs to know what is acting. |
| stable object ID | **KEEP, with a caveat** | P0A-F: `Card.getId()` is stable for a whole match including zone changes. But CR 400.7's "new object on zone change" is **not** reflected in the id, so new-object-ness must be carried separately if ever needed. |
| `state_version` / `expected_state_version` | **KEEP** | P0A-G showed `STALE_STATE` is only detectable because of it — 30 of 30 stale-view responses caught. Must be server-authoritative and monotonic. |
| resume token | **KEEP** | P0A-H: a dropped seat keeps its decision; the token is what lets it come back without a stranger claiming the seat. |
| semantic event stream | **KEEP, as presentation only** | §6.49. A dropped event costs an animation, never correctness. 9 of 58 Forge event types were translated; that set is a starting point, not a limit. |
| full authoritative snapshot | **KEEP** | 0B.17 measured the old dedup attempt as saving 1 snapshot in 27; it was reverted. Do not re-litigate without measurement. |
| **duplicate ledger + single-slot clear** | **ADD** | New, from P0A-G §3. Two independent guards against the same hazard; removing either alone looks safe, removing both leaked 203 answers. |
| **"acted for" vs "authorised to answer"** | **ADD** | §0A.8. `Player.getController()` routes a controlled player's decisions to a different human; the old bridge could not express it. |
| English prompt text as API | **REMOVE** | Already prohibited (AGENTS PROTO-006); retained only for display. |
| per-match worker protocol shape | **DEFER** | Phase 1 §1.32 fixes `PROTOCOL_VERSION`; the worker-side message set is Phase 6's. |

Two concepts are new rather than carried over, and both came from
running the thing rather than reading the old document.

---

# Part 2 — §0A.9A: Scryfall / Forge printing identity

The boundary holds: Scryfall supplies identity and artwork, Forge
supplies rules (`§0.56`). What needed proving is that
`name + set + collector number` actually resolves.

```text
[RUN] StaticData.getCommonCards()

  Lightning Bolt   name->SLZ   set LEA->LEA   set+num LEA/161 -> LEA/161   OK
  Forest           name->TRK   set KTK->KTK   set+num KTK/266 -> KTK/266   OK
  Shock            name->MSC   set M21->M21   set+num M21/159 -> M21/159   OK

      exact printing resolved: 3/3 for valid input
```

Exact-printing lookup works. The old bridge's gap was never Forge's —
it matched the `[SET:NUM]` tag in a **non-capturing group** and
resolved by name alone.

## The finding: invalid input fails silently

```text
[RUN] asked KTK/261  (Forest in KTK is 266-269; 261 does not exist)
      got  TRK/325   -- a DIFFERENT SET

[RUN] asked ZZZ/999  (set does not exist at all)
      got  SLZ/63
```

**A bad set or collector number does not return null.** Forge quietly
hands back some other printing of the same name.

For gameplay this is harmless — one Lightning Bolt plays like any
other. For Proxic it is not, because the printing is what the player
chose and what their artwork is keyed to:

> **Phase 2 MUST verify that the returned `PaperCard` actually matches
> the requested set and collector number, and treat a mismatch as a
> real import outcome** — surfaced to the player, not swallowed.

This answers `§0.57`'s fallback question with behaviour rather than
intention: the fallback already exists, it is silent, and it must be
detected rather than relied upon.

It also interacts with `DECK_PACKAGE_AND_ART.md` §2.1: the package
ships one image per distinct *name*, so Proxic may hold the right
printing identity but the wrong art for it. Both halves need stating
in the import report.

---

# Part 3 — P0A-K: zone coverage

```text
[RUN] dedicated deck (20x Faithless Looting, Flashback {2}{R})

      run 1  offered Graveyard=79   played Graveyard=5   15 turns
      run 2  offered Graveyard=70   played Graveyard=6   15 turns
      run 3  offered Graveyard=85   played Graveyard=7   15 turns
      run 4  offered Graveyard=88   played Graveyard=7   17 turns
```

**PASSED.** Actions are enumerated and performed from a zone other
than hand or battlefield, reliably, 4/4.

The enumerator now walks `Graveyard, Exile, Command, Library` in
addition to hand and battlefield (AGENTS FMT-003). This generalises
the command-zone-only fix the cancelled Commander work produced, and
Open Format makes it load-bearing: an unrestricted card pool means no
zone can be assumed irrelevant.

## Draw dependence, stated honestly

```text
[RUN] combined acceptance deck, 6 games: graveyard action played 3/6
```

With one deck exercising every test at once, the flashback path
appears about half the time. The claim therefore rests on the
**dedicated** deck, which is reliable; the combined deck is a
convenience, not the evidence.

Same shape as P0A-C. Worth noting the harness now reports it
correctly: a run that completes 13 turns but never reaches a graveyard
action says **"FAIL — zone coverage not exercised"**, where previously
the message chain fell through to "no outcome" and misreported the
cause.

## A trap caught only because stubs are loud

Implementing the discard that Faithless Looting needs, the obvious
override was wrong:

```text
[SOURCE] PlayerController has a 5-arg CONVENIENCE overload of
         chooseCardsToDiscardFrom that delegates to the 6-arg
         ABSTRACT one.
```

Overriding the 5-arg version **compiles cleanly, satisfies
`@Override`, and does nothing** — Forge still calls the abstract 6-arg
method and still hits the stub. It was caught in one run because the
stub announces itself. A silent stub would have made the method look
implemented while the game quietly took a different path.

This is the third distinct bug in Phase 0A traceable to "the thing
that looks right is not the thing Forge calls", after `canBeShownTo`
and `Card.getName()`.
