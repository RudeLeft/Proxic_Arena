// Spec 0086 (owner 2026-11-13, canvas gaps-players-1113) -- what flies
// between the players' marks, once per board, over everything (a fixed layer
// on the page, as the mana balls are):
//
//   8     the crown and the initiative lift off one face and fly to the
//         other (an arc out over the table, growing a little, glowing), and
//         land with a pulse; the first time either is held it grows in on
//         its face (playerMarks.tsx). An emblem grows out of the ability that
//         made it on the stack and flies into its owner's tray, where its
//         tile pulses. Amendment 1: the Ring's gold ring (0076's mark) flies
//         from the old Ring-bearer to the new one instead of popping.
//   7 B   paying energy sends sparks from the energy badge to what it paid
//         for: the spell being cast, or the one on the stack.
//   11 A  each mana added to a pool flies as one ball from its source (a
//         land, Dark Ritual on the stack, a creature) into the pool's chip,
//         whose count steps up as each lands (poolHeld.ts), with a rising +N;
//         past 6 from one source, one larger ball with "xN". Spending keeps
//         0062's balls, with a rising -N. Amendment 1: mana lost at the end
//         of a step fades out of the chip with a grey -N.
//
// Each is a Web Animation in the layer or on its destination, so a click or
// a key hurries all of it (A-00); with reduce motion nothing flies -- the
// marks and counts simply change. Nothing here can be clicked.

import { Component, useEffect, useLayoutEffect, useRef } from "react";
import type { ManaRun, Snapshot, SnapshotPlayer } from "../match";
import { ballBackground, ballColour, ballPath, BALL_MS, BALL_LAG_MS } from "./manaBalls";
import { paced, hurry } from "./motion";
import { symbolUrl } from "./ManaCost";
import { pillFrames, COUNT_PILL_MS, reducedMotion } from "./playerMarks";
import { holdPool, poolKey, releaseAllPools, releasePool } from "./poolHeld";

interface Point {
  x: number;
  y: number;
}
interface Rect extends Point {
  w: number;
  h: number;
}

/** A crown or initiative token in flight (the canvas: 0.75 s, up to x1.7, a glow). */
export const HOLDER_FLY_MS = paced(750);
/** The landing pulse (x1.25, 0.3 s) and its glow. */
export const HOLDER_LAND_MS = paced(300);
/** An emblem from the stack to its tile (the canvas's 0.8 s). */
export const EMBLEM_FLY_MS = paced(800);
/** It leaves once its ability has resolved (the stack card's resolve glow, 0.38 s). */
export const EMBLEM_AFTER_MS = paced(380);
/** The Ring's ring between bearers. */
export const RING_FLY_MS = paced(650);
/** Energy's sparks (the canvas: 0.55 s, 70 ms apart, at most 6). */
export const SPARK_MS = paced(550);
export const SPARKS_MAX = 6;
/** Past this many mana from one source, one larger ball flies with "xN" (Amendment 1). */
export const BALLS_ONE_BY_ONE = 6;
/** Mana lost at the end of a step: its balls fade out of the chip. */
export const LOST_MS = paced(600);

const ENERGY_BALL = { core: "#fff8d8", body: "#e8c547", glow: "#ffe58a" };
const easeIO = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const bump = (t: number) => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t));

/** A quadratic arc [a] -> [b] through control point [c], eased in and out, as [n + 1] points. */
export function arc(a: Point, b: Point, c: Point, n = 16): (Point & { t: number })[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = easeIO(i / n);
    const u = 1 - t;
    return {
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      t: i / n,
    };
  });
}

// --- what changed (pure, for the tests) -----------------------------------------------

const playerOf = (board: Snapshot | null, seat: number) =>
  board?.players.find((p) => p.seat === seat);

/** Who holds [name] ("monarch", "initiative") on [board], or 0. */
export function holderOf(board: Snapshot | null, name: string): number {
  return board?.players.find((p) => p.designations.includes(name))?.seat ?? 0;
}

/** A player's counter by Forge's name ("ENERGY"). */
export function countOf(player: SnapshotPlayer | undefined, name: string): number {
  return player?.counters.find((c) => c.name.toUpperCase() === name)?.count ?? 0;
}

/** The pool as runs, from `manaFrom`, or (an older worker) by colour with no source. */
export function runsOf(player: SnapshotPlayer | undefined): ManaRun[] {
  if (!player) return [];
  if (player.manaFrom && player.manaFrom.length > 0) return player.manaFrom;
  return Object.entries(player.manaPool)
    .filter(([, n]) => n > 0)
    .map(([colour, n]) => ({ colour, n }));
}

/** The mana that came into [now]'s pool since [was]: each colour and source, how many. */
export function poolIn(was: SnapshotPlayer | undefined, now: SnapshotPlayer): ManaRun[] {
  const before = new Map<string, number>();
  for (const r of runsOf(was)) {
    const key = `${r.colour}|${r.from ?? ""}`;
    before.set(key, (before.get(key) ?? 0) + r.n);
  }
  const out: ManaRun[] = [];
  for (const r of runsOf(now)) {
    const key = `${r.colour}|${r.from ?? ""}`;
    const had = before.get(key) ?? 0;
    const more = r.n - had;
    before.set(key, Math.max(0, had - r.n));
    if (more > 0) out.push({ colour: r.colour, n: more, ...(r.from ? { from: r.from } : {}) });
  }
  return out;
}

/** What went out of [now]'s pool since [was], per colour: spent (paid from the pool) or lost. */
export function poolOut(
  was: SnapshotPlayer | undefined,
  now: SnapshotPlayer,
  paidFromPool: Record<string, number>,
  stepEnded: boolean,
): { colour: string; spent: number; lost: number }[] {
  if (!was) return [];
  const out: { colour: string; spent: number; lost: number }[] = [];
  for (const [colour, had] of Object.entries(was.manaPool)) {
    const less = had - (now.manaPool[colour] ?? 0);
    if (less <= 0) continue;
    const spent = stepEnded ? Math.min(less, paidFromPool[colour] ?? 0) : less;
    out.push({ colour, spent, lost: less - spent });
  }
  return out;
}

/** The pool mana each seat paid with in [now]'s payment steps newer than [since]. */
export function paidFromPool(now: Snapshot, since: number): Map<number, Record<string, number>> {
  const out = new Map<number, Record<string, number>>();
  for (const p of now.payments ?? []) {
    if (p.n <= since) continue;
    for (const m of p.mana) {
      if (m.from !== "pool") continue;
      const mine = out.get(p.seat) ?? {};
      mine[m.colour] = (mine[m.colour] ?? 0) + 1;
      out.set(p.seat, mine);
    }
  }
  return out;
}

/** The Ring-bearer each seat controls on [board]: card id by seat. */
export function ringBearers(board: Snapshot | null): Map<number, string> {
  const out = new Map<number, string>();
  for (const c of board?.battlefield ?? []) if (c.ringBearer) out.set(c.seat, c.id);
  return out;
}

// --- the layer --------------------------------------------------------------------------

function rectOf(el: Element | null | undefined): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) {
    // Growing in from nothing (scale 0): its centre, at its layout size.
    const own = el as HTMLElement;
    const w = own.offsetWidth || 0;
    const h = own.offsetHeight || 0;
    if (w === 0 && h === 0) return null;
    return { x: r.left, y: r.top, w, h };
  }
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
}

/** A copy of a mark to fly: no ids or data that the page looks things up by. */
function cloneOf(el: Element): HTMLElement {
  const copy = el.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll("*")]) {
    for (const name of [...node.getAttributeNames()])
      if (name.startsWith("data-") || name === "id" || name === "aria-label")
        node.removeAttribute(name);
  }
  copy.removeAttribute("title");
  return copy;
}

interface Remembered {
  stack: Map<string, { rect: Rect; source: string | null; controller: number | null }>;
  cards: Map<string, Rect>;
  holders: Map<string, Rect>;
  rings: Map<string, Rect>;
  pools: Map<string, Rect>;
  energy: Map<number, Rect>;
}

const empty = (): Remembered => ({
  stack: new Map(),
  cards: new Map(),
  holders: new Map(),
  rings: new Map(),
  pools: new Map(),
  energy: new Map(),
});

/**
 * Spec 0086 -- the flights between players' marks, for each new board. Put
 * in the board's overlay; draws nothing in it (its layer is on the page).
 */
export function PlayerFlights({ board }: { board: Snapshot }) {
  const layer = useRef<HTMLDivElement | null>(null);
  if (layer.current === null && typeof document !== "undefined") {
    const el = document.createElement("div");
    el.className = "gs-flights";
    el.setAttribute("aria-hidden", "true");
    layer.current = el;
  }
  const was = useRef<Snapshot | null>(null);
  const seen = useRef(empty());
  /** Destinations held hidden until their flight lands: hurried with the layer. */
  const landing = useRef(new Set<Element>());

  useEffect(() => {
    const el = layer.current;
    if (!el) return undefined;
    document.body.appendChild(el);
    const now = () => {
      hurry(el);
      for (const target of landing.current) hurry(target);
    };
    document.addEventListener("pointerdown", now, true);
    document.addEventListener("keydown", now, true);
    const held = landing.current;
    return () => {
      document.removeEventListener("pointerdown", now, true);
      document.removeEventListener("keydown", now, true);
      el.remove();
      held.clear();
      releaseAllPools();
    };
  }, []);

  // Spec 0095 -- where things fly from is read off the board on screen just
  // before the next one is drawn (React's last look before it changes the
  // page), and only when something will fly, and then only the cards that
  // will: no card is measured on an update where nothing flies, and nothing
  // is read after this layer's writes.
  const measureBefore = (next: Snapshot) => {
    const before = was.current;
    seen.current =
      before && before.gameEpoch === next.gameEpoch && !reducedMotion()
        ? remember(before, flyingFrom(before, next))
        : empty();
  };

  useLayoutEffect(() => {
    const before = was.current;
    const old = seen.current;
    seen.current = empty();
    if (before !== board) {
      was.current = board;
      const sameGame = before && before.gameEpoch === board.gameEpoch;
      if (
        sameGame &&
        !reducedMotion() &&
        layer.current &&
        typeof layer.current.animate === "function"
      )
        play(before, board, old);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per board
  }, [board]);

  function dot(css: Partial<CSSStyleDeclaration>, className = "gs-flight"): HTMLElement {
    const el = document.createElement("span");
    el.className = className;
    Object.assign(el.style, css);
    layer.current!.appendChild(el);
    return el;
  }

  /** [el] waits hidden until [at] ms, then pulses (x1.25) with a [glow]. */
  function holdThenLand(el: Element, at: number, glow: string) {
    if (typeof (el as HTMLElement).animate !== "function") return;
    landing.current.add(el);
    const wait = (el as HTMLElement).animate([{ opacity: 0 }, { opacity: 0 }], { duration: at });
    const land = (el as HTMLElement).animate(
      [
        { offset: 0, transform: "scale(1)", filter: `drop-shadow(0 0 0 ${glow})` },
        { offset: 0.45, transform: "scale(1.25)", filter: `drop-shadow(0 0 9px ${glow})` },
        { offset: 1, transform: "scale(1)", filter: "drop-shadow(0 0 0 transparent)" },
      ],
      { duration: HOLDER_LAND_MS * 1.5, delay: at, easing: "ease-out", fill: "backwards" },
    );
    const done = () => landing.current.delete(el);
    land.onfinish = done;
    land.oncancel = done;
    void wait;
  }

  /** A copy of [from] flies [a] -> [b] along [path], growing by [grow] at the middle, glowing. */
  function flyCopy(
    from: Element,
    a: Rect,
    b: Rect,
    control: Point,
    ms: number,
    glow: string,
    grow = 0.7,
    startScale = 1,
    delay = 0,
  ) {
    const copy = cloneOf(from);
    copy.classList.add("gs-flight-copy");
    Object.assign(copy.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: `${b.w}px`,
      height: `${b.h}px`,
      margin: "0",
    });
    layer.current!.appendChild(copy);
    const k0 = Math.max(0.2, (a.w / Math.max(1, b.w)) * startScale);
    const frames = arc(a, b, control).map((p) => {
      const s = (k0 + (1 - k0) * p.t) * (1 + grow * bump(p.t));
      return {
        transform: `translate(${p.x - b.w / 2}px, ${p.y - b.h / 2}px) scale(${s})`,
        filter: `drop-shadow(0 0 ${(4 + 8 * bump(p.t)).toFixed(1)}px ${glow})`,
      };
    });
    const flight = copy.animate(frames, { duration: ms, delay, easing: "linear", fill: "both" });
    const gone = () => copy.remove();
    flight.onfinish = gone;
    flight.oncancel = gone;
  }

  /** One ball (0062's look) [a] -> [b], with a short trail; [label] "x12" on a big one. */
  function ball(
    colour: { core: string; body: string; glow: string } | string,
    a: Point,
    b: Point,
    delay: number,
    size: number,
    ms: number,
    label?: string,
    onLand?: () => void,
  ) {
    const c = typeof colour === "string" ? ballColour(colour) : colour;
    const background =
      typeof colour === "string"
        ? ballBackground(colour)
        : `radial-gradient(circle at 38% 36%, ${c.core} 0 22%, ${c.body} 48%, ${c.body} 100%)`;
    const pts = ballPath(a, b);
    const tf = (p: Point, s: number) => `translate(${p.x - s / 2}px, ${p.y - s / 2}px)`;
    const head = dot({
      width: `${size}px`,
      height: `${size}px`,
      background,
      boxShadow: `0 0 0 1.5px ${c.glow}, 0 0 10px 3px ${c.glow}`,
      opacity: "0",
    });
    if (label) {
      head.textContent = label;
      head.classList.add("gs-flight-big");
    }
    const flight = head.animate(
      pts.map((p, j) => ({ transform: tf(p, size), opacity: j === 0 ? 0 : 1 })),
      { duration: ms, delay, easing: "linear", fill: "both" },
    );
    for (let i = 1; i <= 3; i++) {
      const s = Math.max(3, size * 0.32);
      const trail = dot({
        width: `${s}px`,
        height: `${s}px`,
        background: c.core,
        boxShadow: `0 0 6px 2px ${c.glow}`,
        opacity: "0",
      });
      const t = trail.animate(
        pts.map((p, j) => ({
          transform: tf({ x: p.x, y: p.y + 5 * i }, s),
          opacity: j === 0 || j === pts.length - 1 ? 0 : 0.75 - 0.22 * i,
        })),
        { duration: ms, delay: delay + paced(70) * i, easing: "linear", fill: "both" },
      );
      const off = () => trail.remove();
      t.onfinish = off;
      t.oncancel = off;
    }
    let landed = false;
    const end = () => {
      head.remove();
      if (landed) return;
      landed = true;
      onLand?.();
    };
    flight.onfinish = end;
    flight.oncancel = end;
  }

  /** A +N / -N pill in a badge's colours (grey for mana lost), rising off [at]. */
  function pill(
    at: Rect,
    text: string,
    look: { col: string; face: string },
    down: boolean,
    pic: string | null,
    delay = 0,
  ) {
    const el = dot(
      {
        left: `${at.x}px`,
        top: `${at.y}px`,
        background: look.face,
        borderColor: look.col,
        color: look.col,
        opacity: "0",
      },
      "gs-count-pill gs-flight-pill",
    );
    if (pic) {
      const img = document.createElement("img");
      img.src = pic;
      img.alt = "";
      el.appendChild(img);
    }
    const word = document.createElement("span");
    word.textContent = text;
    el.appendChild(word);
    const rise = el.animate(pillFrames(down), {
      duration: COUNT_PILL_MS,
      delay,
      easing: "cubic-bezier(0.33, 1, 0.68, 1)",
      fill: "both",
    });
    const off = () => el.remove();
    rise.onfinish = off;
    rise.oncancel = off;
  }

  function play(before: Snapshot, now: Snapshot, old: Remembered) {
    const sideOf = (seat: number) => (seat === now.seat && !now.spectator ? "viewer" : "opponent");
    // 8 -- the crown and the initiative, face to face.
    for (const kind of ["monarch", "initiative"] as const) {
      const from = holderOf(before, kind);
      const to = holderOf(now, kind);
      if (from === to || to === 0) continue;
      const dest = document.querySelector(`[data-holder="${kind}"][data-seat="${to}"]`);
      const b = rectOf(dest);
      if (!dest || !b) continue;
      const a = from ? old.holders.get(`${kind}:${from}`) : undefined;
      const glow = kind === "monarch" ? "#f2c46a" : "#b9a2ff";
      if (!a) {
        // Held for the first time: it grows in on its face.
        (dest as HTMLElement).animate?.(
          [
            { offset: 0, transform: "scale(0)", opacity: 0 },
            {
              offset: 0.55,
              transform: "scale(1.3)",
              opacity: 1,
              filter: `drop-shadow(0 0 9px ${glow})`,
            },
            { offset: 1, transform: "scale(1)", opacity: 1 },
          ],
          { duration: paced(520), easing: "ease-out" },
        );
        landing.current.add(dest);
        continue;
      }
      const k = b.w / 24;
      flyCopy(
        dest,
        a,
        b,
        { x: Math.min(a.x, b.x) - 110 * k, y: (a.y + b.y) / 2 },
        HOLDER_FLY_MS,
        glow,
      );
      holdThenLand(dest, HOLDER_FLY_MS, glow);
    }
    // Amendment 1 -- the Ring's ring, from the old bearer to the new.
    const ringsWere = ringBearers(before);
    for (const [seat, card] of ringBearers(now)) {
      const was = ringsWere.get(seat);
      if (!was || was === card) continue;
      const a = old.rings.get(was);
      const dest = document.querySelector(`[data-object-id="${card}"] .bf-mark-ring`);
      const b = rectOf(dest);
      if (!a || !dest || !b) continue;
      flyCopy(
        dest,
        a,
        b,
        { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 60 },
        RING_FLY_MS,
        "#f2c46a",
        0.5,
      );
      holdThenLand(dest, RING_FLY_MS, "#f2c46a");
    }
    // 8 -- an emblem out of its ability on the stack, into its tile.
    const had = new Set((before.emblems ?? []).map((e) => e.id));
    for (const e of now.emblems ?? []) {
      if (had.has(e.id)) continue;
      const dest = document.querySelector(`[data-emblem="${e.id}"]`);
      // It flies in: not the tile's own growing in as well.
      if (dest && typeof dest.getAnimations === "function")
        for (const a of dest.getAnimations()) a.cancel();
      const b = rectOf(dest);
      if (!dest || !b) continue;
      const source = [...old.stack.values()].find((s) => e.from && s.source === e.from);
      const a = source?.rect ?? (e.from ? (old.cards.get(e.from) ?? null) : null);
      if (!a) continue;
      flyCopy(
        dest,
        a,
        b,
        { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - 60 },
        EMBLEM_FLY_MS,
        "#b9a2ff",
        0.9,
        // Out of the card: a third of the tile's size as it leaves.
        0.3 * (b.w / Math.max(1, a.w)),
        EMBLEM_AFTER_MS,
      );
      holdThenLand(dest, EMBLEM_AFTER_MS + EMBLEM_FLY_MS, "#b9a2ff");
    }
    // 7 B -- energy paid: sparks to what it paid for.
    for (const p of now.players) {
      const less = countOf(playerOf(before, p.seat), "ENERGY") - countOf(p, "ENERGY");
      if (less <= 0) continue;
      const from =
        rectOf(
          document.querySelector(`.gs-status[data-seat="${p.seat}"] [data-count-kind="energy"]`),
        ) ?? old.energy.get(p.seat);
      const casting = now.casting.find((c) => c.seat === p.seat);
      const to =
        (casting ? rectOf(document.querySelector(`[data-ball-for="${casting.id}"]`)) : null) ??
        [...old.stack.values()].find((s) => s.controller === p.seat)?.rect ??
        rectOf(
          document.querySelector(
            `[data-object-id="${now.stack.find((s) => s.controller === p.seat)?.id ?? "none"}"]`,
          ),
        );
      if (!from || !to) continue;
      for (let i = 0; i < Math.min(less, SPARKS_MAX); i++)
        ball(ENERGY_BALL, from, to, i * BALL_LAG_MS, Math.max(7, from.w * 0.36), SPARK_MS);
    }
    // 11 A -- mana in, mana spent, mana lost.
    const paid = paidFromPool(
      now,
      (before.payments ?? []).reduce((most, p) => Math.max(most, p.n), 0),
    );
    const stepEnded = before.phase !== now.phase || before.turn !== now.turn;
    for (const p of now.players) {
      const prev = playerOf(before, p.seat);
      const down = sideOf(p.seat) === "opponent";
      for (const run of poolIn(prev, p)) {
        const key = poolKey(p.seat, run.colour);
        const chip = document.querySelector(`[data-pool="${key}"]`);
        const b = rectOf(chip) ?? old.pools.get(key);
        const source = run.from
          ? (rectOf(document.querySelector(`.bf-card[data-object-id="${run.from}"]`)) ??
            [...old.stack.values()].find((s) => s.source === run.from)?.rect ??
            old.cards.get(run.from) ??
            null)
          : null;
        if (!b || !source) continue;
        holdPool(key, run.n);
        const size = Math.max(10, Math.min(22, b.h * 0.7));
        const look = { col: ballColour(run.colour).glow, face: ballColour(run.colour).body };
        let first = true;
        const landed = (n: number) => () => {
          releasePool(key, n);
          const at = rectOf(document.querySelector(`[data-pool="${key}"]`)) ?? b;
          document
            .querySelector<HTMLElement>(`[data-pool="${key}"]`)
            ?.animate?.(
              [
                { transform: "scale(1)" },
                { transform: "scale(1.3)", offset: 0.4 },
                { transform: "scale(1)" },
              ],
              { duration: paced(300), easing: "ease-out" },
            );
          if (first) {
            first = false;
            pill(at, `+${run.n}`, look, down, symbolOf(run.colour));
          }
        };
        if (run.n > BALLS_ONE_BY_ONE) {
          ball(run.colour, source, b, 0, size * 1.6, BALL_MS, `×${run.n}`, landed(run.n));
        } else {
          for (let i = 0; i < run.n; i++)
            ball(run.colour, source, b, i * BALL_LAG_MS, size, BALL_MS, undefined, landed(1));
        }
      }
      for (const out of poolOut(prev, p, paid.get(p.seat) ?? {}, stepEnded)) {
        const key = poolKey(p.seat, out.colour);
        const at = rectOf(document.querySelector(`[data-pool="${key}"]`)) ?? old.pools.get(key);
        if (!at) continue;
        const c = ballColour(out.colour);
        if (out.spent > 0)
          pill(at, `−${out.spent}`, { col: c.glow, face: c.body }, down, symbolOf(out.colour));
        if (out.lost > 0) {
          pill(at, `−${out.lost}`, { col: "#b7bdc6", face: "#2a2f36" }, down, null);
          for (let i = 0; i < Math.min(out.lost, SPARKS_MAX); i++) {
            const s = Math.max(8, at.h * 0.5);
            const grey = dot({
              width: `${s}px`,
              height: `${s}px`,
              background:
                "radial-gradient(circle at 38% 36%, #f2f4f6 0 22%, #8d939b 48%, #8d939b 100%)",
              opacity: "0",
            });
            const dx = (i - (Math.min(out.lost, SPARKS_MAX) - 1) / 2) * s * 0.8;
            const fade = grey.animate(
              [
                {
                  offset: 0,
                  opacity: 0.9,
                  transform: `translate(${at.x + dx - s / 2}px, ${at.y - s / 2}px) scale(1)`,
                },
                {
                  offset: 1,
                  opacity: 0,
                  transform: `translate(${at.x + dx - s / 2}px, ${at.y - s / 2 + (down ? -10 : 10)}px) scale(0.4)`,
                },
              ],
              { duration: LOST_MS, delay: i * 60, easing: "ease-in", fill: "both" },
            );
            const off = () => grey.remove();
            fade.onfinish = off;
            fade.oncancel = off;
          }
        }
      }
    }
  }

  return <BeforeDrawn board={board} onBefore={measureBefore} />;
}

/**
 * Spec 0095 -- tells [onBefore] of a new board in the moment before React
 * changes the page for it (getSnapshotBeforeUpdate): the old board is still
 * on screen, and nothing has been written since it was last laid out.
 */
class BeforeDrawn extends Component<{ board: Snapshot; onBefore: (next: Snapshot) => void }> {
  override getSnapshotBeforeUpdate(previous: { board: Snapshot }) {
    if (previous.board !== this.props.board) this.props.onBefore(this.props.board);
    return null;
  }
  override componentDidUpdate() {}
  override render() {
    return null;
  }
}

/**
 * Spec 0095 -- whether anything will fly from [before] to [next], and which
 * cards it may fly from (an emblem's maker, mana's source): null when nothing
 * flies. Mirrors what `play` reads from the remembered board.
 */
export function flyingFrom(before: Snapshot, next: Snapshot): Set<string> | null {
  const cards = new Set<string>();
  let flies = false;
  for (const kind of ["monarch", "initiative"])
    if (holderOf(before, kind) !== holderOf(next, kind)) flies = true;
  const ringsWere = ringBearers(before);
  for (const [seat, card] of ringBearers(next)) {
    const was = ringsWere.get(seat);
    if (was && was !== card) flies = true;
  }
  const had = new Set((before.emblems ?? []).map((e) => e.id));
  for (const e of next.emblems ?? []) {
    if (had.has(e.id)) continue;
    flies = true;
    if (e.from) cards.add(e.from);
  }
  for (const p of next.players) {
    const prev = playerOf(before, p.seat);
    if (countOf(prev, "ENERGY") > countOf(p, "ENERGY")) flies = true;
    for (const run of poolIn(prev, p)) {
      flies = true;
      if (run.from) cards.add(run.from);
    }
    if (poolOut(prev, p, {}, false).length > 0) flies = true;
  }
  return flies ? cards : null;
}

/** A colour's mana symbol picture (the tray's own). */
function symbolOf(colour: string): string | null {
  return symbolUrl(colour) ?? null;
}

/**
 * Where everything that may fly from is drawn, for the next board: nothing
 * when nothing flies ([cards] null), and of the cards only [cards].
 */
function remember(board: Snapshot, cards: ReadonlySet<string> | null): Remembered {
  const out = empty();
  if (typeof document === "undefined" || cards === null) return out;
  for (const s of board.stack) {
    const r = rectOf(document.querySelector(`[data-object-id="${s.id}"]`));
    if (r) out.stack.set(s.id, { rect: r, source: s.source, controller: s.controller });
  }
  for (const c of board.battlefield) {
    if (!cards.has(c.id)) continue;
    const r = rectOf(document.querySelector(`.bf-card[data-object-id="${c.id}"]`));
    if (r) out.cards.set(c.id, r);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-holder][data-seat]")) {
    const r = rectOf(el);
    if (r) out.holders.set(`${el.dataset["holder"]}:${el.dataset["seat"]}`, r);
  }
  for (const el of document.querySelectorAll<HTMLElement>(".bf-mark-ring")) {
    const id = el.closest<HTMLElement>("[data-object-id]")?.dataset["objectId"];
    const r = rectOf(el);
    if (id && r) out.rings.set(id, r);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-pool]")) {
    const r = rectOf(el);
    if (r) out.pools.set(el.dataset["pool"] ?? "", r);
  }
  for (const el of document.querySelectorAll<HTMLElement>(
    '.gs-status [data-count-kind="energy"]',
  )) {
    const seat = Number(el.closest<HTMLElement>(".gs-status")?.dataset["seat"]);
    const r = rectOf(el);
    if (r && Number.isFinite(seat)) out.energy.set(seat, r);
  }
  return out;
}
