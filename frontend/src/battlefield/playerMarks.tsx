// Spec 0086 (owner 2026-11-13, canvas gaps-players-1113) -- the marks a
// PLAYER has, as pictures, in spec 0076's language (something you count: a
// picture and its number):
//
//   7 B   energy, experience, rad and tickets are round picture badges in
//         the player's tray, each number stepping point by point (0077's
//         90 ms a point, at most 0.9 s) with a rising +N/-N pill in the
//         badge's own colours. Poison keeps its badge by the shield (0077).
//         Amendment 1: the city's blessing is a badge in the same family
//         (a gold pulse when gained), and the Ring's count is a badge that
//         ticks +1 on each temptation.
//   8     the crown sits on the monarch's face picture and the initiative
//         on its lower corner (FaceMarks; they fly face to face in
//         flights.tsx); the dungeon is a small map card in the tray whose
//         gold marker steps to the next room as the map lifts and settles;
//         an emblem is a small square tile with its planeswalker's picture.
//
// Everything moving is a Web Animation on the element, so a click hurries
// it (A-00); with reduce motion nothing moves -- the numbers, badges, crown
// and tiles simply change.

import { sameProps } from "./sameProps";
import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { CommandWords, SnapshotEmblem, StackEntry } from "../match";
import { hurry } from "./motion";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** A click or a key hurries [ref]'s movements to their end, as the board does (A-00). */
export function useHurry(ref: { current: Element | null }, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return undefined;
    const now = () => hurry(el);
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
    };
  }, [ref, active]);
}

// --- the badges -------------------------------------------------------------------------

/** One badge's look: its rim and number colour, its face, and its picture (on a 24 x 24 box, centred). */
export interface CountLook {
  col: string;
  face: string;
  pic: ReactNode;
  /** The word for one / many ("energy", "experience counter"). */
  one: string;
  many: string;
}

/** The canvas's pictures and colours (spec 0038's dots, now pictures). */
export const COUNT_LOOK: Record<string, CountLook> = {
  energy: {
    col: "#e8c547",
    face: "#1f1b0b",
    pic: <path d="M2.5 -11 L-6 1.5 L-0.5 1.5 L-2.5 11 L6 -2 L0.5 -2 Z" />,
    one: "energy",
    many: "energy",
  },
  experience: {
    col: "#8fb3e8",
    face: "#0e1622",
    pic: <path d="M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3Z" />,
    one: "experience counter",
    many: "experience counters",
  },
  rad: {
    col: "#9fe05a",
    face: "#0f1a0c",
    pic: (
      <>
        <circle r="2.2" />
        <path d="M0 -3.5 L-4.3 -10.5 A11 11 0 0 1 4.3 -10.5 Z" />
        <path d="M0 -3.5 L-4.3 -10.5 A11 11 0 0 1 4.3 -10.5 Z" transform="rotate(120)" />
        <path d="M0 -3.5 L-4.3 -10.5 A11 11 0 0 1 4.3 -10.5 Z" transform="rotate(240)" />
      </>
    ),
    one: "rad counter",
    many: "rad counters",
  },
  ticket: {
    col: "#e0905a",
    face: "#1f140c",
    pic: (
      <path d="M-10 -6 H10 V-2.4 A2.4 2.4 0 0 0 10 2.4 V6 H-10 V2.4 A2.4 2.4 0 0 0 -10 -2.4 Z M-3 -6 V6" />
    ),
    one: "ticket",
    many: "tickets",
  },
  // Amendment 1 -- the Ring's temptations: a gold ring.
  ring: {
    col: "#f2c95c",
    face: "#1c160a",
    pic: (
      <path
        fillRule="evenodd"
        d="M0 -9 A9 9 0 1 1 0 9 A9 9 0 1 1 0 -9 Z M0 -5.6 A5.6 5.6 0 1 0 0 5.6 A5.6 5.6 0 1 0 0 -5.6 Z"
      />
    ),
    one: "time the Ring has tempted",
    many: "times the Ring has tempted",
  },
  // Amendment 1 -- the city's blessing: a gold city.
  blessing: {
    col: "#f2c95c",
    face: "#1c160a",
    pic: (
      <path d="M-10 9 V-1 L-7 -4 L-4 -1 V-6 L0 -10 L4 -6 V-1 L7 -4 L10 -1 V9 Z M-1.6 9 V4 A1.6 1.6 0 0 1 1.6 4 V9 Z" />
    ),
    one: "the city's blessing",
    many: "the city's blessing",
  },
  other: {
    col: "#9aa2ad",
    face: "#141a22",
    pic: <circle r="5" />,
    one: "counter",
    many: "counters",
  },
};

/** Forge's counter name ("ENERGY", "TICKET") to a badge's look; poison is the shield's (0077). */
export function countKind(name: string): string {
  const n = name.toLowerCase();
  if (n === "tickets") return "ticket";
  return n in COUNT_LOOK ? n : "other";
}

/** Spec 0077's pace: a point every 90 ms, never more than 0.9 s for the whole change. */
export const COUNT_POINT_MS = 90;
export const COUNT_CHANGE_MAX_MS = 900;
/** The +N/-N pill's rise (the canvas's 1.1 s). */
export const COUNT_PILL_MS = 1100;
/** The badge's swell as its number changes. */
export const COUNT_PULSE_MS = 400;
/** The ms between two points of a change of [amount]. */
export function countStepMs(amount: number): number {
  const a = Math.abs(amount);
  return a <= 1 ? 0 : Math.min(COUNT_POINT_MS, COUNT_CHANGE_MAX_MS / a);
}

/** The number shown [t] ms into a change from [from] to [to], point by point. */
export function steppedCount(from: number, to: number, t: number): number {
  const d = to - from;
  if (d === 0) return to;
  const step = countStepMs(d);
  const done = step === 0 ? Math.abs(d) : Math.min(Math.abs(d), Math.floor(t / step) + 1);
  return from + Math.sign(d) * done;
}

/** The pill rising off a badge (the canvas: up 28 px, in by 12 %, out after 70 %; down off the opponent's tray). */
export function pillFrames(down: boolean): Keyframe[] {
  const y = (px: number) => `translate(-50%, calc(-50% + ${down ? px : -px}px))`;
  return [
    { offset: 0, opacity: 0, transform: `${y(14)} scale(0.7)` },
    { offset: 0.12, opacity: 1, transform: `${y(20)} scale(1)` },
    { offset: 0.7, opacity: 1, transform: `${y(38)} scale(1)` },
    { offset: 1, opacity: 0, transform: `${y(44)} scale(1)` },
  ];
}

const PULSE: Keyframe[] = [
  { offset: 0, transform: "scale(1)" },
  { offset: 0.3, transform: "scale(1.25)" },
  { offset: 1, transform: "scale(1)" },
];
/** A badge new to the tray grows in (0077's poison badge: 0 -> 1.25 -> 1, 0.52 s). */
export const GROW_MS = 520;
function growFrames(col: string): Keyframe[] {
  return [
    { offset: 0, transform: "scale(0)", opacity: 0 },
    { offset: 0.55, transform: "scale(1.25)", opacity: 1, filter: `drop-shadow(0 0 8px ${col})` },
    { offset: 1, transform: "scale(1)", opacity: 1, filter: "drop-shadow(0 0 0 transparent)" },
  ];
}

/** A badge's picture, as an SVG of its own (for the pill too). */
export function CountPicture({ kind, className }: { kind: string; className?: string }) {
  const look = COUNT_LOOK[kind] ?? COUNT_LOOK["other"]!;
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
      <g fill={look.col}>{look.pic}</g>
    </svg>
  );
}

/**
 * One round badge: its picture and number, the number stepping when it
 * changes, with a +N/-N pill rising off it. [count] null: a badge with no
 * number (the city's blessing). A button: it opens the tray's list.
 */
export function CountBadge({
  kind,
  count,
  label,
  side,
  expanded,
  onClick,
  fresh = false,
}: {
  kind: string;
  count: number | null;
  label: string;
  side: "opponent" | "viewer";
  expanded: boolean;
  onClick: () => void;
  /** New in the tray on a later board: it grows in (the city's blessing: with its gold pulse). */
  fresh?: boolean;
}) {
  const look = COUNT_LOOK[kind] ?? COUNT_LOOK["other"]!;
  const ref = useRef<HTMLButtonElement>(null);
  useGrowIn(ref, look.col, !fresh);
  const [shown, setShown] = useState(count);
  const [pill, setPill] = useState<{ d: number; key: number } | null>(null);
  const last = useRef<number | null | undefined>(undefined);
  useLayoutEffect(() => {
    const was = last.current;
    last.current = count;
    const el = ref.current;
    const moves = !!el && typeof el.animate === "function" && !reducedMotion();
    // New in the tray on a later board (Aether Hub's first energy): it grows
    // in and its number rises from nothing, +N. On the first board seen it
    // is simply there.
    const from = was === undefined && fresh && count !== null && count > 0 ? 0 : was;
    if (from === undefined) {
      setShown(count);
      return undefined;
    }
    if (from === count) return undefined;
    if (!moves || count === null || from === null) {
      setShown(count);
      setPill(null);
      return undefined;
    }
    const d = count - from;
    const span = countStepMs(d) * (Math.abs(d) - 1);
    const clock = el.animate(PULSE, {
      duration: Math.max(COUNT_PULSE_MS, span + 200),
      easing: "ease-out",
    });
    setPill({ d, key: performance.now() });
    let frame = 0;
    const tick = () => {
      const t = Number(clock.currentTime ?? 0);
      setShown(steppedCount(from, count, t));
      if (clock.playState === "finished" || t >= span) {
        setShown(count);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    tick();
    const end = () => {
      window.cancelAnimationFrame(frame);
      setShown(count);
    };
    clock.onfinish = end;
    clock.oncancel = end;
    return () => window.cancelAnimationFrame(frame);
  }, [count, fresh]);
  // The pill's rise, on the page's animation clock.
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(".gs-count-pill");
    if (!pill || !el || typeof el.animate !== "function") return;
    const rise = el.animate(pillFrames(side === "opponent"), {
      duration: COUNT_PILL_MS,
      easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      fill: "both",
    });
    const done = () => setPill((now) => (now?.key === pill.key ? null : now));
    rise.onfinish = done;
    rise.oncancel = done;
  }, [pill, side]);
  useHurry(ref, pill !== null);
  return (
    <button
      ref={ref}
      type="button"
      className={`gs-count gs-count-${kind}`}
      data-count-kind={kind}
      data-count={count ?? undefined}
      data-shown={shown ?? undefined}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{ ["--count-col" as string]: look.col, ["--count-face" as string]: look.face }}
    >
      <svg viewBox="-20 -20 40 40" aria-hidden="true">
        <circle r="17.5" className="gs-count-rim" />
        <circle r="13.5" className="gs-count-face" />
        <g className="gs-count-pic">{look.pic}</g>
      </svg>
      {shown !== null && <b className="gs-count-n">{shown}</b>}
      {pill && (
        <span className="gs-count-pill" aria-hidden="true" data-pill={pill.d}>
          <CountPicture kind={kind} />
          <span>{pill.d > 0 ? `+${pill.d}` : `−${-pill.d}`}</span>
        </span>
      )}
    </button>
  );
}

/** Grows a badge (or tile, or map) new to the tray in, after the first board. */
export function useGrowIn(ref: { current: HTMLElement | null }, col: string, skip: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (skip || !el || typeof el.animate !== "function" || reducedMotion()) return;
    el.animate(growFrames(col), { duration: GROW_MS, easing: "ease-out" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it arrives
  }, []);
}

// --- the dungeon's map --------------------------------------------------------------------

type Room = NonNullable<CommandWords["rooms"]>[number];

/** The map's box (the canvas's 66 x 30), its rooms as dots by level and the paths between them. */
export const MAP_W = 66;
export const MAP_H = 30;
export interface MapLayout {
  rooms: { name: string; x: number; y: number; here: boolean }[];
  paths: [number, number][];
}

/**
 * Where each room sits on the little map: the first room (the one no room
 * leads to) at the left, every other a level further than the furthest room
 * leading to it, the rooms of a level spread top to bottom. From the game's
 * own rooms and where each leads -- nothing about any one dungeon here.
 */
export function mapLayout(rooms: readonly Room[]): MapLayout {
  const index = new Map(rooms.map((r, i) => [r.name, i] as const));
  const into = new Set(rooms.flatMap((r) => r.next));
  const level: number[] = rooms.map((r) => (into.has(r.name) ? -1 : 0));
  if (!level.includes(0) && level.length > 0) level[0] = 0;
  for (let pass = 0; pass < rooms.length; pass++)
    rooms.forEach((r, i) => {
      if (level[i]! < 0) return;
      for (const n of r.next) {
        const j = index.get(n);
        if (j !== undefined && level[j]! < level[i]! + 1) level[j] = level[i]! + 1;
      }
    });
  rooms.forEach((_, i) => {
    if (level[i]! < 0) level[i] = 0;
  });
  const deepest = Math.max(1, ...level);
  const byLevel = new Map<number, number[]>();
  level.forEach((l, i) => byLevel.set(l, [...(byLevel.get(l) ?? []), i]));
  const out: MapLayout["rooms"] = rooms.map((r) => ({ name: r.name, x: 0, y: 0, here: r.here }));
  for (const [l, members] of byLevel) {
    const gap = members.length > 1 ? Math.min(10, 20 / (members.length - 1)) : 0;
    members.forEach((i, k) => {
      out[i] = {
        ...out[i]!,
        x: 7 + (l / deepest) * (MAP_W - 14),
        y: MAP_H / 2 + (k - (members.length - 1) / 2) * gap,
      };
    });
  }
  const paths: [number, number][] = [];
  rooms.forEach((r, i) => {
    for (const n of r.next) {
      const j = index.get(n);
      if (j !== undefined) paths.push([i, j]);
    }
  });
  return { rooms: out, paths };
}

/** The venture (the canvas): the map lifts toward the table, the marker steps, it settles. */
export const MAP_LIFT_MS = 1600;
export const MAP_STEP_AT = 400;
export const MAP_STEP_MS = 450;
export const MAP_GLOW_AT = 850;
/** How far it lifts, in the rail's units, and how big it grows (the canvas's 150 left, 1 + 1.6). */
export const MAP_LIFT_X = -150;
export const MAP_LIFT_Y = 50;
export const MAP_LIFT_SCALE = 2.6;

export function mapLiftFrames(down: boolean): Keyframe[] {
  const up = `translate(${MAP_LIFT_X}px, ${down ? MAP_LIFT_Y : -MAP_LIFT_Y}px) scale(${MAP_LIFT_SCALE})`;
  return [
    { offset: 0, transform: "none" },
    { offset: 0.19, transform: up },
    { offset: 0.81, transform: up },
    { offset: 1, transform: "none" },
  ];
}

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * Spec 0086 (8) -- the dungeon as a small map card: rooms as dots by level,
 * the paths between them, the venture marker gold. When the marker's room
 * changes, the map lifts toward the table, the marker steps along to the
 * new room and that room glows, and the map settles back. A button: it
 * opens the tray's list (the rooms' words). [id]: the dungeon's card, so a
 * room's trigger rises from here (Amendment 1).
 */
export function DungeonMap({
  id,
  name,
  rooms,
  side,
  expanded,
  onClick,
  fresh,
}: {
  id: string | undefined;
  name: string;
  rooms: readonly Room[];
  side: "opponent" | "viewer";
  expanded: boolean;
  onClick: () => void;
  /** New in the tray (it grows in). */
  fresh: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const plan = mapLayout(rooms);
  const here = plan.rooms.findIndex((r) => r.here);
  const was = useRef(here);
  const [stepping, setStepping] = useState(false);
  useGrowIn(ref, "#b9a2ff", !fresh);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = here;
    const el = ref.current;
    if (from === here || here < 0 || !el || typeof el.animate !== "function" || reducedMotion())
      return;
    const lift = el.animate(mapLiftFrames(side === "opponent"), {
      duration: MAP_LIFT_MS,
      easing: "cubic-bezier(0.45, 0, 0.25, 1)",
    });
    setStepping(true);
    const done = () => setStepping(false);
    lift.onfinish = done;
    lift.oncancel = done;
    const marker = el.querySelector<HTMLElement>(".gs-map-marker");
    const a = from >= 0 ? plan.rooms[from]! : plan.rooms[here]!;
    const b = plan.rooms[here]!;
    marker?.animate(
      [
        { offset: 0, left: pct(a.x, MAP_W), top: pct(a.y, MAP_H) },
        {
          offset: 0.5,
          left: pct((a.x + b.x) / 2, MAP_W),
          top: pct((a.y + b.y) / 2 - 4, MAP_H),
        },
        { offset: 1, left: pct(b.x, MAP_W), top: pct(b.y, MAP_H) },
      ],
      {
        duration: MAP_STEP_MS,
        delay: MAP_STEP_AT,
        easing: "cubic-bezier(0.65, 0, 0.35, 1)",
        fill: "backwards",
      },
    );
    el.animate(
      [
        { offset: 0, boxShadow: "0 0 0 0 transparent" },
        { offset: 0.4, boxShadow: "0 0 10px 2px #b9a2ff" },
        { offset: 1, boxShadow: "0 0 0 0 transparent" },
      ],
      { duration: 500, delay: MAP_GLOW_AT, easing: "ease-out" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step
  }, [here]);
  useHurry(ref, stepping);
  const at = here >= 0 ? plan.rooms[here] : undefined;
  return (
    <button
      ref={ref}
      type="button"
      className={`gs-map${stepping ? " gs-map-stepping" : ""}`}
      data-rise-from={id}
      data-dungeon={name}
      data-room={at?.name}
      aria-expanded={expanded}
      aria-label={`${name}${at ? `, in ${at.name}` : ""}`}
      title={`${name}${at ? ` · ${at.name}` : ""}`}
      onClick={onClick}
    >
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true">
        {plan.paths.map(([i, j]) => (
          <line
            key={`${i}-${j}`}
            x1={plan.rooms[i]!.x}
            y1={plan.rooms[i]!.y}
            x2={plan.rooms[j]!.x}
            y2={plan.rooms[j]!.y}
            className="gs-map-path"
          />
        ))}
        {plan.rooms.map((r, i) => (
          <circle
            key={r.name}
            cx={r.x}
            cy={r.y}
            r={2.6}
            className={`gs-map-room${i === here ? " gs-map-here" : ""}`}
            data-room-name={r.name}
          />
        ))}
      </svg>
      {at && (
        <span
          className="gs-map-marker"
          aria-hidden="true"
          style={{ left: pct(at.x, MAP_W), top: pct(at.y, MAP_H) }}
        />
      )}
    </button>
  );
}

/** Spec 0086 (8) -- a completed dungeon's picture in the report window: a map, its rooms unlit. */
export function DungeonPicture() {
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} aria-hidden="true" className="gs-map-picture">
      <rect x="0.5" y="0.5" width={MAP_W - 1} height={MAP_H - 1} rx="3" className="gs-map-card" />
      {[
        [7, 15, 20, 9],
        [7, 15, 20, 21],
        [20, 9, 33, 15],
        [20, 21, 33, 15],
        [33, 15, 46, 9],
        [33, 15, 46, 21],
        [46, 9, 59, 15],
        [46, 21, 59, 15],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="gs-map-path" />
      ))}
      {[
        [7, 15],
        [20, 9],
        [20, 21],
        [33, 15],
        [46, 9],
        [46, 21],
        [59, 15],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={2.6} className="gs-map-room gs-map-here" />
      ))}
    </svg>
  );
}

// --- emblems ------------------------------------------------------------------------------

const STAR = (
  <svg viewBox="0 0 20 20" aria-hidden="true" className="gs-emblem-star">
    <path d="M10 1 L12.6 7 L19 7.6 L14 11.8 L15.6 18.4 L10 14.8 L4.4 18.4 L6 11.8 L1 7.6 L7.4 7Z" />
  </svg>
);

/**
 * Spec 0086 (8) -- an emblem as a small square tile with the picture of the
 * card that made it (its planeswalker's art crop, else its picture) and a
 * star; pointing (or the list) says its words. Its trigger rises from here
 * (Amendment 1).
 */
export function EmblemTile({
  id,
  name,
  emblem,
  says,
  artUrl,
  expanded,
  onClick,
  fresh,
}: {
  id: string | undefined;
  name: string;
  emblem: SnapshotEmblem | undefined;
  says: string | undefined;
  artUrl: ((art: string) => string) | undefined;
  expanded: boolean;
  onClick: () => void;
  fresh: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useGrowIn(ref, "#b9a2ff", !fresh);
  const picture = emblem?.crop ?? emblem?.art ?? null;
  return (
    <button
      ref={ref}
      type="button"
      className="gs-emblem"
      data-rise-from={id}
      data-emblem={id}
      aria-expanded={expanded}
      aria-label={`${name}${says ? `: ${says}` : ""}`}
      title={says ? `${name}: ${says}` : name}
      onClick={onClick}
    >
      {picture && artUrl ? (
        <img src={artUrl(picture)} alt="" draggable={false} />
      ) : (
        <span className="gs-emblem-plain" aria-hidden="true" />
      )}
      {STAR}
    </button>
  );
}

// --- the crown and the initiative, on the face -------------------------------------------

export const CROWN = (
  <svg viewBox="0 0 28 22" aria-hidden="true">
    <path
      d="M2 18 L3.5 6 L9 11 L14 3 L19 11 L24.5 6 L26 18 Z"
      fill="#f2c95c"
      stroke="#5a3c0c"
      strokeWidth="1"
    />
    <path d="M5 15 L23 15" stroke="#fff3cc" strokeWidth="0.8" opacity="0.7" />
    <rect
      x="2"
      y="17"
      width="24"
      height="4"
      rx="1"
      fill="#c99a3a"
      stroke="#5a3c0c"
      strokeWidth="0.8"
    />
    <circle cx="14" cy="12.5" r="2" fill="#d8162b" />
    <circle cx="3.5" cy="6" r="1.4" fill="#fff3cc" />
    <circle cx="14" cy="3" r="1.4" fill="#fff3cc" />
    <circle cx="24.5" cy="6" r="1.4" fill="#fff3cc" />
  </svg>
);

export const INITIATIVE = (
  <svg viewBox="0 0 24 28" aria-hidden="true">
    <path
      d="M12 1 L23 5 V14 C23 21 18 25 12 27 C6 25 1 21 1 14 V5 Z"
      fill="#2a2240"
      stroke="#e0b860"
      strokeWidth="1.6"
    />
    <path d="M8 22 V13 A4 4 0 0 1 16 13 V22 Z" fill="#0b0912" stroke="#b9a2ff" strokeWidth="1.2" />
  </svg>
);

/** The rules' own words for each (they never change), as the tray's list says them. */
export const HOLDER_WORDS: Record<string, string> = {
  monarch: "The monarch: draws a card at the end of their turn. Combat damage to them takes it.",
  initiative:
    "The initiative: ventures into the Undercity each upkeep. Combat damage to them takes it.",
};

/**
 * Spec 0086 (8) -- the crown on the monarch's face picture (top), the
 * initiative on its lower corner. Each glows while its own trigger waits on
 * the stack (the monarch's end-step draw, the initiative's venture), and a
 * trigger of its own rises from it (Amendment 1).
 */
function FaceMarksView({
  seat,
  designations,
  stack,
}: {
  seat: number;
  designations: readonly string[];
  stack: readonly StackEntry[];
}) {
  const marks = (["monarch", "initiative"] as const).filter((d) => designations.includes(d));
  if (marks.length === 0) return null;
  return (
    <>
      {marks.map((kind) => {
        const glowing = stack.some((s) => s.from === kind && s.controller === seat);
        return (
          <span
            key={kind}
            className={`gs-holder gs-holder-${kind}${glowing ? " gs-holder-glow" : ""}`}
            data-holder={kind}
            data-seat={seat}
            data-rise-from={`${kind}:${seat}`}
            role="img"
            aria-label={HOLDER_WORDS[kind]}
            title={HOLDER_WORDS[kind]}
          >
            {kind === "monarch" ? CROWN : INITIATIVE}
          </span>
        );
      })}
    </>
  );
}

export const FaceMarks = memo(FaceMarksView, sameProps);
