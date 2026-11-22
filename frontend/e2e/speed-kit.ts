// The real-game speed kit (PHASE_11 P11-C1): the probes and the simple bot
// of spec 0095's match-speed.spec.ts, moved here unchanged so the redraw and
// wire measures (frontend/tools/measure/) play and time the same game.
//
// The recorder is put in the page before its own scripts (addInitScript):
// every frame interval, and every React commit with how many components
// rendered and whether the game screen and each plate were among them.

import { expect, type CDPSession, type Page } from "@playwright/test";
import { clickNow, clickUnlessCombat, handCards, passOrAct } from "./match-helpers";

/** The table is "big" from this many permanents (both sides). */
export const BIG = 28;
export const CREATURES =
  /^(Llanowar Elves|Grizzly Bears|Centaur Courser|Steel Leaf Champion|Thornhide Wolves|Colossal Dreadmaw)/;

// --- the recorder, put in the page before its own scripts -------------------------------------

export const RECORDER = `(() => {
  const P = (window.__speed = { frames: [], commits: [], walk: false });
  let last = 0;
  const tick = (t) => {
    if (last) P.frames.push(t - last);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // Function, class, forwardRef, memo and simple memo components.
  const COMPONENT = new Set([0, 1, 11, 14, 15]);
  const firstHost = (fiber) => {
    let f = fiber.child;
    while (f && f.tag !== 5) f = f.child;
    return f ? f.stateNode : null;
  };
  const walk = (root) => {
    let n = 0;
    const hosts = new Set();
    const stack = [root];
    while (stack.length) {
      const f = stack.pop();
      if (COMPONENT.has(f.tag) && (f.flags & 1) === 1) {
        n++;
        const el = firstHost(f);
        if (el && el.classList) hosts.add(el);
      }
      // A subtree this commit did not touch: its flags are stale.
      if (f.alternate && f.child === f.alternate.child) {
        if (f.sibling) stack.push(f.sibling);
        continue;
      }
      if (f.sibling) stack.push(f.sibling);
      if (f.child) stack.push(f.child);
    }
    let game = false;
    let seats = 0;
    for (const el of hosts) {
      if (el.classList.contains("gs-screen")) game = true;
      if (el.classList.contains("gs-seat")) seats++;
    }
    return [n, game ? 1 : 0, seats];
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    renderers: new Map(),
    supportsFiber: true,
    isDisabled: false,
    inject(r) {
      this.renderers.set(1, r);
      return 1;
    },
    checkDCE() {},
    onScheduleFiberRoot() {},
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    onCommitFiberRoot(_id, root) {
      P.lastCommit = performance.now();
      if (!P.walk) return;
      try {
        P.commits.push(walk(root.current));
      } catch {
        P.commits.push([-1, 0, 0]);
      }
    },
  };
})();`;

export interface Probe {
  page: Page;
  cdp: CDPSession;
  frame: string;
  updates: number;
}

export async function probe(page: Page, cpu: number): Promise<Probe> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const { frameTree } = await cdp.send("Page.getFrameTree");
  const p: Probe = { page, cdp, frame: frameTree.frame.id, updates: 0 };
  return p;
}

/** Every message the match socket brings is a game update. */
export function countUpdates(page: Page, into: () => Probe | undefined) {
  page.on("websocket", (ws) => {
    if (!ws.url().includes("/ws/matches/")) return;
    ws.on("framereceived", () => {
      const p = into();
      if (p) p.updates++;
    });
  });
}

export async function scriptMs(p: Probe) {
  const { metrics } = await p.cdp.send("Performance.getMetrics");
  const get = (name: string) => metrics.find((m) => m.name === name)?.value ?? 0;
  return { script: get("ScriptDuration"), task: get("TaskDuration") };
}

export const percentile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0;
};
export const r1 = (x: number) => Math.round(x * 10) / 10;

// --- a simple bot -------------------------------------------------------------------------------

// The page's own JavaScript is what is timed, and the test's locators run in
// the page too: plain CSS here, never a role locator (which walks the page's
// accessibility tree on every look) -- so these are match-helpers' own
// steps, with the game screen found by its class.
export const matchPanel = (page: Page) => page.locator("section.gs-screen");

export async function discardIfAsked(page: Page): Promise<boolean> {
  const panel = matchPanel(page);
  if ((await panel.locator("button.gs-act-discard").count()) === 0) return false;
  const ready = panel.locator("button.gs-act-discard:not(:disabled)");
  if ((await ready.count()) === 0)
    await clickNow(
      page.locator('[data-zone="viewer:hand"][data-choosable="true"]:not([data-picked="true"])'),
    );
  await clickNow(ready);
  return true;
}

export async function passCombat(page: Page): Promise<void> {
  const panel = matchPanel(page);
  if ((await panel.locator("button.gs-act-combat.gs-act-waiting").count()) > 0)
    await page.keyboard.press("Escape");
  await clickNow(panel.locator("button.gs-act-combat"));
}

export async function attackWithAll(page: Page): Promise<boolean> {
  const panel = matchPanel(page);
  const all = panel.locator("button.gs-act-all");
  if ((await all.count()) === 0) return false;
  await clickNow(all);
  const life = page.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
  await expect(life, "the other player can be pointed at").toBeVisible({ timeout: 5_000 });
  await clickNow(life);
  await expect(panel.locator("button.gs-act-combat:not([disabled])")).toContainText("Attack with", {
    timeout: 30_000,
  });
  return true;
}

/** One pass for one page: a land, a creature, a pass; never an attack. */
export async function step(page: Page, cast = true): Promise<void> {
  await page.mouse.move(0, 0).catch(() => undefined);
  const panel = matchPanel(page);
  if (await discardIfAsked(page)) return;
  const kind =
    (await panel
      .locator(".gs-combat")
      .getAttribute("data-kind", { timeout: 200 })
      .catch(() => null)) ?? "";
  if (kind) {
    await passCombat(page);
    return;
  }
  const act = panel.locator(
    "button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)",
  );
  if ((await act.count()) > 0) {
    const hand = page.locator('[data-zone="viewer:hand"][data-choosable="true"]');
    const land = hand.filter({ hasText: /^Forest/ });
    if ((await land.count()) > 0) return clickNow(land);
    const spell = castable(page);
    if (cast && (await spell.count()) > 0) {
      await clickNow(spell);
      const popup = page.locator(".gs-popup .gs-option");
      if ((await popup.count()) > 0) await clickNow(popup);
      return;
    }
    return clickNow(act);
  }
  const listed = panel.locator(".gs-question li button, .gs-win li button");
  if ((await listed.count()) > 0) return clickUnlessCombat(listed);
  const board = panel.locator('.bf-cards button[data-choosable="true"]');
  if ((await board.count()) > 0) return clickUnlessCombat(board);
  await clickNow(passOrAct(page));
}

export const castable = (page: Page) =>
  page
    .locator('[data-zone="viewer:hand"][data-choosable="true"]')
    .filter({ hasText: CREATURES })
    .and(page.locator(':not([data-unpayable="true"])'));

export async function drive(pages: Page[], ms: number, until?: () => Promise<boolean>) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (until && (await until())) return;
    for (const p of pages) await step(p, false);
    await pages[0]!.waitForTimeout(150);
  }
}

export const over = (page: Page) =>
  page
    .locator("#gs-over-text")
    .textContent({ timeout: 200 })
    .then((t) => (t ?? "").trim().length > 0)
    .catch(() => false);

/** The host's own move, with nothing in combat. */
export async function hostsMove(host: Page) {
  const panel = matchPanel(host);
  return (
    (await panel
      .locator("button.gs-act:not(.gs-act-combat):not(.gs-act-cancel):not(.gs-act-discard)")
      .count()) > 0 && (await panel.locator(".gs-combat").count()) === 0
  );
}

export async function hoverHand(page: Page) {
  const points = await handCards(page).evaluateAll((els) =>
    els.map((e): [number, number] => {
      const r = e.getBoundingClientRect();
      return [r.x + r.width / 2, r.y + Math.min(40, r.height / 3)];
    }),
  );
  points.sort((a, b) => a[0] - b[0]);
  for (const seq of [points, [...points].reverse()])
    for (const [x, y] of seq) {
      await page.mouse.move(x, y, { steps: 12 });
      await page.waitForTimeout(250);
    }
  await page.mouse.move(960, 500, { steps: 8 });
}

/** The host's creatures that can attack: [power, button] for each card (a pile counts each). */
export async function attackers(host: Page) {
  return host
    .locator('.bf-cards button[data-controller="viewer"][data-choosable="true"][data-pt]')
    .evaluateAll((els) =>
      els.flatMap((el, i) => {
        const e = el as HTMLElement;
        const power = Number.parseInt(e.dataset["pt"] ?? "0", 10) || 0;
        return Array.from({ length: Number(e.dataset["pile"] ?? 1) }, () => ({ i, power }));
      }),
    );
}

export const theirLife = async (host: Page) =>
  Number(await host.locator(".gs-seat-opponent .gs-life").getAttribute("data-life"));

/** Attack with creatures whose power adds up to less than the guest's life (all, if it does). */
export async function attackLeavingThemAlive(host: Page, life: number): Promise<boolean> {
  const all = await attackers(host);
  if (all.reduce((s, a) => s + a.power, 0) < life) return attackWithAll(host);
  const buttons = host.locator(
    '.bf-cards button[data-controller="viewer"][data-choosable="true"][data-pt]',
  );
  let sum = 0;
  let picked = 0;
  for (const a of [...all].sort((x, y) => y.power - x.power)) {
    if (sum + a.power >= life) continue;
    await clickNow(buttons.nth(a.i));
    sum += a.power;
    picked++;
  }
  if (picked === 0) return false;
  const target = host.locator('.gs-seat-opponent .gs-life[data-choosable="true"]');
  await expect(target).toBeVisible({ timeout: 5_000 });
  await clickNow(target);
  await expect(matchPanel(host).locator("button.gs-act-combat:not([disabled])")).toContainText(
    "Attack with",
    { timeout: 30_000 },
  );
  return true;
}
