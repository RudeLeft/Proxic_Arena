// Phase 9 W-17 (Amendment 19, owner 2026-11-05: "animated, 3D" -- approved
// on the canvas demo) -- a die drawn in 3D with the page's own CSS (no
// game engine, the one renderer of BATTLEFIELD_RENDERING.md): a d6 is a
// cube with pips that tumbles to the face it rolled; any other die (a d20,
// a d4...) spins in its own outline with the number on its face. A new
// `roll` number tumbles it again; reduced motion turns the tumble off.

import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Where each face's pips sit, in percent of the face. */
const PIPS: Record<number, [number, number][]> = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [26, 26],
    [50, 50],
    [74, 74],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [26, 26],
    [74, 26],
    [50, 50],
    [26, 74],
    [74, 74],
  ],
  6: [
    [28, 24],
    [72, 24],
    [28, 50],
    [72, 50],
    [28, 76],
    [72, 76],
  ],
};
/** Each face's place on the cube, and the turn that brings it to the front. */
const PLACE: Record<number, string> = {
  1: "",
  6: "rotateY(180deg)",
  3: "rotateY(90deg)",
  4: "rotateY(-90deg)",
  5: "rotateX(90deg)",
  2: "rotateX(-90deg)",
};
const TURN: Record<number, [number, number]> = {
  1: [0, 0],
  6: [0, -180],
  3: [0, -90],
  4: [0, 90],
  5: [-90, 0],
  2: [90, 0],
};

/** The cube's turn for `face`, past `from` and with whole extra spins when tumbling. */
export function cubeTurn(face: number, from: [number, number], tumble: boolean): [number, number] {
  const [fx, fy] = TURN[face] ?? [0, 0];
  if (!tumble) return [fx, fy];
  const past = (now: number, target: number, extra: number) =>
    Math.ceil((now - target) / 360) * 360 + target + extra;
  return [past(from[0], fx, 720), past(from[1], fy, 360)];
}

export function Die3D({
  value,
  sides = 6,
  size = 52,
  roll = 0,
  className = "",
}: {
  /** The face showing. */
  value: number;
  sides?: number;
  size?: number;
  /** Change it to tumble again (a new roll, a reroll). */
  roll?: number;
  className?: string;
}) {
  const [turn, setTurn] = useState<[number, number]>(() => cubeTurn(value, [0, 0], false));
  const [spin, setSpin] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    // The first face is drawn landed; any later roll or value tumbles.
    const tumble = !first.current || roll > 0;
    first.current = false;
    setTurn((now) => cubeTurn(value, now, tumble));
    if (tumble) {
      setSpin(true);
      const done = window.setTimeout(() => setSpin(false), 1200);
      return () => window.clearTimeout(done);
    }
    return undefined;
  }, [value, roll]);

  const label = `a ${sides}-sided die showing ${value}`;
  if (sides !== 6) {
    return (
      <span
        className={`gs-die gs-die-poly${spin ? " gs-die-spinning" : ""} ${className}`.trim()}
        style={{ "--die": `${size}px` } as CSSProperties}
        role="img"
        aria-label={label}
        data-value={value}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <polygon className="gs-die-poly-out" points="50,3 93,27 93,73 50,97 7,73 7,27" />
          <polygon className="gs-die-poly-in" points="50,22 78,68 22,68" />
          <text x="50" y="59" textAnchor="middle" fontSize="22">
            {value}
          </text>
        </svg>
      </span>
    );
  }
  return (
    <span
      className={`gs-die gs-die-cube-wrap ${className}`.trim()}
      style={{ "--die": `${size}px` } as CSSProperties}
      role="img"
      aria-label={label}
      data-value={value}
    >
      <span
        className="gs-die-cube"
        style={{
          transform: `rotateX(-20deg) rotateY(24deg) rotateX(${turn[0]}deg) rotateY(${turn[1]}deg)`,
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((face) => (
          <span
            key={face}
            className="gs-die-face"
            style={{ transform: `${PLACE[face]} translateZ(calc(var(--die) / 2))` }}
          >
            {PIPS[face]!.map(([x, y], i) => (
              <span key={i} className="gs-die-pip" style={{ left: `${x}%`, top: `${y}%` }} />
            ))}
          </span>
        ))}
      </span>
    </span>
  );
}
