// P11-C6 -- whether the player asked for less motion, read once per call from
// one query list. A list's `matches` follows the setting live, so the page
// keeps the browser's own list and reads it each time; making a new one on
// every call (several per card and update in the Board) was about 1% of the
// page's JavaScript in a combat with the CPU slowed 4x (a CPU profile, RUN).

let kept: { list: MediaQueryList; of: Window["matchMedia"] } | null = null;

/** True when the player asked for less motion (and where there is no window to ask). */
export function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  if (kept?.of === window.matchMedia) return kept.list.matches;
  const list = window.matchMedia("(prefers-reduced-motion: reduce)");
  // Kept only when it is the browser's own live list: a stand-in (a page
  // test's) is asked each time, as before.
  kept =
    typeof MediaQueryList === "function" && list instanceof MediaQueryList
      ? // Kept to compare by identity, never called on its own.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        { list, of: window.matchMedia }
      : null;
  return list.matches;
}
