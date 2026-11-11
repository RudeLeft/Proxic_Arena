// Spec 0070, Amendment 1 (owner 2026-11-11, look "C · Corner sign" on the
// canvas pay-effects-1111) -- no words on a picked card: a small round sign
// on its top-right corner, half over the felt, in the cost's colour, and a
// thin outline in the same colour. The icons are the canvas's, exactly:
// tap (a turning arrow), untap (the same, the other way), sacrifice (a
// flame), exile (a star), return to hand, into a library, discard, reveal
// (an eye). The eye is also the "seen" sign on a hand card another player
// has seen.

import type { ReactNode } from "react";
import type { PayTone } from "./payPicks";

/** The canvas's colours (KC), by what the cost does. */
export const SIGN_COLOUR: Record<PayTone, string> = {
  tap: "#f4c25e",
  untap: "#ffe7a8",
  sacrifice: "#ff6a2a",
  exile: "#bfe3ff",
  hand: "#6cc6ff",
  library: "#a99bff",
  discard: "#b4ada4",
  reveal: "#ffffff",
  other: "#b4ada4",
};

const TURN = (
  <>
    <path d="M5.5 16.5A7.5 7.5 0 1 1 18.5 11.5" />
    <path d="M15.2 8.6l3.4 3.6 3.2-3.8" />
  </>
);

const EYE = (
  <>
    <path d="M1.5 12S5.3 5.5 12 5.5 22.5 12 22.5 12 18.7 18.5 12 18.5 1.5 12 1.5 12z" />
    <circle cx="12" cy="12" r="3.3" fill="currentColor" />
  </>
);

/** The canvas's SIG icons (24 x 24, stroked in currentColor). */
const ICON: Record<PayTone, ReactNode> = {
  tap: TURN,
  untap: <g transform="matrix(-1 0 0 1 24 0)">{TURN}</g>,
  sacrifice: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 2.5c1.2 4 5.8 5.6 5.8 11a5.8 5.8 0 0 1-11.6 0c0-2.8 1.6-4 2.7-5.6.5 2.2 1.6 2.9 2.7 3.3-.2-3.4-.9-5.6.4-8.7z"
    />
  ),
  exile: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 1.5l2.2 8.3 8.3 2.2-8.3 2.2L12 22.5l-2.2-8.3L1.5 12l8.3-2.2z"
    />
  ),
  hand: (
    <>
      <rect x="3.5" y="12" width="7.5" height="9.5" rx="1.2" transform="rotate(-14 7.2 16.8)" />
      <rect x="13" y="12" width="7.5" height="9.5" rx="1.2" transform="rotate(14 16.8 16.8)" />
      <path d="M12 1.5v8.5M8.6 6.8L12 10.2l3.4-3.4" />
    </>
  ),
  library: (
    <>
      <path d="M12 1.5v8M8.6 6.2L12 9.6l3.4-3.4" />
      <path d="M4 13.5h16M4 17.2h16M4 21h16" />
    </>
  ),
  discard: (
    <>
      <g transform="rotate(-12 8 20)">
        <path d="M3.5 3h7l-1.6 5.2 2.2 3L9.6 21H3.5z" />
      </g>
      <g transform="rotate(12 16 20)">
        <path d="M13.6 3h6.9v18h-7.3l1.6-9.6-2.2-3z" />
      </g>
    </>
  ),
  reveal: EYE,
  // A cost the canvas drew no sign for (unattach, into a graveyard, a cost
  // Forge adds later): a plain dot, never a blank.
  other: <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />,
};

/** The round corner sign for [tone]; `seen` -- the eye of a hand card another player has seen. */
export function PaySign({
  tone,
  seen = false,
  corner = "top-right",
}: {
  tone: PayTone;
  seen?: boolean;
  /**
   * The canvas's top-right on the table. In a hand, where each card hides
   * the right of the one before it, the left: top-left in yours,
   * bottom-left in theirs (its top is off the screen).
   */
  corner?: "top-right" | "top-left" | "bottom-left";
}) {
  return (
    <span
      className={`bf-pay-sign${seen ? " bf-seen-sign" : ""}${corner === "top-right" ? "" : ` bf-pay-sign-${corner}`}`}
      style={{ color: SIGN_COLOUR[tone], borderColor: SIGN_COLOUR[tone] }}
      data-sign={seen ? "seen" : tone}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {ICON[tone]}
      </svg>
    </span>
  );
}
