// Spec 0103, item 6 (owner 2026-11-17, Q7 A) -- "Bigger text", a switch in
// the gear menu: power/toughness, counters and the life totals 25% larger,
// the gold squares' outlines thicker. Off by default; kept per browser, as
// the Sounds switch is (proxic.sounds): there are no server-side
// preferences to put it in.

import { useCallback, useState } from "react";

export const BIGGER_TEXT_KEY = "proxic.biggerText";

export function biggerTextOn(): boolean {
  try {
    return window.localStorage.getItem(BIGGER_TEXT_KEY) === "on";
  } catch {
    return false;
  }
}

export function setBiggerTextOn(on: boolean): void {
  try {
    window.localStorage.setItem(BIGGER_TEXT_KEY, on ? "on" : "off");
  } catch {
    // Storage refused (a private window): the switch lasts this page only.
  }
}

/** The switch's state, read once from this browser, written on each change. */
export function useBiggerText(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(biggerTextOn);
  const set = useCallback((next: boolean) => {
    setOn(next);
    setBiggerTextOn(next);
  }, []);
  return [on, set];
}
