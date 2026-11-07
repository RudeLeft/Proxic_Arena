// The spell being cast, in the middle of the table — spec 0042 (owner
// 2026-10-30, look C · Embers).
//
// Clicked in hand, a card used to vanish until it was paid for: a player
// who forgot its cost had to cancel and look again. Now it floats out of
// the hand to the middle, large, swaying, sparks in its own colour
// drifting up around it, its cost under it lighting up as it is paid; the
// questions about it sit beside it. Paid, it flies to where it lands (the
// stack, or the battlefield); cancelled, back to the hand. Both players
// see it: casting is public from its first step (CR 601.2a), and the
// snapshot names only what this viewer may know.
//
// Spec 0044 (owner 2026-10-31) -- a question that needs the table (a
// target, a sacrifice) moves it beside the stack, so the creatures under
// the middle can be clicked. The opponent sees its back while it is paid
// for ("Pat is casting a spell…"); committed, it flips to the face, holds,
// and flies to the stack.

import { useEffect, useLayoutEffect, useRef } from "react";
import type { Decision, SnapshotCard } from "../match";
import type { Question } from "./interaction";
import { stackSpotBoxes } from "./effects";
import { SharpCard, closeUpOf } from "../closeUp";
import { figure } from "./Board";
import type { Box, Geometry } from "./layout";
import { manaSymbols, symbolUrl } from "./ManaCost";

/** How much bigger than a card on the table. */
const GROW = 2.5;
/** Docked beside the stack, this much bigger: still readable. */
const DOCKED = 1.5;
/** Rises out of the hand, and flies away, in this long. */
export const FLY_MS = 560;
/**
 * Owner 2026-11-01 (item 2) -- how long the cast card waits before it sets
 * off: long enough to hear that nobody answered and the permanent is
 * already on the battlefield (a few hundredths of a second in practice),
 * too short to notice.
 */
export const DECIDE_MS = 150;
/** The short glide after landing when its place moved during the flight. */
const SETTLE_MS = 140;
/** The opponent's card: turning over, then held face up, before it flies. */
export const FLIP_MS = 420;
export const HOLD_MS = 650;

/**
 * Where the card floats: the middle of the table, as big as fits -- or,
 * `docked`, just left of the stack, out of the way of the table.
 */
export function castingBox(g: Geometry, docked = false): Box {
  const h = docked
    ? Math.min(g.cardH * DOCKED, g.height * 0.4)
    : Math.min(g.cardH * GROW, g.height * 0.5);
  const w = (h * g.cardW) / g.cardH;
  if (docked) {
    const stack = stackSpotBoxes(g, 1)[0]!;
    return {
      x: stack.x - g.inset * 2 - w,
      y: Math.max(g.height * 0.1, g.height / 2 - h / 2),
      w,
      h,
      scale: h / g.cardH,
      rotation: 0,
      z: 0,
    };
  }
  return {
    x: g.play.x + g.play.w * 0.45 - w / 2,
    y: g.play.y + g.play.h * 0.45 - h / 2,
    w,
    h,
    scale: h / g.cardH,
    rotation: 0,
    z: 0,
  };
}

/** Two boxes overlap, with a little room to spare. */
function overlaps(a: Box, b: Box, room = 8): boolean {
  return (
    a.x < b.x + b.w + room &&
    b.x < a.x + a.w + room &&
    a.y < b.y + b.h + room &&
    b.y < a.y + a.h + room
  );
}

/**
 * Owner 2026-11-01 (item 4) -- where the card floats while it is cast: in
 * the middle, big, unless something to click is under it (a mana elf to
 * tap, a land turned creature, a target). Then it slides up and toward the
 * stack, step by step, to the first place that covers none of them; if
 * none does, beside the stack at the smaller size (`docked`).
 */
export function castingSpot(g: Geometry, docked: boolean, clickable: readonly Box[]): Box {
  const middle = castingBox(g, docked);
  if (docked || !clickable.some((b) => overlaps(middle, b))) return middle;
  const stack = stackSpotBoxes(g, 1)[0]!;
  const right = stack.x - g.inset * 2 - middle.w;
  const top = g.play.y + g.inset;
  for (let step = 1; step <= ASIDE_STEPS; step++) {
    const t = step / ASIDE_STEPS;
    const spot = {
      ...middle,
      x: middle.x + (right - middle.x) * t,
      y: middle.y + (top - middle.y) * t,
    };
    if (!clickable.some((b) => overlaps(spot, b))) return spot;
  }
  return castingBox(g, true);
}

/** How many places between the middle and the corner by the stack are tried. */
const ASIDE_STEPS = 8;

/**
 * Spec 0044 -- the question needs the table: something on it to click
 * other than the spell itself. Paying does not: the lands are under the
 * hand, and the card in the middle is what is being paid for.
 *
 * Spec 0057, item 1 -- nor do cards to pick from the HAND (Allosaurus
 * Rider's two green cards): the middle never covers the hand, so the card
 * stays where it is.
 */
export function docks(
  decision: Decision | null,
  question: Question | null,
  castingId: string,
  inHand: (id: string) => boolean = () => false,
): boolean {
  if (!decision || !question || decision.kind === "applyManaToCost") return false;
  return [...question.onBoard.keys()].some((id) => id !== castingId && !inHand(id));
}

/** Where the card being cast was last drawn, and whether it was beside the stack. */
export interface Floating {
  id: string;
  box: Box;
  docked: boolean;
}

/**
 * Spec 0057, item 1 -- between questions (the last one answered, or none
 * asked yet) the card being cast stays exactly where it was drawn: it used
 * to slide back to the middle as a cancelled question went away, and then
 * fly back to the hand from there -- a jump (Phase 10 P10-R1). Null when
 * a question is being asked: then it goes where that question puts it.
 */
/** Spec 0058, item 6 -- how long a payment's spark takes from the land to its pip. */
export const SPARK_MS = 420;

/** Spec 0058, item 6 -- the first pip lit now that was not before ([before] is "*" for lit), or -1. */
export function litIndex(pips: readonly { paid: boolean }[], before: string): number {
  return pips.findIndex((p, i) => p.paid && before[i] !== "*");
}

export function heldSpot(
  floating: Floating | null,
  castingId: string | null,
  decision: Decision | null,
  awaiting: number | null,
): Floating | null {
  if (!floating || !castingId || floating.id !== castingId) return null;
  return !decision || awaiting === decision.decisionId ? floating : null;
}

/** The sparks' colour: the card's one colour, gold for several or none. */
export function emberColour(manaCost: string | null): string {
  const colours: Record<string, string> = {
    W: "#f6e7b0",
    U: "#7cbcff",
    B: "#b993e8",
    R: "#ff7a3c",
    G: "#72dc7e",
  };
  const found = new Set(
    manaSymbols(manaCost)
      .flatMap((s) => s.split(""))
      .filter((c) => c in colours),
  );
  return found.size === 1 ? colours[[...found][0]!]! : "#f1c36a";
}

/**
 * The cost as it is being paid, one pip per mana, each lit once paid.
 *
 * Spec 0058, item 6: generic mana is one grey pip per point ({2} is two),
 * lit from the left as Forge's "still owing" counts it down -- it was one
 * number that turned from 2 into 1. Item 7: `cost` is the cost actually
 * being paid (the first payment question's "still owing": mutate's
 * {2}{B/G}{B/G}, ninjutsu, evoke, an X announced), not the printed one; a
 * symbol of each kind lights from the left too. `owing` is null when
 * nothing is being paid yet (a target is asked first).
 */
export function costPips(
  cost: string | readonly string[] | null,
  owing: readonly string[] | null,
): { symbol: string; paid: boolean; generic?: true }[] {
  const symbols = typeof cost === "string" || cost === null ? manaSymbols(cost) : [...cost];
  // Generic as single points: "2" -> two pips.
  const pips = symbols.flatMap((symbol): { symbol: string; generic: boolean }[] =>
    /^\d+$/.test(symbol)
      ? Array.from({ length: Number(symbol) }, () => ({ symbol: "1", generic: true }))
      : [{ symbol, generic: false }],
  );
  const shape = (symbol: string, generic: boolean, paid: boolean) =>
    generic ? { symbol, paid, generic: true as const } : { symbol, paid };
  if (owing === null) return pips.map((p) => shape(p.symbol, p.generic, false));
  // How many of each are still owed; the rest of that kind are paid.
  const owed = new Map<string, number>();
  for (const symbol of owing) {
    const key = /^\d+$/.test(symbol) ? "generic" : symbol;
    owed.set(key, (owed.get(key) ?? 0) + (/^\d+$/.test(symbol) ? Number(symbol) : 1));
  }
  const total = new Map<string, number>();
  for (const p of pips) {
    const key = p.generic ? "generic" : p.symbol;
    total.set(key, (total.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return pips.map((p) => {
    const key = p.generic ? "generic" : p.symbol;
    const at = seen.get(key) ?? 0;
    seen.set(key, at + 1);
    const paidOfKind = Math.max(0, (total.get(key) ?? 0) - (owed.get(key) ?? 0));
    return shape(p.symbol, p.generic, at < paidOfKind);
  });
}

/** Spec 0058, item 6 -- the card that just paid (its place on the table) and its mana's colour. */
export interface Spark {
  box: Box;
  colour: string;
}

/** Spec 0058, items 6-7 -- a cast being paid: the cost being paid, and what is still owed. */
export interface Paying {
  id: string;
  cost: string[];
  owing: string[];
}

/**
 * Spec 0058, items 6-7 -- the next [Paying] for the card being cast
 * ([castingId]): the first payment question's "still owing" is the cost
 * being paid; each later one replaces what is owed; between questions
 * ([owingNow] null) the last is kept, so nothing flashes back to unpaid.
 * Another card, or none, starts again.
 */
export function keepPaying(
  previous: Paying | null,
  castingId: string | null,
  owingNow: readonly string[] | null,
): Paying | null {
  const same = castingId !== null && previous?.id === castingId ? previous : null;
  if (castingId === null || owingNow === null) return same;
  if (same && same.owing.join() === owingNow.join()) return same;
  return { id: castingId, cost: same?.cost ?? [...owingNow], owing: [...owingNow] };
}

/**
 * Phase 9 Amendment 13 -- what is still due on a payment question, as
 * symbols: the game's own field, else (an older server) "still owing" in the
 * buttons' words.
 */
export function owingSymbols(
  owing: string | null | undefined,
  labels: readonly (string | null)[],
): string[] | null {
  return owing ? manaSymbols(owing) : stillOwing(labels);
}

/** Forge's "still owing {2}{W}" on a payment question, as symbols. */
export function stillOwing(labels: readonly (string | null)[]): string[] | null {
  for (const label of labels) {
    const owing = /still owing ((?:\{[^}]+\})+)/.exec(label ?? "");
    if (owing) return manaSymbols(owing[1]);
  }
  return null;
}

function Embers({ colour }: { colour: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    const { width, height } = canvas;
    const spawn = (anywhere: boolean) => ({
      x: width * (0.12 + Math.random() * 0.76),
      y: anywhere ? Math.random() * height : height * (0.9 + Math.random() * 0.1),
      speed: 0.35 + Math.random() * 0.9,
      size: 0.8 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
    });
    const sparks = Array.from({ length: 60 }, () => spawn(true));
    let frame = 0;
    const tick = () => {
      context.clearRect(0, 0, width, height);
      context.shadowColor = colour;
      context.shadowBlur = 8;
      context.fillStyle = colour;
      for (const spark of sparks) {
        spark.y -= spark.speed;
        spark.phase += 0.04;
        spark.x += Math.sin(spark.phase) * 0.35;
        if (spark.y < 0) Object.assign(spark, spawn(false));
        context.globalAlpha = Math.max(0, spark.y / height) * 0.9;
        context.beginPath();
        context.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [colour]);
  return (
    <canvas ref={ref} className="gs-cast-embers" width={360} height={460} aria-hidden="true" />
  );
}

function Face({ card, artUrl }: { card: SnapshotCard; artUrl: (art: string) => string }) {
  if (card.art && !card.faceDown) {
    return (
      <SharpCard
        className="gs-cast-picture"
        low={artUrl(card.art)}
        high={closeUpOf(artUrl(card.art))}
        alt=""
      />
    );
  }
  // No picture (a token, or a server without card pictures): the card's
  // words, large enough to read.
  return (
    <div className="gs-cast-plain gs-cast-words">
      <b>{card.faceDown && !card.known ? "Face-down spell" : card.name}</b>
      <i>{card.types}</i>
      {figure(card) && <span className="gs-cast-figure">{figure(card)}</span>}
    </div>
  );
}

function Back({ caster }: { caster: string | null }) {
  return (
    <>
      <span className="gs-cast-back" aria-hidden="true" />
      {caster && <span className="gs-cast-caption">{caster} is casting a spell…</span>}
    </>
  );
}

export function CastingCard({
  card,
  geometry,
  from,
  owing,
  cost = null,
  spark = null,
  artUrl,
  docked = false,
  hiddenBy = null,
  at = null,
}: {
  card: SnapshotCard;
  geometry: Geometry;
  /** Where it rose from (the card clicked in hand), when known. */
  from: Box | null;
  /** Item 4 -- where it floats (castingSpot); the middle when not given. */
  at?: Box | null;
  /** Forge's "still owing", while it is being paid for (spec 0058: the last one, kept). */
  owing: string[] | null;
  /** Spec 0058, item 7 -- the cost being paid, as symbols; the printed cost when not known yet. */
  cost?: readonly string[] | null;
  /** Spec 0058, item 6 -- the land that last paid: a spark flies from it to the pip it lit. */
  spark?: Spark | null;
  artUrl: (art: string) => string;
  /** Spec 0044: beside the stack, while a question needs the table. */
  docked?: boolean;
  /** Spec 0044: the opponent's spell, still being paid for -- its back, and their name. */
  hiddenBy?: string | null;
}) {
  const box = at ?? castingBox(geometry, docked);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = hiddenBy !== null;
  const colour = emberColour(hidden ? null : card.manaCost);
  // Rise out of the hand once, when it first appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !from || typeof el.animate !== "function") return;
    const dx = from.x + from.w / 2 - (box.x + box.w / 2);
    const dy = from.y + from.h / 2 - (box.y + box.h / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${from.h / box.h})`, opacity: 0.6 },
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.2,.8,.2,1)" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it arrives
  }, [card.id]);
  const pips = hidden ? [] : costPips(cost ?? card.manaCost, owing);
  // Spec 0058, item 6 -- each pip that lights gets a small spark from the
  // land that paid it (the canvas's "small spark from the land").
  const litNow = pips.map((p) => (p.paid ? "*" : "o")).join("");
  const litBefore = useRef(litNow);
  useLayoutEffect(() => {
    const was = litBefore.current;
    litBefore.current = litNow;
    const el = ref.current;
    const at = litIndex(pips, was);
    if (!el || !spark || at < 0 || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const pip = el.querySelectorAll<HTMLElement>(".gs-cast-pip")[at];
    if (!pip) return;
    const rect = el.getBoundingClientRect();
    const scale = rect.width > 0 && box.w > 0 ? rect.width / box.w : 1;
    const p = pip.getBoundingClientRect();
    const x1 = (p.left + p.width / 2 - rect.left) / scale;
    const y1 = (p.top + p.height / 2 - rect.top) / scale;
    const x0 = spark.box.x + spark.box.w / 2 - box.x;
    const y0 = spark.box.y + spark.box.h / 2 - box.y;
    const dot = document.createElement("span");
    dot.className = "gs-cast-spark";
    dot.style.background = spark.colour;
    dot.style.boxShadow = `0 0 10px 3px ${spark.colour}`;
    el.appendChild(dot);
    const flight = dot.animate(
      [
        { transform: `translate(${x0}px, ${y0}px)`, opacity: 1 },
        {
          transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 40}px)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: `translate(${x1}px, ${y1}px)`, opacity: 0.9 },
      ],
      { duration: SPARK_MS, easing: "ease-in-out" },
    );
    flight.onfinish = () => dot.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per payment
  }, [litNow]);
  return (
    <div
      ref={ref}
      className={`gs-cast${docked ? " gs-cast-docked" : ""}`}
      data-docked={docked ? "true" : undefined}
      data-object-id={card.id}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        ["--gs-cast-colour" as string]: colour,
      }}
      role="img"
      aria-label={hidden ? `${hiddenBy} is casting a spell` : `Being cast: ${card.name}`}
    >
      <Embers colour={colour} />
      <div className="gs-cast-sway">
        {hidden ? <Back caster={hiddenBy} /> : <Face card={card} artUrl={artUrl} />}
      </div>
      {pips.length > 0 && (
        <div className="gs-cast-cost" aria-label={owing ? "Paying its cost" : "Its cost"}>
          {pips.map((pip, i) => {
            // Spec 0058, item 6 -- a point of generic mana: a plain grey pip.
            if (pip.generic) {
              return (
                <span
                  key={i}
                  className={`gs-cast-pip gs-cast-pip-generic${pip.paid ? " gs-cast-pip-paid" : ""}`}
                  role="img"
                  aria-label={pip.paid ? "1 generic paid" : "1 generic"}
                />
              );
            }
            const url = symbolUrl(pip.symbol);
            return url ? (
              <img
                key={i}
                className={`gs-cast-pip${pip.paid ? " gs-cast-pip-paid" : ""}`}
                src={url}
                alt={pip.paid ? `${pip.symbol} paid` : pip.symbol}
              />
            ) : (
              <span
                key={i}
                className={`gs-cast-pip gs-cast-pip-text${pip.paid ? " gs-cast-pip-paid" : ""}`}
              >
                {pip.symbol}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * The card leaving the middle: to where it landed (paid) or back to the
 * hand (cancelled). Drawn once, then gone; the real card is already in
 * its place underneath.
 *
 * Spec 0044: the opponent's card was face down. Committed (`reveal`), it
 * turns over with a flash and is held a moment before it flies; cancelled
 * (`hidden`), it goes back still face down.
 *
 * Owner 2026-11-01 (item 2): when nobody can answer it (the opponent is
 * tapped out), the game resolves the spell a few hundredths of a second
 * after it is cast. The card waits DECIDE_MS before it sets off, long
 * enough for that news to arrive: a permanent already on the battlefield
 * (`landing`) is flown straight onto its place there, landing at full size
 * and opacity (the board shows the real card only once it has); otherwise
 * it goes to the stack as before. One flight, to the right place, instead
 * of a flight to an empty stack while the creature slides out of it.
 */
export function CastingFlight({
  card,
  geometry,
  to,
  artUrl,
  onDone,
  docked = false,
  reveal = false,
  hidden = false,
  landing = false,
  from = null,
}: {
  card: SnapshotCard;
  geometry: Geometry;
  to: Box | null;
  artUrl: (art: string) => string;
  onDone: () => void;
  docked?: boolean;
  reveal?: boolean;
  hidden?: boolean;
  /** `to` is the card's place on the battlefield: land there, solid. */
  landing?: boolean;
  /** Item 4 -- where the card was floating when it set off. */
  from?: Box | null;
}) {
  const box = from ?? castingBox(geometry, docked);
  // Where it goes is read when it sets off, not when it is drawn.
  const toRef = useRef(to);
  toRef.current = to;
  const landingRef = useRef(landing);
  landingRef.current = landing;
  const ref = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || (!to && !reveal) || typeof el.animate !== "function") {
      onDone();
      return;
    }
    let animation: Animation | null = null;
    const turns: Animation[] = [];
    if (reveal && backRef.current && faceRef.current && flashRef.current) {
      const half = FLIP_MS / 2;
      turns.push(
        backRef.current.animate([{ transform: "scaleX(1)" }, { transform: "scaleX(0)" }], {
          duration: half,
          easing: "ease-in",
          fill: "forwards",
        }),
        faceRef.current.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: half,
          delay: half,
          easing: "ease-out",
          fill: "both",
        }),
        flashRef.current.animate([{ opacity: 0 }, { opacity: 0.85 }, { opacity: 0 }], {
          duration: FLIP_MS,
          delay: half - 60,
          easing: "ease-out",
          fill: "both",
        }),
      );
    }
    const wait = reveal ? FLIP_MS + HOLD_MS : DECIDE_MS;
    const timer = window.setTimeout(() => {
      const there = toRef.current;
      // Already resolved before this viewer saw it on the stack (and
      // not on the battlefield): shown face up all the same, then gone
      // where it stands.
      if (!there) {
        animation = el.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: FLY_MS,
          fill: "forwards",
        });
        animation.onfinish = onDone;
        return;
      }
      const dx = there.x + there.w / 2 - (box.x + box.w / 2);
      const dy = there.y + there.h / 2 - (box.y + box.h / 2);
      animation = el.animate(
        [
          { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
          {
            transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(0.75) rotate(5deg)`,
            opacity: 1,
            offset: 0.5,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${there.h / box.h}) rotate(${there.rotation}deg)`,
            // On the stack it fades into the small card there; on the
            // battlefield it IS the card, which appears as it lands.
            opacity: landingRef.current ? 1 : 0.35,
          },
        ],
        { duration: FLY_MS, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" },
      );
      // The row can shift while it flies (a tapped card splits from its
      // pile): a short glide to where its place is now, then done.
      animation.onfinish = () => {
        const now = toRef.current;
        if (
          !now ||
          !animation ||
          (Math.abs(now.x - there.x) < 3 && Math.abs(now.y - there.y) < 3)
        ) {
          onDone();
          return;
        }
        animation.commitStyles();
        animation.cancel();
        const nx = now.x + now.w / 2 - (box.x + box.w / 2);
        const ny = now.y + now.h / 2 - (box.y + box.h / 2);
        animation = el.animate(
          [
            { transform: el.style.transform, opacity: Number(el.style.opacity || 1) },
            {
              transform: `translate(${nx}px, ${ny}px) scale(${now.h / box.h}) rotate(${now.rotation}deg)`,
              opacity: landingRef.current ? 1 : 0.35,
            },
          ],
          { duration: SETTLE_MS, easing: "ease-out", fill: "forwards" },
        );
        animation.onfinish = onDone;
      };
    }, wait);
    return () => {
      window.clearTimeout(timer);
      animation?.cancel();
      turns.forEach((turn) => turn.cancel());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  return (
    <div
      ref={ref}
      className="gs-cast gs-cast-leaving"
      data-card={card.id}
      data-landing={landing ? "true" : undefined}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        ["--gs-cast-colour" as string]: emberColour(card.manaCost),
      }}
      aria-hidden="true"
    >
      {reveal ? (
        <>
          <div ref={faceRef} className="gs-cast-turn" style={{ transform: "scaleX(0)" }}>
            <Face card={card} artUrl={artUrl} />
          </div>
          <div ref={backRef} className="gs-cast-turn">
            <Back caster={null} />
          </div>
          <span ref={flashRef} className="gs-cast-flash" />
        </>
      ) : hidden ? (
        <Back caster={null} />
      ) : (
        <Face card={card} artUrl={artUrl} />
      )}
    </div>
  );
}
