// Phase 10 -- the "nothing jumps" check (P10-R1), kept from A-01's audit.
//
// Replays Mechanics Lab games' boards into a real game page, one board
// after another, and records where every card is drawn on every frame
// (whatever element draws it: on the table, in a hand, being cast, its
// flight, its stack entry, a leaving ghost). scripts/check-jumps.py then
// follows each card and lists every jump, pop-in and unseen move.
//
// Not part of the browser suite: it needs a REAL window (headless Edge
// drops frames by itself, BATTLEFIELD_RENDERING.md §6) and a folder of Lab
// traces. Run against the local stack on :8080:
//
//   python -I scripts/check-<scenario>.py <jar> <res> <traces>/<name>.jsonl
//   AUDIT_DIR=<traces> JUMPS_OUT=<out> npx playwright test -c playwright.jumps.config.ts --headed
//   python -I scripts/check-jumps.py <traces> <out>
//
// JUMPS_ONLY=<regex> picks traces; JUMPS_CLIPS='[{"trace":"x","seat":1,"board":6}]'
// instead films those boards at a tenth of the speed, a screenshot every
// 250 ms, into <out>/clips/. A clip's "more": N films the N boards after it
// too, each "every" shots after the one before, or at the shots in "at"
// (spec 0062: a whole payment, the last boards a moment apart).
import { expect, test, type Page, type WebSocketRoute } from "@playwright/test";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { secondPassword, secondUser, signIn, signInAs } from "../../e2e/helpers";
import { clearEverything, sharedDeck, startAMatch } from "../../e2e/match-helpers";

const AUDIT = process.env.AUDIT_DIR!;
const OUT = process.env.JUMPS_OUT!;
const ONLY = process.env.JUMPS_ONLY ? new RegExp(process.env.JUMPS_ONLY) : null;

type Snap = { seat: number; state: Record<string, unknown> };

/** Each trace's boards for one seat, only those that change what is seen. */
function boards(file: string, seat: number): Snap[] {
  const out: Snap[] = [];
  let prev = "";
  for (const line of readFileSync(join(AUDIT, file), "utf-8").split("\n")) {
    let r: { frame?: { type?: string; seat?: number; state?: Record<string, unknown> } };
    try {
      r = JSON.parse(line) as typeof r;
    } catch {
      continue;
    }
    const f = r.frame;
    if (f?.type !== "MATCH_SNAPSHOT" || f.seat !== seat || !f.state) continue;
    const s = f.state as Record<string, unknown> & { players: Record<string, unknown>[] };
    const sig = JSON.stringify([
      s.battlefield,
      s.hand,
      s.graveyard,
      s.exile,
      s.stack,
      s.otherHands,
      s.casting,
      s.players.map((p) => [p.life, p.handCount, p.libraryCount, p.poison, p.counters]),
      // Spec 0062 -- a payment step can change nothing else (a creature
      // chosen for convoke is tapped only at the end).
      s.payments,
    ]);
    if (sig === prev) continue;
    prev = sig;
    out.push({ seat, state: s });
  }
  return out;
}

// Runs in the page: every frame, what changed about each drawn card.
function recorder() {
  type Row = Record<string, unknown>;
  const w = window as unknown as { __rec: Row[]; __mark: string; __last: Map<string, string> };
  w.__rec = [];
  w.__mark = "";
  w.__last = new Map();
  let before = 0;
  const tick = (t: number) => {
    if (before && t - before > 40)
      w.__rec.push({ t: Math.round(t), m: w.__mark, id: "__gap", gap: Math.round(t - before) });
    before = t;
    const seen = new Set<string>();
    const board = document.body;
    if (board) {
      // Every element that draws a card: on the table, in a hand, the
      // card being cast, its flight, a stack entry, a leaving ghost.
      for (const el of board.querySelectorAll<HTMLElement>(
        "[data-object-id], [data-ghost-of], .gs-cast-leaving[data-card]",
      )) {
        const ghost = el.dataset.ghostOf;
        const id = ghost
          ? `ghost:${ghost}`
          : el.classList.contains("gs-cast-leaving")
            ? `flight:${el.dataset.card}`
            : el.classList.contains("gs-cast")
              ? `cast:${el.dataset.objectId}`
              : (el.dataset.objectId ?? "");
        if (!id) continue;
        const key = seen.has(id) ? `${id}#${seen.size}` : id;
        seen.add(key);
        const r = el.getBoundingClientRect();
        let o = 1;
        for (let e: HTMLElement | null = el; e && e !== board; e = e.parentElement) {
          o *= Number(getComputedStyle(e).opacity);
        }
        const img = el.querySelector("img");
        const row = {
          x: Math.round(r.x + r.width / 2),
          y: Math.round(r.y + r.height / 2),
          w: Math.round(r.width),
          h: Math.round(r.height),
          o: Math.round(o * 100) / 100,
          z: el.dataset.zone ?? "",
          c: el.dataset.controller ?? "",
          f: el.dataset.face ?? "",
          p: img?.getAttribute("src")?.slice(-48) ?? "",
          n: el.dataset.count ?? "",
        };
        const text = JSON.stringify(row);
        if (w.__last.get(key) !== text) {
          w.__last.set(key, text);
          w.__rec.push({ t: Math.round(t), m: w.__mark, id: key, ...row });
        }
      }
    }
    for (const key of [...w.__last.keys()]) {
      if (!seen.has(key)) {
        w.__last.delete(key);
        w.__rec.push({ t: Math.round(t), m: w.__mark, id: key, gone: true });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Wait until nothing that ends is still moving (looping glows don't count). */
async function settled(page: Page) {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity)
          .length === 0,
      undefined,
      // Phase 10 A-13: a combat damage step's fights play one at a time,
      // for several seconds; wait for them, as a player watching would.
      { timeout: 12_000, polling: 50 },
    )
    .catch(() => undefined);
  await page.waitForTimeout(120);
}

test("record every Lab board, frame by frame", async ({ browser }) => {
  test.setTimeout(6 * 3_600_000);
  mkdirSync(OUT, { recursive: true });
  const pages: { page: Page; client: WebSocketRoute | null; seat: number | null; name: string }[] =
    [];
  for (const who of ["host", "guest"]) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    if (who === "host") await signIn(page);
    else await signInAs(page, secondUser, secondPassword);
    await clearEverything(page);
    const entry = {
      page,
      client: null as WebSocketRoute | null,
      seat: null as number | null,
      name: who,
    };
    await page.routeWebSocket("**/ws/matches/**", (ws) => {
      entry.client = ws;
      const server = ws.connectToServer();
      server.onMessage((m) => {
        if (typeof m === "string" && m.includes('"MATCH_SNAPSHOT"')) {
          entry.seat = (JSON.parse(m) as { state: { seat: number } }).state.seat;
          return;
        }
        if (typeof m === "string" && (m.includes('"DECISION_') || m.includes('"MATCH_ASKING"')))
          return;
        ws.send(m);
      });
      ws.onMessage((m) => server.send(m));
    });
    pages.push(entry);
  }
  const [host, guest] = pages as [(typeof pages)[0], (typeof pages)[0]];
  const deck = await sharedDeck(
    host.page,
    guest.page,
    join(process.cwd(), "..", "Test Deck", "ci-deck.zip"),
  );
  await startAMatch(host.page, guest.page, deck, { settle: false });
  await expect
    .poll(() => host.seat !== null && guest.seat !== null, { timeout: 300_000 })
    .toBe(true);
  for (const p of pages) await p.page.evaluate(recorder);

  // Slow-motion mode: JUMPS_CLIPS='[{"trace":"x","seat":1,"board":6}]' --
  // the boards up to it at speed, then that one at a tenth of the speed,
  // a screenshot every 250 ms.
  if (process.env.JUMPS_CLIPS) {
    const clips = JSON.parse(process.env.JUMPS_CLIPS) as {
      trace: string;
      seat: number;
      board: number;
      shots?: number;
      more?: number;
      every?: number;
      at?: number[];
    }[];
    let rev = 500_000;
    for (const clip of clips) {
      const p = pages.find((x) => x.seat === clip.seat)!;
      const list = boards(`${clip.trace}.jsonl`, clip.seat);
      for (let i = Math.max(0, clip.board - 4); i < clip.board; i++) {
        p.client!.send(
          JSON.stringify({
            type: "MATCH_SNAPSHOT",
            state: { ...list[i]!.state, stateRevision: ++rev },
          }),
        );
        await p.page.waitForTimeout(60);
        await settled(p.page);
      }
      const cdp = await p.page.context().newCDPSession(p.page);
      await cdp.send("Animation.enable");
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 0.1 });
      const dir = join(OUT, "clips", `${clip.trace}-s${clip.seat}-b${clip.board}`);
      mkdirSync(dir, { recursive: true });
      await p.page.screenshot({ path: join(dir, "000.jpg"), type: "jpeg", quality: 60 });
      p.client!.send(
        JSON.stringify({
          type: "MATCH_SNAPSHOT",
          state: { ...list[clip.board]!.state, stateRevision: ++rev },
        }),
      );
      // The shot before which each later board is sent: every `every` shots,
      // or `at` (several at one shot: boards that came a moment apart).
      const sendAt = Array.from(
        { length: clip.more ?? 0 },
        (_, i) => clip.at?.[i] ?? (i + 1) * (clip.every ?? 24),
      );
      let sent = 0;
      for (let k = 1; k <= (clip.shots ?? 24); k++) {
        while (sent < sendAt.length && sendAt[sent]! <= k) {
          sent += 1;
          const later = list[clip.board + sent];
          if (later) {
            p.client!.send(
              JSON.stringify({
                type: "MATCH_SNAPSHOT",
                state: { ...later.state, stateRevision: ++rev },
              }),
            );
            await p.page.waitForTimeout(30);
          }
        }
        await p.page.waitForTimeout(250);
        await p.page.screenshot({
          // Three digits: a clip of 100 or more shots read in name order
          // put shots 100-109 between 10 and 11 (A-13's fight looked
          // interrupted by its own ending).
          path: join(dir, `${String(k).padStart(3, "0")}.jpg`),
          type: "jpeg",
          quality: 60,
        });
      }
      await cdp.send("Animation.setPlaybackRate", { playbackRate: 1 });
      await cdp.detach();
      await settled(p.page);
    }
    return;
  }

  const traces = readdirSync(AUDIT)
    .filter((f) => f.endsWith(".jsonl") && (!ONLY || ONLY.test(f)))
    .sort();
  const index: Record<string, unknown>[] = [];
  let revision = 100_000;
  for (const trace of traces) {
    // Both pages at once, each its own seat's boards of the same game.
    await Promise.all(
      pages.map(async (p) => {
        const list = boards(trace, p.seat!);
        const file = join(OUT, `${trace.replace(/\.jsonl$/, "")}.seat${p.seat}.jsonl`);
        writeFileSync(file, "");
        for (const [i, snap] of list.entries()) {
          const mark = `${i}`;
          await p.page.evaluate((m) => {
            (window as unknown as { __mark: string }).__mark = m;
          }, mark);
          p.client!.send(
            JSON.stringify({
              type: "MATCH_SNAPSHOT",
              state: { ...snap.state, stateRevision: ++revision },
            }),
          );
          await p.page.waitForTimeout(60);
          await settled(p.page);
          const rows = await p.page.evaluate(() =>
            (window as unknown as { __rec: unknown[] }).__rec.splice(0),
          );
          appendFileSync(
            file,
            rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""),
          );
        }
        index.push({ trace, seat: p.seat, boards: list.length });
      }),
    );
    writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 1));
  }
});
