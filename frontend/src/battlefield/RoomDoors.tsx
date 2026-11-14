// Spec 0083 (owner 2026-11-13, canvas gaps-polish-1113, 15 A) -- a Room on
// the table is drawn as its two doors, one above the other, each with its
// own name bar (the canvas's). A locked door's half is a closed wooden door
// wearing 0076's gold-rimmed square, a keyhole ("something the card is").
// On unlocking, the square shrinks away, that half's door swings open on its
// hinge and light spills out; the other half does not move, and the card
// does not turn over (A-09's flip is not used: Board skips it for a Room).
// The movements are CSS animations on the board, so a click hurries them
// (A-00); with reduce motion the door is simply gone.

import { useEffect, useState } from "react";

export type Half = "top" | "bottom";

/** The keyhole, the canvas's (gold on the square's dark face). */
export const KEYHOLE = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="8" r="3.3" fill="#f2c95c" />
    <path d="M8.4 9.5 L7.4 16 H12.6 L11.6 9.5 Z" fill="#f2c95c" />
  </svg>
);

/** How long a door takes to open, keyhole to light (the canvas's 0.15 s + 0.9 s). */
export const DOOR_OPEN_MS = 1050;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** One half: its door's name, its picture, and its door while locked or opening. */
function RoomHalf({
  id,
  half,
  name,
  art,
  crop,
  state,
  onOpened,
}: {
  id: string;
  half: Half;
  name: string;
  art: string | null;
  crop: string | null;
  state: "locked" | "opening" | "open";
  onOpened: () => void;
}) {
  // The printed Room is turned on its side: its first door is the scan's
  // bottom half, its second the top -- each half shows that part of it.
  const at = half === "top" ? "50% 75%" : "50% 25%";
  return (
    <span className={`bf-room-half bf-room-${half}`} data-door={name} data-door-state={state}>
      <span className="bf-bar bf-room-bar">
        <span className="bf-name">{name}</span>
      </span>
      <span className="bf-room-art" aria-hidden="true">
        {art || crop ? (
          <img
            src={(art ?? crop)!}
            alt=""
            decoding="async"
            draggable={false}
            style={{ objectPosition: art ? at : "center" }}
          />
        ) : null}
      </span>
      {state !== "open" && (
        <>
          <span className="bf-room-light" aria-hidden="true" />
          <span
            className="bf-room-door"
            aria-hidden="true"
            // The jump check follows an opening door (its card does not move).
            data-door-open={state === "opening" ? id : undefined}
            onAnimationEnd={(event) => {
              if (event.animationName === "bf-room-swing") onOpened();
            }}
          />
          <span className="bf-mark bf-room-key" data-locked-mark="true" aria-hidden="true">
            {KEYHOLE}
          </span>
        </>
      )}
    </span>
  );
}

/**
 * A Room's face: two halves, the first door on top. [locked] are the halves
 * still locked; a half that has just stopped being locked plays its door
 * opening, then is open.
 */
export function RoomFace({
  id,
  doors,
  locked,
  art,
  crop,
}: {
  /** The Room's card id. */
  id: string;
  doors: readonly [string, string];
  locked: readonly Half[];
  art: string | null;
  crop: string | null;
  look?: string;
}) {
  const key = [...locked].sort().join(",");
  const [seen, setSeen] = useState(key);
  const [opening, setOpening] = useState<Half[]>([]);
  if (seen !== key) {
    // A door was unlocked since the last drawing: it opens now (set while
    // drawing, so there is never a frame with the door simply gone).
    const was = seen.split(",").filter(Boolean) as Half[];
    const gone = was.filter((h) => !locked.includes(h));
    setSeen(key);
    setOpening((now) => [
      ...now.filter((h) => !locked.includes(h)),
      ...(reducedMotion() ? [] : gone),
    ]);
  }
  // A safety net: a door whose animation never ends (no animations here)
  // is open after a while all the same.
  const openingKey = opening.join(",");
  useEffect(() => {
    if (!openingKey) return undefined;
    const timer = window.setTimeout(() => setOpening([]), DOOR_OPEN_MS * 20);
    return () => window.clearTimeout(timer);
  }, [openingKey]);
  const state = (h: Half) =>
    locked.includes(h) ? "locked" : opening.includes(h) ? "opening" : "open";
  const opened = (h: Half) => setOpening((now) => now.filter((x) => x !== h));
  return (
    <>
      {(["top", "bottom"] as const).map((h, i) => (
        <RoomHalf
          key={h}
          id={id}
          half={h}
          name={doors[i]!}
          art={art}
          crop={crop}
          state={state(h)}
          onOpened={() => opened(h)}
        />
      ))}
      {opening.length > 0 && <span className="bf-room-glow" aria-hidden="true" />}
    </>
  );
}
