// Security headers and CSP in a real browser — PHASE_03 §3.99–§3.103.
//
// The server test proves the headers are SENT. Only a browser proves
// the policy is one the app can actually run under: a CSP that blocks
// the renderer, the WebSocket or the card art passes every unit test
// and breaks the product.

import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { signIn } from "./helpers";

/** Collect anything the browser refused to load or execute. */
function watchViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", (message: ConsoleMessage) => {
    const text = message.text();
    if (/content security policy|refused to (load|execute|connect|frame)/i.test(text)) {
      violations.push(text);
    }
  });
  return () => expect(violations, "the browser refused something").toEqual([]);
}

test("the headers reach the browser on the page itself", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response!.headers();

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  // §3.103 — the relaxation Pixi tried to force. If this ever
  // appears, the policy stopped being worth sending.
  expect(headers["content-security-policy"]).not.toContain("unsafe-eval");
});

test("nothing the app needs is blocked by the policy", async ({ page }) => {
  // The failure this exists for, found by driving the real stack:
  // PixiJS builds its shader sync functions with new Function(), so
  // under this policy the renderer reported Unavailable while every
  // server-side test passed. The fix was the pixi.js/unsafe-eval
  // polyfill, NOT a weaker policy — and this is what notices if the
  // polyfill is ever dropped.
  const assertClean = watchViolations(page);
  await page.goto("/");

  await expect(page.locator(".row").filter({ hasText: "Pixi Renderer" })).toContainText("Ready");
  // The WebSocket is connect-src's real test.
  await expect(page.locator(".row").filter({ hasText: "WebSocket" })).toContainText("Ready");
  assertClean();
});

test("the signed-in pages load under the policy too", async ({ page }) => {
  // Deck pages carry card art and inline React styles — img-src and
  // style-src respectively.
  const assertClean = watchViolations(page);
  await signIn(page);
  await page.goto("/decks");
  await expect(page.getByText("Proxic Deck Builder")).toBeVisible();
  assertClean();
});
