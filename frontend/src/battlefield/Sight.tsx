// Spec 0088 (owner 2026-11-13, Q5 C, canvas "deep2-triggers-reports-1113")
// -- "targeted" versus "you can pick this".
//
// A card a spell or ability on the stack is targeting wears four still gold
// corners just outside it, like a sight; "you can pick this" keeps its gold
// breath. The corners never animate, so they read with motion turned down and
// without colour (a different shape, not only a different colour).
//
// The canvas's numbers, on its 135-pixel-high card: the corners stand 15 px
// outside each edge, each arm 24 px long, a 4 px pale-gold stroke over an
// 8 px dark one, round ends. Here in fractions of the card's height, so they
// scale with it.

/** How far outside the card's edges the corners stand, of its height. */
export const SIGHT_OUT = 15 / 135;
/** Each corner's arm, of the card's height. */
export const SIGHT_ARM = 24 / 135;

/** The four corners, drawn over the card's slot (absolute, outside its edges). */
export function Sight() {
  return (
    <span className="bf-sight" aria-hidden="true" data-sight="true">
      {(["tl", "tr", "br", "bl"] as const).map((corner) => (
        <svg key={corner} className={`bf-sight-${corner}`} viewBox="0 0 24 24" focusable="false">
          <path d="M3 21V3H21" className="bf-sight-under" />
          <path d="M3 21V3H21" className="bf-sight-over" />
        </svg>
      ))}
    </span>
  );
}
