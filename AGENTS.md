# AGENTS.md — Proxic Arena operating contract

**Read this file before your first change in any session**, before
inspecting, planning, editing, testing, building or playing.

When the project owner's explicit instruction changes a boundary or
decision below, update the affected rule **in the same change**. This file
is only useful if it describes current reality rather than a snapshot of
it.

Each rule carries an enforcement marker:

```text
_AUTO._     a test or tool can catch a violation
_REVIEW._   caught by a human or agent reading the diff
_USER._     only the project owner may change this
_MANUAL._   only a human can judge it
```

---

## Project locations

```text
CURRENT PROJECT  (build here)
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena

OLD REFERENCE PROJECT  (read only)
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Arena_OLD

SIBLING PROJECT  (read only, permanently separate)
C:\Users\Eric\Desktop\Claude Working Folder\Proxic_Deck_Builder
```

```text
READ OLD
BUILD NEW
```

---

## Current work

**The main build is COMPLETE (version 1.1.0, 2026-10-24).** Phase 0A was
ACCEPTED 2026-10-15 and Phases 1–8 each passed their exit gate; Phase 8
was accepted by the owner 2026-10-24
(`docs/history/phases/phase-08/PHASE_08_EXIT_GATE.md`). The phase papers
are frozen history in `docs/history/phases/`.

**From here, work is one feature at a time** (owner decision
2026-10-22): production work is authorized only on a feature spec the
owner has approved (`docs/features/`, listed in `ROADMAP.md`).
Maintenance that changes no behaviour a player or the owner sees — a
security fix, a dependency refresh, a failing test — needs no spec, but
is still reported and verified as any change is. *(amended 2026-10-22 —
this section was "Current phase".)*

**Approved feature specs:** none open. Done in 1.1.0: 0001, 0002, 0003, 0005 (0004 dropped); in 1.2.0: 0006, 0007, 0008; in 1.3.0: 0009, 0010, 0011, 0012; in 1.4.0: 0013; in 1.5.0: 0014; in 1.6.0: 0015; in 1.7.0: 0016; in 1.8.0: 0017, 0018; in 1.9.0: 0019, 0020; in 1.10.0: 0021; in 1.11.0: 0022; in 1.12.0: 0025; in 1.13.0: 0023, 0024; in 1.15.0: 0026, 0027; in 1.16.0: 0028, 0029, 0030, 0031, 0032; in 1.17.0: 0033 (and 0031 Amendment 1); in 1.18.0: 0034, 0035; in 1.19.0: 0036, 0037; in 1.20.0: 0038; in 1.21.0: 0039.
Update this line when one is approved or done.

**Phases:** large work may still be a phase, locked and closed at an exit
gate as Phases 1–8 were; its document lives at the top level while
active and moves to `docs/history/phases/` at its close. Phase 8 (every
Forge question, answered and proven) closed 2026-10-24.

Read `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` first: it
carries the locked architectural facts (pin, adapter, process model,
typed ids, visibility, bootstrap, resources).

Check this section before implementing anything. If it disagrees with what
you were asked to do, stop and say so.

---

## Document map

| Document | What it is |
| --- | --- |
| `ROADMAP.md` | What is built, what is next, and how new work happens. |
| `CHANGELOG.md` | Plain-English notes per release; the GitHub release carries the same. |
| `docs/features/` | One spec per feature (`README.md` has the template). An owner-approved spec is the authority for its feature, as a locked phase was. |
| `docs/history/phases/phase-NN/` | **Frozen.** The main build's phase documents (specifications, amendments, deliverables, audits, exit gates, research). Never edited (PHASE-002). The code cites them by section, e.g. "PHASE_06 §6.17". Phase 0's **rules** still bind (`PHASE_00_..._SUPERSEDED.md`); Phase 0B's deferred-question triggers still apply (PHASE-004). |
| `docs/operations/` | Installing, updating and rolling back on Unraid; `troubleshooting/` when something misbehaves. |
| `docs/architecture/PHASE_00_ACCEPTED_DECISIONS.md` | **The locked architecture.** Read before any production code. |
| `docs/architecture/OPEN_FORMAT.md` | The only supported play mode. Read before anything format-related. |
| `docs/architecture/RULES_COVERAGE.md` | Who applies each Magic rule (Forge), what Arena enforces on Forge's behalf, every answer Arena gives without asking, and the proof of each. Change it with any change to how a rule is applied. |
| `docs/architecture/DECK_PACKAGE_AND_ART.md` | The Deck Builder ZIP contract and the card-art pipeline. |
| `docs/architecture/BATTLEFIELD_LAYOUT_CONTRACT.md` | Normative battlefield geometry. |
| `docs/architecture/BATTLEFIELD_RENDERING.md` | **How the board is rendered: React DOM + SVG overlays, one renderer.** PixiJS is a measured contingency, not the plan. Supersedes Phase 7 §7.15 (owner decision 2026-10-19, Phase 1 Amendment 3). Read before touching the battlefield. |
| `docs/architecture/AUTHENTICATION.md` | How identity works: hashing, sessions, cookies, CSRF, the admin tool. Read before touching anything in `auth/`. |
| `docs/architecture/AUTHORIZATION.md` | What an identity may do at the HTTP level. |
| `docs/architecture/DECK_DEPOT.md` | Deck ownership, private libraries and sharing. |
| `docs/architecture/DECK_AUTHORIZATION.md` | **The deck access rules.** The reference the lobby and match phases are told to use — `canUseDeck`, not a client's claim. |
| `docs/architecture/MATCH_RUNTIME.md` | How a match launches, runs, ends and fails; restarts; cleanup. |
| `docs/architecture/MATCH_PROTOCOL.md` | The browser ↔ server match wire. Field detail in `protocol/README.md`. |
| `docs/architecture/FORGE_WORKER_RUNTIME.md` | The Forge process: pin, build, launch, handshake, internal protocol, resources. |
| `docs/architecture/MATCH_STATE_VISIBILITY.md` | **Who may see what, decided by Forge.** Read before touching `ViewerSnapshot`. |
| `docs/architecture/MATCH_ACTION_MODEL.md` | How a player acts; selection vs action. |
| `docs/architecture/MATCH_ASSET_AUTHORIZATION.md` | Card pictures during a match: identity, authorization, retrieval. |
| `docs/testing/MECHANICS_LAB_COVERAGE.md` | The card-by-card regression ledger (generated; edit `mechanics-lab-status.json`). |
| `Test Deck/` | Mechanics Lab corpus. Read-only test input. |
| `Proxic_Arena_OLD/` | Reference implementation, bug-history archive, executable evidence. |

---

## FORMAT — the only supported play mode

- **FMT-001 — MUST NOT:** Implement or offer any play mode other than
  **Open Format**: 65-card deck maximum, no more than 4 copies of a
  specific card, unrestricted card pool, 2 players. Commander and
  Two-Headed Giant were removed from SCOPE by owner decision on
  2026-10-15.
  **AMENDED 2026-10-17 (owner decision).** "or plan for" is gone.
  Commander and Two-Headed Giant are now intended FUTURE phases
  (see ROADMAP.md), so the runtime must be designed for them rather
  than merely not blocking them — see FMT-005 for exactly how far
  that goes. What stays forbidden is unchanged: nothing offers,
  exposes or enables either mode today. The preset catalogue has one
  entry, the player count is bounded at 2, and no UI presents a
  choice. _USER to change._
- **FMT-005 — MUST:** Keep multiplayer reachable without rework, and
  stop there. The boundary is the point of this rule: "design for"
  became licence to build Commander inside Phase 6 the moment it was
  left vague.
  **Required:** carry "the player being acted for" separately from
  "the connection authorised to answer" (Phase 0A binding
  constraint); keep seat and team identity representable end to end;
  take decision sequencing from Forge, never from Ktor; keep the
  preset catalogue a server-side list rather than a constant; keep
  player-count bounds configuration rather than an assumption.
  **MUST NOT**, until the phase that owns that format: add a command
  zone, shared life totals, singleton or colour-identity deck rules,
  mulligan variants, or any runtime player count above 2. A seat
  model that can hold four is in scope; a game that seats four is
  not. _USER to change._
  **Note 2026-10-23 (owner, Phase 8 Amendment 3):** the one-copy rule
  for Contraption and Attraction decks (FMT-002) is those Un-set side
  decks' own rule, not a singleton rule for the deck.
- **FMT-002 — MUST:** Enforce deck legality in Proxic, not Forge.
  `DeckFormat.Constructed` is min 60 with **no maximum**; Open Format
  is **max 65**. They are different rules, so the check cannot be
  delegated. Deck-construction legality is format policy; everything
  after the game starts is still Forge's. Open Format: max 65 cards,
  60-65 cards inclusive, max 4 copies of a card, **basic lands
  unlimited**, **no sideboard**. Neither size bound matches Forge's
  Constructed (min 60, no maximum). _REVIEW._
  **AMENDED 2026-10-23 (owner decision, Phase 8 Amendment 3).**
  Contraptions and Attractions (the Un-sets) go to their own small
  decks, sorted by card type as Forge reads the card, and are not in
  the 60-65 or the copy count; each such deck follows Forge's
  Constructed rule: at least 15 Contraptions or 10 Attractions, one
  copy of each. The card pool includes the silver-bordered sets (Forge
  is started with its non-legal cards loaded).
- **FMT-004 — MUST NOT:** Use `DeckFormat.canHaveAnyNumberOf()` as the
  copy-limit exemption test. It exempts basic lands *and* cards
  keyworded "A deck can have any number of cards named CARDNAME"
  (Relentless Rats, Shadowborn Apostle, …). The owner exempted basic
  lands only, so that helper would silently permit a deck nobody
  authorised. Test `getType().isBasicLand()`. _REVIEW._
- **FMT-003 — MUST:** Enumerate playable actions from **every zone
  Forge can offer them from**, not just hand and battlefield. A
  Commander in the command zone was never offered because the
  enumerator never looked there — no error, the game just never cast
  it. Open Format allows any card, so graveyard, exile and library
  actions are all reachable. _REVIEW._

## ISO — Isolation boundaries

- **ISO-001 — MUST NOT:** Modify, rename, delete or build inside
  `Proxic_Arena_OLD`. Read, inspect, compare and copy from it freely.
  _REVIEW._
- **ISO-002 — MUST NOT:** Write into `Proxic_Deck_Builder`. It is a
  permanently separate project handled in its own session; no merge is
  planned or expected. Read and copy freely. _REVIEW._
- **ISO-003 — MUST NOT:** Treat copied code as correct because it worked
  before. Ask whether it still matches current Forge, still matches the
  new architecture, carries a workaround no longer needed, or carries a
  proven safety mechanism worth keeping. _REVIEW._

---

## PHASE — Work discipline

*(amended 2026-10-22, owner decision: the main build is complete and work
is now one approved feature at a time. These were "phase" rules; each
keeps its number and its substance.)*

- **PHASE-001 — MUST:** Check the **Current work** section above before
  implementing. Build only what an owner-approved feature spec or a LOCKED
  phase covers (or maintenance as that section defines it); do not start
  unapproved work because the approved work is blocked or boring.
  _REVIEW._
- **PHASE-002 — MUST NOT:** Silently change an approved feature spec, or
  anything in `docs/history/` — the frozen phase documents are never
  edited at all. Amendments to an approved spec are explicit, dated and
  owner-approved (see `PHASE_00 §0.85`). _USER._
- **PHASE-003 — MUST:** Escalate when reality contradicts a feature spec,
  an architecture document or a frozen phase document's rule, using
  `PHASE_00 §0.81`'s CONFLICT format: requirement, observed reality,
  evidence, impact, options, recommendation, question. Do not silently
  follow the document, and do not silently depart from it. _REVIEW._
- **PHASE-004 — MUST:** Give every deferred item a **trigger** — the
  condition that makes it blocking again — and record it: in the feature
  spec that defers it, or in `ROADMAP.md`. Phase 0B's register is frozen
  with the rest of the history, but its triggers still apply. A deferred
  question with a trigger is engineering; without one it is a bug with a
  long fuse. _REVIEW._
---

## EVID — Evidence discipline

Inherited from `PHASE_00 §0.3–0.5`, and binding on every phase.

- **EVID-001 — MUST:** Distinguish what we know, what we think, and what
  we have actually run. Label material findings
  `UPSTREAM-DOC` / `SOURCE` / `RUN` / `BENCHMARK` / `INFERENCE` / `USER`.
  _REVIEW._
- **EVID-002 — MUST NOT:** Write "Forge supports X" when the evidence is
  "a class related to X exists". An `INFERENCE` may never satisfy a gate
  requiring `RUN`. _REVIEW._
- **EVID-003 — MUST NOT:** Claim a test exercised a branch without
  showing that it did. "The test completed" is not "the test tested it".
  _REVIEW._
- **EVID-004 — MUST NOT:** Carry a prior `RUN` result forward as current
  evidence. Old results set the expectation; current Forge sets the
  answer. Say plainly which results were re-confirmed, which changed, and
  which were accepted without re-running. _REVIEW._
- **EVID-005 — MUST NOT:** Estimate a benchmark. Measure it. _AUTO._

---

## VEND — Forge as upstream

- **VEND-001 — MUST NOT:** Edit vendored Forge source. Proxic behaviour
  belongs in the Proxic-owned adapter, outside the Forge tree. _REVIEW._
- **VEND-002 — MUST:** Stop and ask the owner before applying any Forge
  patch. If approved it must be minimal, isolated, documented in
  `forge_patches/`, and covered by a regression test. _USER._
- **VEND-003 — MUST NOT:** Solve an integration problem by copying a
  Forge class into Proxic and modifying it. Prefer subclassing,
  composition, adapters and published interfaces. _REVIEW._
- **VEND-004 — MUST:** Document every reflective dependency on Forge
  internals: class, member, why, failure behaviour if Forge changes, and
  the test that covers it. Reflection breaks silently across updates.
  _REVIEW._
- **VEND-005 — MUST NOT:** Update the pinned Forge commit silently or as
  a side effect of other work. A Forge update is a deliberate operation
  with a before/after report. Compiling is not compatibility. _USER._
- **VEND-006 — MUST NOT:** Relicense away from GPL-3.0 while the project
  depends on Forge. _USER._

---

## ARCH — Architecture invariants

- **ARCH-001 — MUST NOT:** Call, import or run Forge code from the
  frontend or the Arena Server. Forge lives behind the worker boundary.
  _AUTO._
- **ARCH-002 — MUST NOT:** Implement Magic rules anywhere except Forge.
  No legality, cost, timing, targeting or combat logic in TypeScript,
  Kotlin or Python — including to make a test pass, and including to work
  around an engine defect. _REVIEW._
- **ARCH-003 — MUST NOT:** Create a second source of truth for game
  state. Forge's state is authoritative; everything else is a view.
  _REVIEW._
- **ARCH-004 — MUST NOT:** Let the browser speak Forge's protocol or
  depend on Forge class names, packet shapes or Java object ids.
  _REVIEW._
- **ARCH-005 — MUST NOT:** Put Magic knowledge in the transport layer. It
  may know connections, sessions, seats, decision owners, message ids and
  state versions. It may not know whether a target is legal. _REVIEW._
- **ARCH-006 — MUST NOT:** Parse Scryfall Oracle text into gameplay
  behaviour. Scryfall supplies identity and artwork; Forge supplies rules.
  _REVIEW._

---

## STUB — Forge integration

Bought with real bugs in the old project. Do not re-derive them.

- **STUB-001 — SHOULD:** Implement a controller/adapter method when a real
  run reaches it, not speculatively. An unreached stub is not a bug.
  _REVIEW._
- **STUB-002 — MUST:** Make an unimplemented decision **loud**. Forge
  catches exceptions in places this project does not control:
  `CountersPutEffect.resolve` wraps its `chooseCounterType` call in
  `try/catch`, so one stub silently disabled every counter in the game —
  planeswalkers died on arrival, creatures entered undersized — while
  printing a single line to stderr 48 times. _REVIEW._
- **STUB-003 — MUST:** When something in a real game silently does not
  happen, grep the run's stderr for **Forge's own** diagnostics before
  theorising about engine internals. Two rounds of investigation once
  theorised past a message already in the log. _REVIEW._
- **STUB-004 — MUST:** Confirm a Forge method answers the question you
  are asking, not one with a similar name. `CardView.canBeShownTo` is
  zone-level and returns true unconditionally for the battlefield;
  `canFaceDownBeShownTo` governs whether a viewer may know *what a
  face-down permanent is*. Asking only the first leaked every face-down
  creature's name and power/toughness. Read the method body — a plausible
  name is not evidence. _REVIEW._
- **STUB-005 — SHOULD:** Prefer the simplest correct behaviour over a
  clever one until a real card needs otherwise, and comment the known
  limit when you simplify. _REVIEW._
- **STUB-006 — MUST:** Force rare paths with stacked decks rather than
  hoping for a draw. The old project reached the legend rule with 24×
  Krenko, ETB triggers with 20× Acidic Slime, and morph with 24× Ainok
  Tracker. A singleton corpus reaches none of them reliably. _REVIEW._

---

## HID — Hidden information

Release-blocking. Treat every rule here as security, not presentation.

- **HID-001 — MUST NOT:** Send a viewer information they are not entitled
  to and filter it in the UI. Filtering after transmission is a leak.
  _REVIEW._
- **HID-002 — MUST:** Ask Forge, per viewer, rather than hand-implementing
  visibility rules. Ask **both** visibility questions (STUB-004).
  _REVIEW._
- **HID-003 — MUST:** Assert hidden-information tests from **both** seats.
  A guard that blanks the card for everyone passes a leak-only check and
  is also wrong: a player may look at their own face-down permanents
  (CR 713.4a). Both halves of the asymmetry are requirements. _AUTO._
- **HID-004 — MUST NOT:** Call a hidden-information guard verified by a
  run in which it never fired. A filter that blanks nothing and a filter
  never reached look identical from outside. _REVIEW._
- **HID-005 — MUST:** Consider presentation a leak surface. Zone
  placement, animation timing and card-back choice can disclose what the
  protocol correctly withheld — see Phase 7 §7.12. _REVIEW._

---

## PROTO — Protocol invariants

- **PROTO-001 — MUST:** Give a decision candidate the same id the
  snapshot uses for the same object. The client must never match by name.
  _AUTO._
- **PROTO-002 — MUST:** Send sufficient viewer state **before** an
  interaction that references a newly relevant object. _AUTO._
- **PROTO-003 — MUST:** Keep `object_id` and `action_id` distinct. One
  object may expose several actions; keying options by object id silently
  dropped a card's second ability for months, then became the normal case
  the moment alternative costs landed. _AUTO._
- **PROTO-004 — MUST:** Carry "the player being acted for" separately
  from "the player authorized to answer". Forge's
  `Player.getController()` already routes a controlled player's decisions
  to someone else's controller. _REVIEW._
- **PROTO-005 — MUST:** Reject wrong-player, duplicate and stale
  responses before they reach a synchronous Forge decision. _AUTO._
- **PROTO-006 — MUST NOT:** Make client behaviour depend on parsing
  English prompt text. Prompts are for humans. _REVIEW._
- **PROTO-007 — MUST:** Treat events as presentation hints. The snapshot
  is authoritative; a dropped event costs an animation, never
  correctness, and reconnect rebuilds from snapshot alone. _REVIEW._

---

## UI — Presentation

- **UI-001 — MUST NOT:** Infer a legal action in the browser from card
  type, rules text, zone, mana cost, name or position. Actions come from
  the server. The shortcut `if type == CREATURE: click = attack` is
  prohibited in every form. _REVIEW._
- **UI-002 — MUST:** Keep every action Forge exposes reachable. Never
  silently pick one and hide the rest behind a default. _REVIEW._
- **UI-003 — MUST NOT:** Store generated layout coordinates as a source
  artifact. Layout is a pure function of state and viewport; the owner's
  design intent lives in the constants in the layout contract. _AUTO._
- **UI-004 — MUST:** Render a usable generic fallback for any decision or
  action kind without bespoke UI. Never a dead end. _REVIEW._
- **UI-005 — MUST:** Derive card characteristics from the Forge-supplied
  current values, never printed ones and never a hardcoded list. The old
  client guessed land-ness from basic-land names and put every nonbasic
  land in the wrong row. _REVIEW._

---

## TEST — Verification

- **TEST-001 — MUST NOT:** Claim something works based on a test that
  never exercises it. Check what the scripted driver answers for each
  decision kind, not merely that the run finished. _REVIEW._
- **TEST-002 — SHOULD:** Prefer real end-to-end verification — real
  processes, real sockets, real UI events — over mocks. _REVIEW._
- **TEST-003 — MUST:** Drive the real event path. Calling a handler
  directly is not a click; the old project's headless tests passed while
  real clicks were being swallowed by an overlay. _AUTO._
- **TEST-004 — MUST:** Prove a regression test fails against the
  un-fixed code before trusting it. _REVIEW._
- **TEST-005 — MUST:** Automate UI verification. **This supersedes the old
  project's rule that UI checking was manual-only** — that rule existed
  because nothing here could drive a native Tk window. A browser can be
  driven and screenshotted, and Playwright is in the stack. Layout
  properties, interaction, and hidden-information asymmetry are all
  machine-checkable. _AUTO._
- **TEST-006 — MUST:** Still get the owner's eyes on anything that changes
  what the board looks like. Automation covers correctness, not whether it
  looks right. This comes AFTER TEST-011, never instead of it: the owner
  is judging whether the thing is good, not discovering whether it runs.
  _MANUAL._
- **TEST-007 — MUST:** Prove a viewport test actually changed the
  geometry. A layout test once looped over three window sizes while
  silently rendering the same one; it passed, and a human screenshot
  caught it. _AUTO._
- **TEST-008 — MUST:** Test across card **counts**, not just viewports —
  0, 1, 8, 9, 23, 60 permanents in a zone. The old battlefield fixture
  filled every zone to exactly its capacity and broke on the ninth land.
  _AUTO._
- **TEST-009 — MUST NOT:** Assert that a snapshot arrived when the claim
  is that the game continued. The relay replays the last snapshot on
  resume whether or not the match is alive. _REVIEW._
- **TEST-010 — MUST:** Prove that production **calls** the rule, not only
  that the rule works. A unit test shows a function does what it says and
  says nothing about whether anything invokes it. This has now shipped
  three times: `purgeExpiredSessions()` and `LoginThrottle.evictExpired()`
  at the Phase 3 gate, `RoomDeckWatch` and `RoomRecovery` at the Phase 5
  gate — every one written, tested, green, and wired to nothing. An
  unused class compiles perfectly. Grep for the call site, or drive the
  real system and watch the effect. _REVIEW._
- **FORGE-RULE — MUST:** Let the rules enforce, and let the player
  decide. Owner's framing, 2026-10-18: "we don't want to take decisions
  away from the player, we want the rules to enforce them."

  Where Forge says what is LEGAL, use its answer and never compute a
  rival one — candidates, payability, which abilities can pay a cost.
  Where the rules leave a genuine choice, ask: which land to tap, which
  target, which of a card's abilities. The engine narrows; the person
  picks.

  Forge itself draws this line and is worth copying rather than
  second-guessing. Its human mana input asks for permanents one at a
  time; automatic payment is a BUTTON, implemented by temporarily
  swapping in the AI controller. Its "express mana" rule decides when a
  choice inside one card is immaterial — and stops guessing when the
  amounts differ, the ability is not undoable or renewable, it has a
  sub-ability, the spell tracks mana spent, or the card declares
  `ManaNeededToAvoidNegativeEffect`. Those tests are the rules
  speaking. Reimplementing them is §6.50's second rules engine; the
  first thing it would get wrong is the mana base somebody built a deck
  around. _REVIEW._
- **TEST-011 — MUST:** Verify it myself, by code AND by eye, before
  handing it over. The owner reviews the work; the owner is not the
  detector.

  Written after Phase 6's decision slice shipped four separate faults
  that were each found by the owner playing a game and describing what
  happened: a prompt left on screen for a question that no longer
  existed, a ghost match from before a restart, a room that could not be
  closed, and a game that stopped on an unimplemented interaction with
  the evidence discarded. Every one was findable here. Unit tests were
  green for all four.

  Concretely, before saying something works:

  1. **A test that fails without the fix** (TEST-004). Green on its own
     proves the test runs, not that it bites.
  2. **Drive the real thing.** Not the test suite — the application:
     `scripts/play-a-game.py` for anything Forge decides,
     `frontend/e2e/match.spec.ts` against the local stack for anything a
     player sees. Both run in about a minute and neither needs a second
     person.
  3. **Look at it.** A screenshot that nobody reads is not evidence. For
     a UI change, read the image and say what is in it.
  4. **Say how the claim could have been wrong.** "Tests pass" is not a
     finding; "I removed the guard and three tests failed" is.

  And when something genuinely cannot be verified here — a real
  opponent's judgement, a device not available — say so explicitly in
  the handover rather than letting "done" imply it was checked.
  _REVIEW._

---

## ENV — Environment and build

- **ENV-001 — MUST:** Set toolchain environment variables explicitly in
  the same shell invocation that uses them. A fresh tool call does not
  inherit a variable set earlier in the session. _AUTO._
- **ENV-002 — MUST NOT:** Hardcode one machine's absolute paths, or
  assume Windows path separators, in anything that ships. _REVIEW._
- **ENV-003 — MUST:** Pin dependency versions. No floating `latest` in
  production dependencies or base images. _REVIEW._
- **ENV-004 — MUST NOT:** Write code containing backslash escapes through
  a shell heredoc; heredocs eat them. Use the file-writing tools.
  _REVIEW._

---

## GIT — Repository

- **GIT-001 — MUST NOT:** Commit card artwork. The Mechanics Lab corpus is
  defined by its TXT and CSV, which are versioned; the 275 images
  (~291 MB) are Wizards artwork delivered at runtime and git keeps every
  byte forever. _AUTO._
- **GIT-002 — MUST:** Commit or push only when the owner asks. _USER._
- **GIT-003 — MUST:** Write commit messages that explain *why*, including
  what was tried and rejected. The old project's history is usable as a
  bug archive because of this. _REVIEW._
- **GIT-004 — MUST NOT:** Report a result more favourably than the
  evidence supports. If tests fail, say so with the output; if a step was
  skipped, say so. _REVIEW._

---

## Escalation

Stop and ask the project owner before:

```text
editing upstream Forge
implementing Magic rules outside Forge
adding a second source of game legality
coupling the browser directly to Forge
dropping or adding a supported format
changing the Scryfall / Forge responsibility boundary
discarding a proven safety mechanism from the old project
modifying anything in Proxic_Arena_OLD
changing an approved feature spec, or anything in docs/history/
abandoning process-per-match isolation without evidence
locking geometry that has not been observed rendering
any major architecture decision not covered by an approved feature spec
```

- **ESC-001 — MUST:** Every question for the owner is asked as a prompt —
  the question tool, with the choices, a recommendation and a game
  example in plain English — never only in the text of a reply, where it
  can be missed. That covers decisions, approvals, "which do you
  prefer" and anything waiting on the owner. A reply that ends on a
  question in prose is unfinished. (Owner, 2026-10-22: "Anytime you
  have a question you have to ask it as a prompt … We don't want to miss
  questions.")

---

## The one-line version

```text
Forge decides the game.
The server decides who may act.
The browser decides nothing.
Evidence decides what we claim.
```
