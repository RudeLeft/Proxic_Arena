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
// Spec 0044 (owner 2026-10-31) -- the opponent sees its back while it is
// paid for ("Pat is casting a spell…"); committed, it flips to the face,
// holds, and flies to the stack.
//
// Spec 0068 (owner 2026-11-09, A · Stay centred, see-through) -- it never
// moves: the middle of the SCREEN, full size, for every spell and every
// question. It no longer slides aside (owner 2026-11-01, item 4), docks
// beside the stack (spec 0044) or keeps its last spot (spec 0057, item 1).
// Instead, when the pointer (or the keyboard's focus) is on something to
// click for the question that the card covers, the card fades almost
// away; clicks always went through it (pointer-events: none).

import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import type { SnapshotCard } from "../match";
import { SharpCard, closeUpOf } from "../closeUp";
import { figure } from "./Board";
import type { Box, Geometry } from "./layout";
import { manaSymbols, symbolUrl } from "./ManaCost";
import { assignBalls, litShadow, type PaidStep } from "./manaBalls";
import { MOVE_MS, glideFramesAs, lateFade } from "./motion";

/**
 * Spec 0072 -- the other player's card's Glide (A-00) into or out of the
 * middle: from (or to) a place on the table, a table card turning about
 * `origin` there.
 */
export interface TheirGlide {
  box: Box;
  origin: { x: number; y: number };
}

/** Whether the viewer asked for reduced motion (spec 0072, item 4: no glide). */
function stillMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** How much bigger than a card on the table. */
const GROW = 2.5;
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
 * Spec 0068 -- where the card floats: centred on the middle of the screen
 * (the game screen fills the window), as big as fits. A pure function of
 * the window's size, so after a resize it is in the new middle.
 */
export function castingBox(g: Geometry): Box {
  const h = Math.min(g.cardH * GROW, g.height * 0.5);
  const w = (h * g.cardW) / g.cardH;
  return {
    x: g.width / 2 - w / 2,
    y: g.height / 2 - h / 2,
    w,
    h,
    scale: h / g.cardH,
    rotation: 0,
    z: 0,
  };
}

/** Spec 0068 -- how solid the card is while what it covers is pointed at (canvas: 1 - 0.86). */
export const SEE_THROUGH = 0.14;

/** Something to click for the question being asked (Board marks it). */
const CHOOSABLE = '[data-choosable="true"]';

function inside(r: DOMRect, x: number, y: number): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

function overlap(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Spec 0068, item 2 -- whether the card is see-through now: the pointer is
 * inside it and on something to click for the question (the card itself
 * takes no pointer, so what is under the pointer is what it covers), or
 * the keyboard's focus is on such a thing under it. Read again for each
 * new question ([asking]), from where the pointer last was, so a question
 * that arrives with the pointer already on its Elf fades the card too.
 */
function useSeeThrough(
  ref: { current: HTMLElement | null },
  enabled: boolean,
  asking: number | null,
): boolean {
  const [pointed, setPointed] = useState(false);
  const [focused, setFocused] = useState(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!enabled) {
      setPointed(false);
      setFocused(false);
      return undefined;
    }
    const covers = (target: Element | null, x: number, y: number) => {
      const el = ref.current;
      if (!el || !target?.closest(CHOOSABLE) || el.contains(target)) return false;
      return inside(el.getBoundingClientRect(), x, y);
    };
    const move = (event: PointerEvent) => {
      last.current = { x: event.clientX, y: event.clientY };
      setPointed(covers(event.target as Element | null, event.clientX, event.clientY));
    };
    const leave = () => {
      last.current = null;
      setPointed(false);
    };
    const focusIn = (event: FocusEvent) => {
      const el = ref.current;
      const target = (event.target as Element | null)?.closest(CHOOSABLE) ?? null;
      setFocused(
        !!el &&
          !!target &&
          !el.contains(target) &&
          overlap(el.getBoundingClientRect(), target.getBoundingClientRect()),
      );
    };
    const focusOut = () => setFocused(false);
    document.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("focusin", focusIn);
    document.addEventListener("focusout", focusOut);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("focusin", focusIn);
      document.removeEventListener("focusout", focusOut);
    };
  }, [enabled, ref]);
  // Each new question: what is clickable may have changed under a pointer
  // that has not moved.
  useEffect(() => {
    const at = last.current;
    if (!enabled || !at || typeof document.elementFromPoint !== "function") return;
    const el = ref.current;
    const target = document.elementFromPoint(at.x, at.y);
    const now =
      !!el &&
      !!target?.closest(CHOOSABLE) &&
      !el.contains(target) &&
      inside(el.getBoundingClientRect(), at.x, at.y);
    setPointed(now);
  }, [enabled, ref, asking]);
  return enabled && (pointed || focused);
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

function Back({
  caster,
  captionRef,
}: {
  caster: string | null;
  captionRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <>
      <span className="gs-cast-back" aria-hidden="true" />
      {caster && (
        <span ref={captionRef} className="gs-cast-caption">
          {caster} is casting a spell…
        </span>
      )}
    </>
  );
}

export function CastingCard({
  card,
  geometry,
  from,
  owing,
  cost = null,
  paid = null,
  artUrl,
  hiddenBy = null,
  asking = null,
  theirs = null,
}: {
  card: SnapshotCard;
  geometry: Geometry;
  /** Where it rose from (the card clicked in hand), when known. */
  from: Box | null;
  /**
   * Spec 0072 -- the other player's spell (a spectator's: either player's):
   * where it rose from -- the middle back of their fan, a card of theirs you
   * were shown, or a pile -- making the A-00 Glide to the middle.
   */
  theirs?: TheirGlide | null;
  /** Forge's "still owing", while it is being paid for (spec 0058: the last one, kept). */
  owing: string[] | null;
  /** Spec 0058, item 7 -- the cost being paid, as symbols; the printed cost when not known yet. */
  cost?: readonly string[] | null;
  /**
   * Spec 0062 -- each mana the game says paid this cost, in order: its pip
   * lights in its colour, and its ball (manaBalls) flies to it. Replaces
   * spec 0058's one spark from the land just tapped.
   */
  paid?: readonly PaidStep[] | null;
  artUrl: (art: string) => string;
  /** Spec 0044: the opponent's spell, still being paid for -- its back, and their name. */
  hiddenBy?: string | null;
  /** Spec 0068 -- the question being asked (its id): see-through is read again for each. */
  asking?: number | null;
}) {
  const box = castingBox(geometry);
  const ref = useRef<HTMLDivElement>(null);
  const hidden = hiddenBy !== null;
  // Spec 0068, item 2 -- your own card fades off what you point at under
  // it; the other player's never needs to (nothing of yours waits on it).
  const see = useSeeThrough(ref, !hidden && !theirs, asking);
  const captionRef = useRef<HTMLSpanElement>(null);
  const [gliding] = useState(() => !!theirs && !stillMotion());
  const colour = emberColour(hidden ? null : card.manaCost);
  // Rise out of the hand once, when it first appears.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") return;
    if (theirs) {
      // Spec 0072, item 1 -- the Glide, 450 ms on its arc, no fade (adds
      // no time; a click hurries it, as every Glide on the board). The
      // words come once it is nearly there (the canvas).
      if (!gliding) return;
      el.animate(
        glideFramesAs(box, theirs.box, box, geometry.cardW, geometry.cardH, theirs.origin),
        { duration: MOVE_MS, easing: "linear" },
      );
      captionRef.current?.animate([{ opacity: 0 }, { opacity: 0, offset: 0.73 }, { opacity: 1 }], {
        duration: MOVE_MS,
        easing: "linear",
      });
      return;
    }
    if (!from) return;
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
  // Spec 0062 -- the opponent's spell is a back: no pips (its cost is not
  // even sent); the balls fly to the back itself (data-ball-for).
  const pips =
    hidden || theirs ? [] : assignBalls(costPips(cost ?? card.manaCost, owing), paid ?? []);
  return (
    <div
      ref={ref}
      className={`gs-cast${see ? " gs-cast-see" : ""}${gliding ? " gs-cast-glide" : ""}`}
      data-from={theirs ? "theirs" : undefined}
      data-see-through={see ? "true" : undefined}
      data-object-id={card.id}
      data-ball-for={card.id}
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
        {hidden ? (
          <Back caster={hiddenBy} captionRef={captionRef} />
        ) : (
          <Face card={card} artUrl={artUrl} />
        )}
      </div>
      {pips.length > 0 && (
        <div className="gs-cast-cost" aria-label={owing ? "Paying its cost" : "Its cost"}>
          {pips.map((pip, i) => {
            // Spec 0062 -- lit in the colour of the mana that paid it; its
            // ball finds it by `data-ball`.
            const lit = pip.paid && pip.colour ? { boxShadow: litShadow(pip.colour) } : undefined;
            const data = {
              "data-ball": pip.ball,
              "data-paid-by": pip.paid ? (pip.colour ?? "") : undefined,
            };
            // Spec 0058, item 6 -- a point of generic mana: a plain grey pip.
            if (pip.generic) {
              return (
                <span
                  key={i}
                  className={`gs-cast-pip gs-cast-pip-generic${pip.paid ? " gs-cast-pip-paid" : ""}`}
                  role="img"
                  aria-label={pip.paid ? "1 generic paid" : "1 generic"}
                  style={lit}
                  {...data}
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
                style={lit}
                {...data}
              />
            ) : (
              <span
                key={i}
                className={`gs-cast-pip gs-cast-pip-text${pip.paid ? " gs-cast-pip-paid" : ""}`}
                style={lit}
                {...data}
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
  reveal = false,
  hidden = false,
  landing = false,
  back = null,
}: {
  card: SnapshotCard;
  geometry: Geometry;
  to: Box | null;
  /**
   * Spec 0072, item 3 -- the other player's spell, cancelled: at once, the
   * A-00 Glide back where it came from (their hand's new back, which makes
   * the same Glide fading in as this fades out; a card of theirs you were
   * shown; a pile), ending at `opacity`. Face up if it rose face up.
   */
  back?: (TheirGlide & { opacity: number }) | null;
  artUrl: (art: string) => string;
  onDone: () => void;
  reveal?: boolean;
  hidden?: boolean;
  /** `to` is the card's place on the battlefield: land there, solid. */
  landing?: boolean;
}) {
  // Spec 0068 -- it sets off from the middle of the screen, where it always
  // is (the other player's turns over and is held there first).
  const box = castingBox(geometry);
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
    if (back) {
      // Reduce motion: no glide, it is simply back (spec 0072, item 4).
      if (!el || typeof el.animate !== "function" || stillMotion()) {
        onDone();
        return undefined;
      }
      const going = el.animate(
        lateFade(
          glideFramesAs(box, box, back.box, geometry.cardW, geometry.cardH, back.origin),
          1,
          back.opacity,
        ),
        { duration: MOVE_MS, easing: "linear", fill: "forwards" },
      );
      going.onfinish = onDone;
      return () => going.cancel();
    }
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
      data-going={back ? "back" : undefined}
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
