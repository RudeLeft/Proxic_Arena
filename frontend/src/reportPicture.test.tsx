// @vitest-environment jsdom

// Spec 0086, Amendment 2 (owner 2026-11-14) -- the problem report's picture
// of the screen is a JPEG (a board full of card art was over the server's
// limit as a PNG); the server takes up to 5 MB on that route (LimitsTest,
// AdminApiTest).

import { act, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const shots = vi.hoisted(() => ({
  jpeg: vi.fn(() => Promise.resolve("data:image/jpeg;base64,/9j/4AAQ")),
  png: vi.fn(() => Promise.resolve("data:image/png;base64,iVBORw0KGgo")),
}));
vi.mock("html-to-image", () => ({ toJpeg: shots.jpeg, toPng: shots.png }));

import { ReportButton, SCREEN_QUALITY } from "./ReportDialog";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  shots.jpeg.mockClear();
  shots.png.mockClear();
});

describe("the report's screen picture", () => {
  it("is taken as a JPEG at a quality that looks the same, never a PNG", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version: "x" }), { status: 200 }))),
    );
    const c = render(
      <MemoryRouter>
        <ReportButton place="header" />
      </MemoryRouter>,
    ).container;
    await act(() => {
      fireEvent.click(c.querySelector("button")!);
      return Promise.resolve();
    });
    expect(shots.png).not.toHaveBeenCalled();
    expect(shots.jpeg).toHaveBeenCalledTimes(1);
    const options = (shots.jpeg.mock.calls[0] as unknown as [Element, { quality: number }])[1];
    expect(options.quality).toBe(SCREEN_QUALITY);
    expect(SCREEN_QUALITY).toBeGreaterThanOrEqual(0.9);
  });
});
