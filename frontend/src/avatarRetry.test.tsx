// @vitest-environment jsdom

import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATARS, AVATAR_RETRY_MS, Avatar, PAGE_RECONNECTED, avatarUrl } from "./avatars";

// Spec 0060 F-0060-A: a picture that fails once shows by itself when the
// server answers again, without a reload; the default shows meanwhile,
// never a broken icon.

/** Stands in for the browser's background loader, which jsdom never runs. */
class FakeImage {
  static made: FakeImage[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  constructor() {
    FakeImage.made.push(this);
  }
}

const DEFAULT = avatarUrl(null);
// A picture fetched over the network (not inlined into the page).
const NAME = AVATARS.find((name) => !avatarUrl(name).startsWith("data:")) ?? "avatar-01";
const URL_ = avatarUrl(NAME);

function picture(container: HTMLElement): HTMLImageElement {
  return container.querySelector("img.pa-avatar") as HTMLImageElement;
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeImage.made = [];
  vi.stubGlobal("Image", FakeImage);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Avatar that fails to load", () => {
  it("shows the default while it waits, retries with backoff, then shows itself", () => {
    const { container } = render(<Avatar avatar={NAME} size={40} />);
    expect(picture(container).getAttribute("src")).toBe(URL_);

    fireEvent.error(picture(container));
    expect(picture(container).getAttribute("src")).toBe(DEFAULT);
    expect(FakeImage.made).toHaveLength(0);

    // First retry after the first wait: still down.
    act(() => {
      vi.advanceTimersByTime(AVATAR_RETRY_MS[0]!);
    });
    expect(FakeImage.made).toHaveLength(1);
    expect(FakeImage.made[0]!.src).toBe(`${URL_}?r=1`);
    act(() => FakeImage.made[0]!.onerror?.());
    expect(picture(container).getAttribute("src")).toBe(DEFAULT);

    // Not before the second, longer wait.
    act(() => {
      vi.advanceTimersByTime(AVATAR_RETRY_MS[1]! - 1);
    });
    expect(FakeImage.made).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(FakeImage.made).toHaveLength(2);

    // The server answers: the picture is back, no reload.
    act(() => FakeImage.made[1]!.onload?.());
    expect(picture(container).getAttribute("src")).toBe(`${URL_}?r=2`);

    // And it stops trying.
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(FakeImage.made).toHaveLength(2);
  });

  it("tries at once when the page reconnects or comes back online", () => {
    const { container } = render(<Avatar avatar={NAME} size={40} />);
    fireEvent.error(picture(container));
    act(() => {
      window.dispatchEvent(new Event(PAGE_RECONNECTED));
    });
    expect(FakeImage.made).toHaveLength(1);
    act(() => FakeImage.made[0]!.onerror?.());
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(FakeImage.made).toHaveLength(2);
    act(() => FakeImage.made[1]!.onload?.());
    expect(picture(container).getAttribute("src")).toBe(`${URL_}?r=2`);
  });

  it("stops its timers when it goes away", () => {
    const { container, unmount } = render(<Avatar avatar={NAME} size={40} />);
    fireEvent.error(picture(container));
    unmount();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    act(() => {
      window.dispatchEvent(new Event(PAGE_RECONNECTED));
    });
    expect(FakeImage.made).toHaveLength(0);
  });

  it("leaves the built-in default alone", () => {
    const { container } = render(<Avatar avatar={null} size={40} />);
    fireEvent.error(picture(container));
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(FakeImage.made).toHaveLength(0);
    expect(picture(container).getAttribute("src")).toBe(DEFAULT);
  });
});
