# P5-Y — production multi-user workflow

PHASE_05 §5.229. The last acceptance test, and the only one that
cannot be run from this machine: two real accounts, two real
browsers, the real host, with Cloudflare in between.

**What it has to show:**

```text
create · join · select authorized decks · ready
receive realtime synchronization · prepare valid match setup
```

**Hostname note.** The spec says `arena.barnflix.net`; the server
actually runs at `proxic.barnflix.net`. The spec was written with a
placeholder. Use the real one.

---

## Before you start

**Two independent sessions.** One browser shares cookies between its
own tabs, so two tabs are the *same* player — which is a real rule
(§5.6) and not what this test needs. Use either:

- two devices (best — it also proves the tunnel from two directions), or
- two different browsers, or
- one normal window and one private window.

**Check the build first.** Three places, and they should agree:

```text
https://proxic.barnflix.net/api/version   →  "buildId":"fa0637e…"
Unraid → the container log, first line    →  Proxic Arena 0.1.0 · … · build fa0637e…
Unraid → Docker tab, image revision       →  fa0637e…
```

If `buildId` does not match the latest commit on `main`, stop — you
would be testing the wrong build.

**Check readiness:**

```text
https://proxic.barnflix.net/api/health/ready
→ {"status":"ok","checks":{"dataRoot":"ok","database":"ok","forgeWorker":"ok"}}
```

`forgeWorker` **must** say `ok`. Step 8 cannot work without it, and
the preflight is designed to fail closed rather than pretend.

**Check the migrations landed.** In the container log, after an
update that includes schema changes:

```text
flyway applied=4 target=009
```

Four, because this release carries V006–V009. If it says `applied=0`
and `Current version: 009`, they ran on an earlier start — also fine.

**Both accounts must exist.** On the Unraid console:

```text
docker compose exec arena-server /app/bin/arena-admin list
```

`RudeLeft` and `Pat` should both be `ACTIVE`.

---

## The run

Call the two sessions **A** (RudeLeft, the host) and **B** (Pat).

### 1. Both sign in

Both go to `https://proxic.barnflix.net/play`.

Signed out, you should land on the login form rather than a broken
lobby — that is the auth gate, and it is part of the test.

✅ **Expect:** both reach the lobby after signing in.

### 2. Presence

On **A**, look at **Who is here**.

✅ **Expect:** both names listed, `(you)` beside your own.

> If B is missing, B's socket did not connect. Check for the
> **Disconnected** banner on B, and that the tunnel allows WebSocket
> upgrades on `/ws/user`.

**This is the first realtime check.** Have B reload; A's list should
not change (same player, still one entry). Have B sign out and back
in; A's list should update **without A refreshing**.

### 3. Create

On **A**: click **Host a game**.

✅ **Expect:** "Your game" appears — Open Format · 2 players, Seats
filled **1 of 2**, Seat 1 you (host), and an **Empty seat** marked
*waiting for an invitation*.

✅ **Expect:** no join code appears anywhere. There is none.

### 4. Join, by invitation

On **A**: in **Who is here**, click **Invite** next to Pat.

✅ **Expect on B, without B touching anything:** a banner —
"RudeLeft invited you to a game".

On **B**: click **Accept**.

✅ **Expect on BOTH screens, neither refreshed:** Seats filled
**2 of 2**, and Seat 2 is Pat.

> This is the core of §5.66–§5.70. If B's seat appears on B but not
> on A, realtime is broken in one direction — note which.

### 5. Decks

Both players need a deck they are **authorized** to use.

- **A** already owns decks (the legacy ones).
- **B** needs one. Either B imports their own on `/decks`, or — the
  more interesting path — **A shares a deck with Pat** from `/decks`
  → *view* → **Share this deck** → username `Pat`.

Sharing is better evidence: it proves §5.41 (the selectable library
is owned **plus** shared) and §5.42 (`canUseDeck` decides).

Then on each screen, under **My decks**, click **Use this deck**.

✅ **Expect:** the button becomes **Selected**.

✅ **Expect on B:** a shared deck says *shared by RudeLeft*.

### 6. Deck privacy — look carefully here

On **A**, read Seat 2 (Pat's). On **B**, read Seat 1 (RudeLeft's).

✅ **Expect:** the other player's seat says **"deck chosen"** — *not*
the deck's name.

✅ **Expect:** your own seat shows your deck **by name**.

> This is §5.47, and it was wrong until the exit-gate audit. If you
> can read your opponent's deck name, that is a real finding — say
> so and stop.

### 7. Ready

Before choosing a deck, **Ready** is unusable. After choosing, it
works. Click it on both.

✅ **Expect on each screen:** the *other* player's seat flips to
**ready** on its own, no refresh.

### 8. Prepare the match

**Prepare match** on **A** stays greyed until both are ready. Then
click it.

This is the slow step: the server spawns a Forge worker per deck to
check the decks build. Allow up to a minute.

✅ **Expect:** "The match is prepared and the room is locked. Phase 6
launches it; nothing starts yet."

✅ **Expect on B, without refreshing:** the same message.

✅ **Expect:** **Ready** disappears; **Cancel preparation** appears.

✅ **Expect:** nothing resembling a game starts. That is correct —
Phase 5 stops here by design (§5.91).

> If it refuses: A sees *which* seat needs attention, and the player
> concerned sees *why* on their own screen. That split is §5.101 and
> is deliberate — A is not told the reason.

### 9. Cancel

On **A**: **Cancel preparation**.

✅ **Expect:** back to an open room, both ready ticks cleared, both
deck choices **kept**.

### 10. Clean up

On **A**: **Close room**.

✅ **Expect on B, without refreshing:** "The host closed the room",
and B is back to "No game yet".

---

## Recording the result

Add to `PHASE_05_EXIT_GATE.md`, replacing the P5-Y row:

```text
| production multi-user workflow succeeds | YES — <date>, two accounts
  through proxic.barnflix.net, build <buildId> |
```

Worth noting if you see it:

- anything that needed a refresh when it should not have,
- how long **Prepare match** took,
- whether an opponent's deck **name** was ever visible.

---

## The automated alternative

§5.229 accepts a Playwright run as evidence. The existing suite can
be pointed at production:

```bash
PROXIC_E2E_URL=https://proxic.barnflix.net npx playwright test e2e/lobby.spec.ts e2e/match-setup.spec.ts
```

**Read this before running it.** It is not read-only. Against
production it will, using the real `RudeLeft` and `Pat` accounts:

```text
create and close rooms
import a deck, share it, and DELETE it afterwards
send chat lines to the global channel
leave whatever room those accounts are currently in
```

The deck deletion is the part to weigh: `clearEverything` removes
**every deck the account owns** at the start and end of the run.
Against production that includes the legacy decks.

Do not run it against production until that is acceptable, or until
the specs are pointed at throwaway accounts. The manual walkthrough
above has none of these side effects beyond one room and one share.
