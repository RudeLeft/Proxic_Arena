// CI speed on this machine (P11-B7): every page of every browser the run
// launches gets its CPU slowed by PROXIC_E2E_CPU (Chrome's own
// Emulation.setCPUThrottlingRate, as match-speed's 4x row uses). Off unless
// that variable is above 1; ci/ci-speed.mjs sets it.
//
// Why here: the specs make their own contexts (browser.newContext()), so no
// fixture sees their pages. playwright.config.ts imports this file, and the
// config is loaded in every worker, before the worker's browser is launched;
// the `browser` fixture launches through the same `chromium` object exported
// here, so wrapping its launch reaches every page. A spec that sets its own
// rate (match-speed, bench-scenes) overrides it for its pages.
//
// The six CI-only fixes of 2026-11-15..20 were all timing: a point read and
// clicked after the board moved, a question arriving between a bot's look and
// its click. A laptop is several times faster than a CI runner and hid them.

import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";

const rate = Number(process.env.PROXIC_E2E_CPU ?? "1");
const WRAPPED = Symbol.for("proxic.e2e.cpuSlowdown");

async function slow(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate });
}

function slowEveryPage(browser: Browser) {
  const onContext = (context: BrowserContext) => {
    context.on("page", (page) => void slow(page).catch(() => undefined));
    for (const page of context.pages()) void slow(page).catch(() => undefined);
  };
  browser.on("context", onContext);
  for (const context of browser.contexts()) onContext(context);
}

const holder = chromium as unknown as Record<symbol, boolean>;
if (rate > 1 && !holder[WRAPPED]) {
  holder[WRAPPED] = true;
  const launch = chromium.launch.bind(chromium);
  chromium.launch = async (options) => {
    const browser = await launch(options);
    console.log(`[ci-speed] CPU slowed ${rate}x on every page`);
    slowEveryPage(browser);
    return browser;
  };
}
