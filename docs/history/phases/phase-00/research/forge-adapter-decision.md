# Phase 0A — Forge network architecture and adapter decision

**Sections:** `PHASE_00A` §0A.6 — covering `PHASE_00` §0.12, §0.13, §0.14,
§0.15, §0.16, §0.17, §0.79
**Forge pin:** `forge-2.0.15` — `4ec5f1a2c32fa90ecb983a72b9eb47aa5c5d7676`
**Date:** 2026-10-15

---

# RECOMMENDATION

```text
RECOMMENDED

  Strategy A — Proxic-owned PlayerController adapter,
               built on forge-core + forge-game only.

NOT RECOMMENDED

  Strategy B — reuse Forge's network layer.
               Its protocol is remote invocation of GUI methods over
               Java serialization, it lives entirely in forge-gui, and
               it is HIGH-coupled to Swing/EDT/GuiBase/FModel.

  Strategy C — hybrid.
               The one component worth salvaging (per-viewer view
               objects) already lives in forge-game and is therefore
               available to Strategy A at no cost. Nothing else in
               forge-gui's network stack is reusable without inheriting
               its coupling, so the hybrid collapses into either A or B.
```

The evidence follows.

---

## 1. Forge's current network architecture (§0.14)

```text
[SOURCE] 63 network classes, ALL in forge-gui.
         forge-core : 0
         forge-game : 0
         forge-ai   : 0
```

The path, using real class names from the pinned source:

```text
forge.gamemodes.net.server.FServerManager      host / lobby / sessions
            │
            ├── forge.gamemodes.match.HostedMatch     the GUI's match host
            ├── forge.player.PlayerControllerHuman    the GUI's controller
            │
            ▼
forge.gamemodes.net.GameProtocolHandler        netty ChannelInboundHandler
            │   reflective Method.invoke(...)
            ▼
forge.gamemodes.net.ProtocolMethod             enum, 71 entries
            │
            ▼
forge.gui.interfaces.IGuiGame                  implemented by the CLIENT
```

### What is actually sent

`ProtocolMethod` is an enum of **GUI methods**, not game decisions:

```text
[SOURCE] setGameView, openView, showCombat, showPromptMessage,
         updateButtons, flashIncorrectAction, alertUser,
         enableOverlay, disableOverlay, showManaPool, hideManaPool,
         setPanelSelection, finishGame, afterGameEnd, ...
```

`GameProtocolHandler.channelRead` receives a `GuiGameEvent` carrying a
`ProtocolMethod` plus arguments, looks up a `java.lang.reflect.Method`,
and invokes it on the remote `IGuiGame`. Replies come back through a
`ReplyPool` keyed by index.

So Forge network play is **remote method invocation of a GUI
interface**, carried by Java object serialization
(`CompatibleObjectEncoder`/`Decoder`), dispatched on the Swing event
thread. `flashIncorrectAction` and `enableOverlay` are not game
concepts; they are widget commands.

---

## 2. Coupling classification (§0.15): **HIGH**

```text
[SOURCE] FServerManager imports (64 total) include:

         forge.gui.GuiBase                     GUI singleton
         forge.gui.interfaces.IGuiGame         GUI interface
         forge.gui.util.SOptionPane            a dialog box
         forge.model.FModel                    app model singleton
         forge.player.PlayerControllerHuman    the GUI's controller
         forge.gamemodes.match.HostedMatch     the GUI's match host
         forge.ai.LobbyPlayerAi                the AI opponent
         forge.ai.PlayerControllerAi
         forge.localinstance.properties.ForgePreferences
         forge.gamemodes.match.input.InputSynchronized

[SOURCE] GameProtocolHandler imports forge.gui.FThreads and
         forge.gui.util.SOptionPane, and carries a `runInEdt` flag
         controlling dispatch to the GUI thread.
```

Dependency cost of taking `forge-gui` at all:

```text
[SOURCE] forge-gui/pom.xml depends on:
         forge-ai, netty-all, jUPnP (+support), jetty-client,
         jetty-server, jetty-servlet, xstream, lz4, xmlpull
```

That is: the AI opponent this project explicitly does not want, a second
HTTP server stack alongside Ktor, **UPnP port forwarding** — a home-router
concern that is meaningless behind Docker and Cloudflare Tunnel — and
XStream, a Java serialization library with a long CVE history, reachable
from a network input path.

---

## 3. Why Strategy B fails for Proxic

Independent of taste, four blockers:

1. **The browser cannot speak it.** The wire format is serialized Java
   objects invoking GUI methods. `PHASE_00 §0.45` forbids coupling the
   browser to Forge's protocol anyway, so a translation layer is required
   regardless — which means Strategy B never removes the work it is
   supposed to remove.
2. **It is not headless.** `GuiBase`, `IGuiGame`, `SOptionPane`,
   `FThreads`/EDT dispatch. A headless server would have to implement
   `IGuiGame`'s 71 protocol methods as a fake GUI, which is strictly more
   work than implementing the decisions directly.
3. **It inverts the dependency.** The server drives
   `PlayerControllerHuman` locally and ships *widget commands* outward.
   Proxic needs the opposite: the engine asks a question, we route it to
   whichever human is authorised to answer (`PROTO-004`).
4. **Dependency and update risk.** `forge-gui` is Forge's most
   GUI-coupled module and the most likely to churn. Reflection over an
   enum of GUI method signatures breaks silently on rename
   (AGENTS `VEND-004`).

**§0.16's network strategy proof was not built.** Building it would mean
implementing a fake `IGuiGame` to prove a path we have already shown
cannot carry the browser protocol. Recording the reason rather than
spending the time, per `PHASE_00 §0.81`.

---

## 4. Why Strategy C collapses

The hybrid's premise is that something inside Forge's network stack is
worth reusing behind a Proxic-owned protocol. The obvious candidate is
Forge's per-viewer state model, which already implements
hidden-information filtering.

```text
[SOURCE] GameView        forge-game
         PlayerView      forge-game
         CardView        forge-game
         CombatView      forge-game
         StackItemView   forge-game
```

**All five live in forge-game, not forge-gui.** They are already
available to Strategy A, with no network layer and no GUI dependency.

Once the view objects are removed from the argument, what remains in
`forge-gui`'s network stack is netty transport (we use Ktor), Java
serialization (unusable for a browser), a lobby model (Phase 5 owns it),
and GUI RMI. Nothing survives. The hybrid becomes Strategy A.

---

## 5. Decision surface (§0.12, §0.13)

```text
[SOURCE] PlayerController: 109 abstract declarations, 105 distinct names
[SOURCE] identical to the old pin: 0 added, 0 removed  (186 commits apart)
```

Full matrix: `forge-decision-surface.csv`.

| Category | Methods | Old bridge implemented |
| --- | ---: | ---: |
| CARD_SELECTION | 24 | 7 |
| OTHER | 12 | 7 |
| PAYMENT | 12 | 5 |
| COMBAT | 9 | 8 |
| RANDOM_RESULT | 8 | 0 |
| ORDERING | 6 | 3 |
| HIDDEN_INFORMATION | 6 | 5 |
| PREGAME | 5 | 2 |
| CONFIRMATION | 5 | 0 |
| NAMING | 5 | 0 |
| MANA | 4 | 2 |
| NUMBER_SELECTION | 3 | 0 |
| TARGET_SELECTION | 3 | 1 |
| COLOR_SELECTION | 3 | 0 |
| REPLACEMENT | 2 | 1 |
| VOTING | 1 | 0 |
| MODE_SELECTION | 1 | 1 |
| **Total** | **109** | **42** |

Two observations that matter more than the totals:

- **Combat is essentially done** (8 of 9) and hidden information nearly so
  (5 of 6). The expensive, subtle areas were the ones real play forced.
- **Every CONFIRMATION method was a stub** — `confirmAction`,
  `confirmTrigger`, `confirmPayment`, `confirmReplacementEffect`,
  `confirmStaticApplication`, `confirmBidAction`, and `chooseBinary`.
  Across a year of real games none was reached. That is a useful
  statement about which paths real decks take, and a warning: an
  unimplemented confirmation is exactly the kind of stub Forge's own
  `try/catch` can swallow (AGENTS `STUB-002`).

---

## 6. Scored comparison (§0.17)

`1 = poor, 5 = excellent.`

| Criterion | A: custom controller | B: Forge network | C: hybrid |
| --- | :---: | :---: | :---: |
| Forge update resilience | **4** | 2 | 2 |
| Implementation effort | 3 | 2 | 2 |
| Decision completeness | **4** | 4 | 4 |
| Hidden-information safety | **4** | 3 | 3 |
| Browser-protocol isolation | **5** | 1 | 3 |
| Headless friendliness | **5** | 1 | 2 |
| Debuggability | **4** | 2 | 2 |
| Testability | **5** | 2 | 3 |
| Crash isolation | **5** | 3 | 3 |
| Dependency size | **5** | 1 | 2 |
| GUI coupling | **5** | 1 | 2 |
| Long-term maintenance | **4** | 2 | 2 |
| **Total** | **53** | 24 | 30 |

Evidence for the scores that carry the decision:

- **Update resilience 4 (A).** The `PlayerController` surface was
  byte-identical across 186 upstream commits. That is measured, not
  assumed. Not 5, because one unchanged observation is not a guarantee.
- **Headless 5 (A), 1 (B).** `RUN`: forge-core + forge-game boot headless
  and load 96,916 cards with no GUI classes on the path. `SOURCE`: the
  network stack imports `SOptionPane` and dispatches on the EDT.
- **Dependency size 5 (A), 1 (B).** Two jars versus two jars plus
  forge-ai, netty, jUPnP, jetty, xstream, lz4.
- **Testability 5 (A).** The old project leaves executable tests that
  exercise this exact shape — duplicate/stale/wrong-player rejection,
  reconnect, and a two-seat face-down hidden-information assertion.
- **Hidden-information 4, not 5 (A).** We own the serialization, so we own
  the leak. The old project shipped a filter that asked `canBeShownTo`
  (zone-level) when it needed `canFaceDownBeShownTo` (identity-level).
  Owning it is an advantage only if we ask Forge the right question.

---

## 7. What Strategy A looks like

```text
Browser  ──  Proxic protocol (JSON/WebSocket)  ──  Arena Server (Ktor)
                                                        │
                                                   worker protocol
                                                        │
                                              Forge Worker JVM
                                              ┌──────────────────┐
                                              │ Proxic adapter   │
                                              │  PlayerController│
                                              │  state → DTO     │
                                              │  event translate │
                                              └────────┬─────────┘
                                                       │
                                        forge-game + forge-core (unmodified)
```

Proxic owns everything above the line. Forge is consumed as two jars
built from an untouched upstream checkout, satisfying `PHASE_00 §0.9`'s
preservation requirement with no patches and no reflection.

### Inherited design decisions worth keeping

From the old project, re-validated rather than assumed:

- Implement a controller method when a real run reaches it
  (`STUB-001`) — but make an unreached stub **loud** (`STUB-002`),
  because Forge catches exceptions in places we do not control.
- Build per-viewer DTOs, asking Forge both visibility questions.
- Translate Forge's `GameEvent` bus for presentation only; the snapshot
  stays authoritative.

### What is explicitly still open

- Whether to serialize Forge's `GameView`/`CardView` directly or build
  Proxic DTOs from them (`§0A.7`, `PHASE_00 §0.25`). Strategy A permits
  either; this decision is not yet made.
- Stable object identity (`§0A.12 P0A-F`).
- The worker protocol's exact shape (`§0.72`).

---

## 8. Status

| Item | State |
| --- | --- |
| §0.12 PlayerController audit | **DONE** |
| §0.13 Decision surface matrix | **DONE** — `forge-decision-surface.csv` |
| §0.14 Network architecture | **DONE** |
| §0.15 Coupling classification | **DONE — HIGH** |
| §0.16 Network strategy proof | **NOT BUILT** — reason recorded, §3 |
| §0.17 Three-way scoring | **DONE** |
| §0.79 Decisive recommendation | **DONE — Strategy A** |
| P0A-J | pending owner acceptance |

Next: P0A-B, a headless two-player game through a Strategy A adapter,
which is also what proves §0.22's game-construction object graph.
