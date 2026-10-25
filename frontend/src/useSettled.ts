// A state worth showing only once it has lasted — owner 2026-10-24.
//
// "Connecting…" for the twenty milliseconds a refresh takes, or
// "Reconnecting…" for a blip, flashes too fast to read and looks like
// something broke. A real outage lasts; it still shows, a moment late.

import { useEffect, useState } from "react";

/** [on], but only after it has stayed true for [ms]; false again at once. */
export function useSettled(on: boolean, ms: number): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!on) {
      setSettled(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSettled(true), ms);
    return () => window.clearTimeout(timer);
  }, [on, ms]);
  return on && settled;
}
