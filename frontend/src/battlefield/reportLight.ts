// Spec 0103, items 1 and 2 (owner 2026-11-17, Q1 C and Q2 A; the dim canvas
// "deep3-dim-1117", option B; the link, option A of the build's CONFLICT,
// owner 2026-11-18) -- a report window points at the table.
//
// Spec 0109, item 13 (canvas "13" option A; the read-through removed, owner
// 2026-11-20): a click on a card picture in the full report (no longer any
// pointing, row or read-through) dims everything on the table and
// the piles with the split-second dim, brightness(0.45) saturate(0.4) (CSS:
// .gs-report-pointing), except that card where it lies now: the card itself
// when the worker linked it (`table`, sent only while this viewer's board
// shows it), else the pile tile it went to (a graveyard, exile, a library --
// a card the viewer cannot see lights its tile instead). One class on the
// game screen, and one on each card or tile kept bright: no style per card,
// and nothing about the seats is redrawn (spec 0103, Risks: speed).
//
// Not while choosing (Decided 1): only a report window's picture click calls it.

import type { SnapshotCard } from "../match";

/** The game screen's class while a report points at the table. */
export const POINTING = "gs-report-pointing";
/** On each card or pile tile kept bright. */
export const LIT = "gs-lit";

/** The pile tile a card that went to [to] now lies in, for [side]; null for none. */
export function tileFor(to: string | null | undefined, side: "viewer" | "opponent"): string | null {
  switch (to) {
    case "graveyard":
      return `${side}:graveyard`;
    case "exile":
      return `${side}:exile`;
    case "top":
    case "bottom":
    case "library":
    case "shuffled":
      return `${side}:library`;
    default:
      return null;
  }
}

/** The live table's element for a card id (never the replay's layer, never a report's picture). */
function onTable(root: ParentNode, id: string): HTMLElement | null {
  // The card itself, or the pile it is drawn in (identical lands, tokens).
  const found = [
    ...root.querySelectorAll<HTMLElement>(`.bf-board [data-object-id="${id}"]`),
    ...root.querySelectorAll<HTMLElement>(`.bf-board [data-members-ids~="${id}"]`),
  ];
  for (const el of found) {
    if (el.closest(".gs-replay") || el.closest(".gs-reveal")) continue;
    return el.closest<HTMLElement>(".bf-slot") ?? el;
  }
  return null;
}

/**
 * Dims the table except these cards (each where it lies now). Returns how
 * many cards or tiles were kept bright; nothing is dimmed when none was.
 */
export function lightOn(
  screen: HTMLElement | null,
  cards: readonly SnapshotCard[],
  viewerSeat: number,
): number {
  if (!screen) return 0;
  lightOff(screen);
  const keep = new Set<HTMLElement>();
  for (const card of cards) {
    const table = card.table ? onTable(screen, card.table) : null;
    if (table) {
      keep.add(table);
      continue;
    }
    const owner = card.owner ?? card.seat;
    const tile = tileFor(card.to, owner === viewerSeat ? "viewer" : "opponent");
    const el = tile ? screen.querySelector<HTMLElement>(`[data-zone-tile="${tile}"]`) : null;
    if (el) keep.add(el);
  }
  if (keep.size === 0) return 0;
  for (const el of keep) el.classList.add(LIT);
  screen.classList.add(POINTING);
  return keep.size;
}

/** The table as it was: nothing dimmed. */
export function lightOff(screen: HTMLElement | null): void {
  if (!screen) return;
  screen.classList.remove(POINTING);
  for (const el of screen.querySelectorAll(`.${LIT}`)) el.classList.remove(LIT);
}
