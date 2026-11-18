// Spec 0069 -- the looks of the board's arrows and marks: the molten attack
// blade (A2), the gold beam of a spell or ability with its ripple and sparks
// on what it targets (T4 + L3), and the shield-and-steel block mark with its
// clash (B4). All motion is CSS or SVG animation (nothing per frame in
// script); with "reduce motion" each is a still picture.
import type { ReactNode } from "react";
import { bladePath, pathOf, routeAt, type Route } from "./effects";
import type { Point } from "./motion";

const f1 = (n: number) => n.toFixed(1);

/** Gold: a spell's beam and its ripple (LINE_THEME.target). */
const GOLD = { aura: "#f0a830", body: "#f4c25e", flow: "#fffaf0", ring: "#ffe39a" } as const;

/**
 * Spec 0100, item 7 (combat Q2 A, reworked) -- the other player's beams:
 * cool blue-violet (beam #8f9cff, flow #e4e8ff), corners #aeb8ff (Sight).
 */
const THEIRS = { aura: "#8f9cff", body: "#8f9cff", flow: "#e4e8ff", ring: "#c9d0ff" } as const;

/** Spec 0100, item 3 -- an evoked spell's grey beam to its caster's graveyard (canvas #8d9a92 / #d5dcd8). */
const GREY = { aura: "#8d9a92", body: "#aab4ae", flow: "#d5dcd8", ring: "#d5dcd8" } as const;

/** A beam's colours: yours, the other player's, or an evoked spell's grey. */
export type BeamTone = "mine" | "theirs" | "grey";
const TONES = { mine: GOLD, theirs: THEIRS, grey: GREY } as const;

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
  tone = "mine",
}: {
  at: Point;
  r: number;
  w: number;
  reduced: boolean;
  tone?: BeamTone;
}) {
  const c = TONES[tone];
  return (
    <g
      className="bf-ripple"
      data-ripple={`${f1(at.x)},${f1(at.y)}`}
      data-r={f1(r)}
      transform={`translate(${f1(at.x)} ${f1(at.y)})`}
    >
      <circle r={r} fill="none" stroke={c.body} strokeWidth={w * 0.5} opacity={0.8} />
      {!reduced &&
        [0, 0.4, 0.8].map((d) => (
          <circle
            key={d}
            r={r}
            fill="none"
            stroke={c.ring}
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
export function Beam({ d, w, tone = "mine" }: { d: string; w: number; tone?: BeamTone }) {
  const c = TONES[tone];
  return (
    <>
      <path
        d={d}
        stroke={c.aura}
        strokeWidth={w * 2.6}
        className="bf-beam-aura"
        filter="url(#bf-glow)"
      />
      <path d={d} stroke={c.body} strokeWidth={w * 0.7} className="bf-beam-body" />
      <path d={d} stroke={c.flow} strokeWidth={w * 0.32} pathLength={1} className="bf-beam-flow" />
    </>
  );
}

/**
 * Spec 0100, item 7 (combat Q2 A, reworked) -- whose beam it is, by itself:
 * yours, a slow glint running down it every 2.2 s; theirs, a few soft motes
 * drifting along it. Drawn only while the beam is up, never with motion
 * turned down; the grey (evoked) beam has neither.
 */
function BeamLife({ d, w, tone }: { d: string; w: number; tone: BeamTone }) {
  if (tone === "grey") return null;
  if (tone === "mine")
    return (
      <g className="bf-beam-glint" data-glint="true">
        <circle r={w * 1.1} fill="#fff4d0" className="bf-beam-glint-dot" filter="url(#bf-glow)">
          <animateMotion
            dur="2.2s"
            repeatCount="indefinite"
            path={d}
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="spline"
            keySplines="0.45 0 0.55 1"
          />
        </circle>
      </g>
    );
  return (
    <g className="bf-beam-motes" data-motes="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <circle
          key={i}
          r={w * 0.55}
          fill="#f4f5ff"
          stroke="#8f9cff"
          strokeWidth={w * 0.25}
          className="bf-beam-mote"
          style={{ animationDelay: `${-i * 0.72}s` }}
        >
          <animateMotion dur="3.6s" begin={`${-i * 0.72}s`} repeatCount="indefinite" path={d} />
        </circle>
      ))}
    </g>
  );
}

/** Spec 0100, item 4 -- a share of divided damage: a gold number standing at the beam's ripple end. */
function Share({ at, w, n }: { at: Point; w: number; n: number }) {
  const r = w * 3.4;
  return (
    <g className="bf-beam-share" data-share={n} transform={`translate(${f1(at.x)} ${f1(at.y)})`}>
      <circle r={r} fill="#e9b54a" stroke="#10161b" strokeWidth={w * 0.6} />
      <circle r={r * 0.82} fill="#f6d68a" opacity={0.55} />
      <text dy="0.36em" textAnchor="middle" fontSize={r * 1.25} fontWeight={800} fill="#1a1206">
        {n}
      </text>
    </g>
  );
}

/** A route moved sideways by `by`: the second strand of a kicked spell's doubled beam. */
function beside(route: Route, by: number): Route {
  const a = route[0]!.start;
  const b = route[route.length - 1]!.end;
  const len = Math.max(1e-6, Math.hypot(b.x - a.x, b.y - a.y));
  const nx = (-(b.y - a.y) / len) * by;
  const ny = ((b.x - a.x) / len) * by;
  const move = (p: Point) => ({ x: p.x + nx, y: p.y + ny });
  return route.map((c) => ({
    start: move(c.start),
    c1: move(c.c1),
    c2: move(c.c2),
    end: move(c.end),
  }));
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
  tone = "mine",
  doubled = false,
  share,
}: {
  route: Route;
  aim: { at: Point; r: number } | undefined;
  w: number;
  reduced: boolean;
  /** Spec 0100, item 7 -- yours gold, the other player's blue-violet; item 3 -- an evoked spell's grey. */
  tone?: BeamTone;
  /** Spec 0100, item 3 -- kicked: two strands side by side. */
  doubled?: boolean;
  /** Spec 0100, item 4 -- its share of divided damage, standing at its ripple end. */
  share?: number | undefined;
}) {
  const d = pathOf(route);
  return (
    <g
      className={`bf-beam bf-beam-${tone}`}
      data-tone={tone}
      data-doubled={doubled ? "true" : undefined}
    >
      <Beam d={d} w={w} tone={tone} />
      {doubled && (
        <g className="bf-beam-strand" data-strand="2">
          <Beam d={pathOf(beside(route, w * 2.6))} w={w} tone={tone} />
        </g>
      )}
      {!reduced && <BeamLife d={d} w={w} tone={tone} />}
      {aim && <Ripple at={aim.at} r={aim.r} w={w} reduced={reduced} tone={tone} />}
      {share !== undefined && <Share at={routeAt(route, 0.88)} w={w} n={share} />}
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
