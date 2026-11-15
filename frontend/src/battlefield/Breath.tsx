// Spec 0090 (2) -- the "you can pick this" glow as a soft layer drawn right
// after its card (or tab), in the same place: a shadow is drawn only outside
// a box, so it lies over the card's drop shadow and never over the card, as
// the card's own animated shadow did. Only the opacity of its two halves
// animates
// (game.css `.bf-breath`); see breathMotion.ts.

import type { CSSProperties } from "react";

export function Breath({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties | undefined;
}) {
  return <span className={`bf-breath${className}`} style={style} aria-hidden="true" />;
}
