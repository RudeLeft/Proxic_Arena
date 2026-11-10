// Spec 0069 -- the looks of the board's arrows and marks: the molten attack
// blade (A2), the gold beam of a spell or ability with its ripple and sparks
// on what it targets (T4 + L3), and the shield-and-steel block mark with its
// clash (B4). All motion is CSS or SVG animation (nothing per frame in
// script); with "reduce motion" each is a still picture.
import type { ReactNode } from "react";
import { bladePath, pathOf, type Route } from "./effects";
import type { Point } from "./motion";

const f1 = (n: number) => n.toFixed(1);

/** Gold: a spell's beam and its ripple (LINE_THEME.target). */
const GOLD = { aura: "#f0a830", body: "#f4c25e" } as const;

/**
 * Spec 0069, item 1 (A2 · Molten blade): thick at the attacker, a white-hot
 * point at what it attacks, a heat haze round it, sparks drifting up off it.
 */
export function AttackBlade({
  route,
  w,
  uid,
  shadow,
  reduced,
}: {
  route: Route;
  w: number;
  uid: string;
  shadow: ReactNode;
  reduced: boolean;
}) {
  const start = route[0]!.start;
  const tip = route[route.length - 1]!.end;
  const spine = pathOf(route);
  const embers = reduced ? [] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <g className="bf-blade">
      <defs>
        <linearGradient
          id={`${uid}-m`}
          gradientUnits="userSpaceOnUse"
          x1={start.x}
          y1={start.y}
          x2={tip.x}
          y2={tip.y}
        >
          <stop offset="0" stopColor="#d6380c" />
          <stop offset="0.4" stopColor="#ff6a1c" />
          <stop offset="0.8" stopColor="#ffb547" />
          <stop offset="1" stopColor="#fff3c8" />
        </linearGradient>
      </defs>
      {shadow}
      <path
        d={bladePath(route, w * 7)}
        className="bf-blade-haze"
        style={{ fill: "#ff5a1f" }}
        filter="url(#bf-heat)"
      />
      <path
        d={bladePath(route, w * 4.2)}
        className="bf-blade-glow"
        style={{ fill: "#ff7a3d" }}
        filter="url(#bf-glow)"
      />
      <path
        d={bladePath(route, w * 3.6)}
        className="bf-blade-body"
        style={{ fill: `url(#${uid}-m)` }}
        stroke="#ffd59a"
        strokeWidth={w * 0.18}
      />
      <path
        d={bladePath(route, w * 1.5)}
        style={{ fill: "#fff1d0" }}
        opacity={0.85}
        filter="url(#bf-soft)"
      />
      {embers.map((i) => (
        <g key={i} className="bf-blade-ember" style={{ animationDelay: `${-i * 0.23}s` }}>
          <circle r={w * (0.32 + (i % 3) * 0.1)} fill={i % 2 ? "#ffd27a" : "#ff8a3d"}>
            <animateMotion
              dur="1.6s"
              begin={`${-i * 0.23}s`}
              repeatCount="indefinite"
              path={spine}
            />
          </circle>
        </g>
      ))}
    </g>
  );
}

/**
 * Spec 0069 (L3 · Ripple and sparks): a ring round what is targeted, rings
 * growing outward from it and fading, small sparks flying off. Drawn round
 * `at`; nothing is drawn inside the ring, so a life total is never covered.
 */
export function Ripple({
  at,
  r,
  w,
  reduced,
}: {
  at: Point;
  r: number;
  w: number;
  reduced: boolean;
}) {
  return (
    <g
      className="bf-ripple"
      data-ripple={`${f1(at.x)},${f1(at.y)}`}
      data-r={f1(r)}
      transform={`translate(${f1(at.x)} ${f1(at.y)})`}
    >
      <circle r={r} fill="none" stroke={GOLD.body} strokeWidth={w * 0.5} opacity={0.8} />
      {!reduced &&
        [0, 0.4, 0.8].map((d) => (
          <circle
            key={d}
            r={r}
            fill="none"
            stroke="#ffe39a"
            strokeWidth={w * 0.55}
            className="bf-ripple-ring"
            style={{ animationDelay: `${d}s` }}
          />
        ))}
      {!reduced &&
        [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <g key={i} transform={`rotate(${i * 45 + 20})`}>
            <circle
              cy={-r}
              r={w * 0.35}
              fill="#fff4d6"
              className="bf-ripple-spark"
              style={{
                animationDelay: `${(i % 4) * 0.3}s`,
                ["--fly" as string]: `${-r * 0.7}px`,
              }}
            />
          </g>
        ))}
    </g>
  );
}

/** Spec 0069 (T4 · Beam): a shining gold beam, light flowing along it toward its end. */
export function Beam({ d, w }: { d: string; w: number }) {
  return (
    <>
      <path
        d={d}
        stroke={GOLD.aura}
        strokeWidth={w * 2.6}
        className="bf-beam-aura"
        filter="url(#bf-glow)"
      />
      <path d={d} stroke={GOLD.body} strokeWidth={w * 0.7} className="bf-beam-body" />
      <path d={d} stroke="#fffaf0" strokeWidth={w * 0.32} pathLength={1} className="bf-beam-flow" />
    </>
  );
}

/**
 * Spec 0069, items 2-4: a spell or ability's pointer -- the beam, and the
 * ripple on what it targets (a card's picture, a player's life shield, a
 * card on the stack).
 */
export function TargetBeam({
  route,
  aim,
  w,
  reduced,
}: {
  route: Route;
  aim: { at: Point; r: number } | undefined;
  w: number;
  reduced: boolean;
}) {
  return (
    <g className="bf-beam">
      <Beam d={pathOf(route)} w={w} />
      {aim && <Ripple at={aim.at} r={aim.r} w={w} reduced={reduced} />}
    </g>
  );
}

/**
 * Spec 0069, item 6 (B4 · Shield and steel, with the clash): the mark of a
 * blocker on its attacker, 22 units across before it is scaled -- a blue
 * steel shield, the swords swinging in over it and striking, sparks bursting
 * where they meet; with `count`, the one mark that stands for that many.
 */
export function SwordsMark({ count }: { count?: number | undefined }) {
  const sword = (turn: number, cls: string) => (
    <g key={turn} transform={`rotate(${turn})`}>
      <g className={cls}>
        <path d="M0 -8.5 L1.3 -6.8 L1.3 3 L-1.3 3 L-1.3 -6.8 Z" fill="url(#bf-steel)" />
        <rect x={-3.6} y={3} width={7.2} height={1.6} rx={0.8} fill="#e0a44a" />
        <rect x={-0.9} y={4.6} width={1.8} height={3.2} fill="#b98a4a" />
      </g>
    </g>
  );
  return (
    <g className="bf-swords-mark">
      <circle r={12.5} className="bf-swords-halo" fill="#3aa8ff" filter="url(#bf-glow)" />
      <path
        className="bf-swords-shield"
        d="M0 -11.5 L9.5 -8 Q9.5 4 0 11.5 Q-9.5 4 -9.5 -8 Z"
        fill="url(#bf-shield)"
        stroke="#8fd3ff"
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
      {sword(45, "bf-swords-swing-r")}
      {sword(-45, "bf-swords-swing-l")}
      <g className="bf-swords-burst">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((t) => (
          <path
            key={t}
            transform={`rotate(${t})`}
            d="M0 -2.2 L0.6 -6.5 L0 -8.4 L-0.6 -6.5 Z"
            fill="#fff4d6"
          />
        ))}
        <circle r={2} fill="#fff" />
      </g>
      {count !== undefined && (
        <g className="bf-swords-count" transform="translate(11 -7)" data-count={count}>
          <circle r={6.8} fill="#0f1a26" stroke="#8fd3ff" strokeWidth={1.2} />
          <text dy="0.36em" textAnchor="middle" fontSize={9.5} fontWeight={800} fill="#ffffff">
            {count}
          </text>
        </g>
      )}
      {[45, -45].map((t) => (
        <path
          key={t}
          transform={`rotate(${t})`}
          d="M0 2.6 L0 -8"
          stroke="#fff"
          strokeWidth={0.9}
          pathLength={1}
          fill="none"
          className="bf-swords-glint"
          style={{ animationDelay: t > 0 ? "0.6s" : "0.85s" }}
        />
      ))}
    </g>
  );
}
