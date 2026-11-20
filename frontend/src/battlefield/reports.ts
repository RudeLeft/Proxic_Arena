// Spec 0088 (owner 2026-11-13, canvas "deep2-triggers-reports-1113") --
// reports that stay and gather.
//
//   Q2 A: a report window is no longer cleared at the turn line; it stays
//   until the player closes it, or a newer report gathers it.
//   Q3 C: a new report arriving while one is open folds the older ones into
//   one-line rows at the top of the same window (medallion, WHO · CARD, the
//   sentence); the newest shows in full; a click on a row opens it; closing
//   the window clears the gathered set.
//
// Pure: which reports are still open, and how the window lays them out. The
// worker keeps every report since the window was last closed, per reader
// (ReportBook), and sends the newest with the older ones `gathered`.

import type { SnapshotReveal } from "../match";

/**
 * The reports the player has not closed (stamps above [closedUpTo]): the
 * newest, carrying the older open ones as `gathered`, oldest first; null when
 * none is open.
 */
export function openReports(
  action: SnapshotReveal | null,
  closedUpTo: number,
): SnapshotReveal | null {
  if (!action) return null;
  const alone = (r: SnapshotReveal): SnapshotReveal => {
    const one = { ...r };
    delete one.gathered;
    return one;
  };
  const all = [...(action.gathered ?? []), action]
    .map(alone)
    // A report with no stamp (an older worker) is closed by its key alone.
    .filter((r) => !r.stamp || r.stamp > closedUpTo)
    .sort((a, b) => (a.stamp ?? 0) - (b.stamp ?? 0));
  const newest = all[all.length - 1];
  if (!newest) return null;
  // Amendment 1 (owner, "keep only 3 rows"): the three before the newest; older ones drop off.
  const older = all.slice(0, -1).slice(-ROWS);
  return older.length > 0 ? { ...newest, gathered: older } : newest;
}

/** Every report a window holds, oldest first: the gathered ones, then the newest. */
export function reportsOf(window_: SnapshotReveal): SnapshotReveal[] {
  return [...(window_.gathered ?? []), window_];
}

/**
 * Which report the window shows in full: the one the player clicked open,
 * while it is still there; else the newest. The others are its rows, oldest
 * first.
 */
export function layoutOf(
  window_: SnapshotReveal,
  opened: string | null,
): { full: SnapshotReveal; rows: SnapshotReveal[] } {
  const all = reportsOf(window_);
  const full = all.find((r) => r.key === opened) ?? window_;
  return { full, rows: all.filter((r) => r !== full) };
}

/** A window of gathered reports is at least this wide at 1080 (the canvas's 600). */
export const GATHERED_W = 600;
/**
 * Spec 0088, Amendment 1 (owner 2026-11-14, "keep only 3 rows") -- at most
 * this many older reports, as rows above the newest; older ones drop off,
 * and the rows never scroll (the canvas: "at most three lines; older ones go").
 */
export const ROWS = 3;
/** A row's height at 1920 x 1080, in the canvas's pixels (58 at its 1.2 rail scale). */
export const ROW_H = 48;
/** A report folding into its row, and the newest coming in (the canvas's 0.3 s). */
export const FOLD_MS = 300; // not paced: a wait (spec 0106)
