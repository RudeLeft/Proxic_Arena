// Spec 0078 (owner 2026-11-12, canvas pt-1112) -- a permanent's number in its
// bottom bar: power / the toughness it has left, or a planeswalker's loyalty.
//
// At rest (A): a number bigger than printed is green, smaller red; damage
// left on a creature that lives shows as the toughness it has left, in red
// ("4/1" on a 4/4 with 3 damage, look A of item 6), until the turn's end.
// Pointing at it says the printed size and the damage. While a change plays
// (sizeTicks.ts) the number switches at once, in the change's colour (Amendment 1),
// and its looks run on the card: the pop, the soft edge, the small shake,
// the rising number -- each a Web Animation, so a click hurries it (A-00).

import { useLayoutEffect, useRef } from "react";
import {
  BADGE_LEAD_MS,
  FLOAT_MS,
  GLOW_MS,
  playingOf,
  POP_MS,
  SHAKE_MS,
  SIZE_COLOUR,
  useShownSize,
  type Playing,
  type Size,
} from "./sizeTicks";

/** What the number is drawn from: the board's size, and what is printed. */
export interface Figure {
  /** The object it belongs to (the pile's first card for a pile). */
  card: string;
  size: Size;
  basePower?: number | undefined;
  baseToughness?: number | undefined;
  damage?: number | undefined;
}

/** Each change's looks run once, whichever drawing of the card (a ghost too) shows it first. */
const started = new Set<string>();

function ease(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** The rising number: fading in, rising 0.42 of the card, fading out (the canvas's). */
export function floatFrames(h: number): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 10; i++) {
    const p = i / 10;
    const opacity = p < 0.12 ? p / 0.12 : p > 0.7 ? (1 - p) / 0.3 : 1;
    const pop = p < 0.3 ? 1 + 0.25 * Math.sin((Math.PI * p) / 0.3) : 1;
    frames.push({
      offset: p,
      opacity: Math.max(0, Math.min(1, opacity)),
      transform: `translateY(${(-ease(p) * h * 0.42).toFixed(2)}px) scale(${pop.toFixed(3)})`,
    });
  }
  return frames;
}

/** The small shake (0077's impact): dying away over SHAKE_MS. */
export function shakeFrames(h: number): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 12; i++) {
    const q = i / 12;
    const dx = Math.sin(q * Math.PI * 7) * (1 - q) * h * 0.035;
    frames.push({ offset: q, transform: `translateX(${dx.toFixed(2)}px)` });
  }
  return frames;
}

const POP: Keyframe[] = [
  { offset: 0, transform: "scale(1)" },
  { offset: 0.5, transform: "scale(1.3)" },
  { offset: 1, transform: "scale(1)" },
];

/**
 * Where the rising number starts, as a fraction of the card's height from
 * its top: off the bottom bar (0.8), or off the badge when a counter came
 * (0.62) -- the canvas's -- but never over a badge: with badges on the
 * card it starts just above the highest, so it does not cover their numbers.
 */
export function floatFrom(card: HTMLElement | null, fromBadge: boolean): number {
  let y = fromBadge ? 0.62 : 0.8;
  const box = card?.getBoundingClientRect();
  if (card && box && box.height > 0) {
    for (const badge of card.querySelectorAll<HTMLElement>(".bf-badge, .bf-mark")) {
      const top = (badge.getBoundingClientRect().top - box.top) / box.height;
      if (top > 0 && top < 1) y = Math.min(y, top - 0.135);
    }
  }
  return Math.max(0.3, y);
}

/** A change's looks on the drawing of its card: [span] is its number. */
export function runSizeLooks(span: HTMLElement, playing: Playing): void {
  const { change, wait } = playing;
  const look = change.look;
  if (!look || typeof span.animate !== "function") return;
  const card = span.closest<HTMLElement>(".bf-card");
  const slot = card?.parentElement ?? null;
  const h = card?.offsetHeight || 0;
  const colour = SIZE_COLOUR[look];
  const at = wait + (change.fromBadge ? BADGE_LEAD_MS : 0);
  // The pop.
  // Amendment 1: every change pops as the number switches.
  span.animate(POP, { duration: POP_MS, delay: at, easing: "ease-in-out" });
  // The soft edge: bigger, smaller, loyalty (not damage: the fight showed it).
  const glows = look === "up" || look === "down" || look === "loyalUp" || look === "loyalDown";
  if (glows && card && typeof card.animate === "function") {
    const base = getComputedStyle(card).boxShadow;
    const rest = base && base !== "none" ? `, ${base}` : "";
    card.animate(
      [
        { offset: 0, boxShadow: `0 0 0 0px ${colour}00, 0 0 0px 0px ${colour}00${rest}` },
        {
          offset: 0.5,
          boxShadow: `0 0 0 2px ${colour}e6, 0 0 ${(h * 0.14).toFixed(1)}px 0px ${colour}b3${rest}`,
        },
        { offset: 1, boxShadow: `0 0 0 0px ${colour}00, 0 0 0px 0px ${colour}00${rest}` },
      ],
      { duration: GLOW_MS, delay: at, easing: "linear" },
    );
  }
  // The small shake: a change that harms (3 A, 7 A, 8 B).
  if ((look === "down" || look === "loyalDown") && card && typeof card.animate === "function")
    card.animate(shakeFrames(h), {
      duration: SHAKE_MS,
      delay: at,
      easing: "linear",
      composite: "add",
    });
  // The rising number, off the badge when a counter came.
  if (change.float && slot && look !== "hit") {
    const float = document.createElement("span");
    float.className = "bf-size-float";
    float.dataset["sizeFloat"] = change.card;
    float.dataset["look"] = look;
    float.textContent = change.float;
    float.setAttribute("aria-hidden", "true");
    float.style.color = colour;
    float.style.top = `calc(var(--card-h) * ${floatFrom(card, change.fromBadge).toFixed(3)})`;
    float.style.opacity = "0";
    slot.appendChild(float);
    const run = float.animate(floatFrames(h), {
      duration: FLOAT_MS,
      delay: at,
      easing: "linear",
      fill: "backwards",
    });
    const gone = () => float.remove();
    run.onfinish = gone;
    run.oncancel = gone;
  }
}

/** The number, with its tints; it switches when its change plays. */
export function SizeFigure({ figure }: { figure: Figure }) {
  const ref = useRef<HTMLSpanElement>(null);
  const { size, tint } = useShownSize(figure.card, figure.size);
  const playing = playingOf(figure.card);
  const fresh = playing.filter((p) => p.change.look && !started.has(p.key));
  useLayoutEffect(() => {
    const span = ref.current;
    if (!span) return;
    for (const p of fresh) {
      if (started.has(p.key)) continue;
      started.add(p.key);
      if (started.size > 400) {
        const oldest = started.values().next();
        if (!oldest.done) started.delete(oldest.value);
      }
      runSizeLooks(span, p);
    }
  });
  const loyal = size.power === null || size.toughness === null;
  const damage = Math.max(0, figure.damage ?? 0);
  const printed =
    figure.basePower !== undefined &&
    figure.baseToughness !== undefined &&
    figure.size.power !== null &&
    (figure.basePower !== figure.size.power ||
      figure.baseToughness !== (figure.size.toughness ?? 0) + damage)
      ? `${figure.basePower}/${figure.baseToughness}`
      : null;
  const whole =
    figure.size.power !== null && figure.size.toughness !== null
      ? `${figure.size.power}/${figure.size.toughness + damage}`
      : "";
  const title = loyal
    ? undefined
    : [damage > 0 ? `${whole} with ${damage} damage` : whole, printed ? `printed ${printed}` : ""]
        .filter(Boolean)
        .join(", ");
  // At rest, each number against what is printed; the toughness left in red with damage.
  const pClass =
    !loyal && figure.basePower !== undefined
      ? size.power! > figure.basePower
        ? "g"
        : size.power! < figure.basePower
          ? "r"
          : ""
      : "";
  // The toughness it has left: red once damage shows on it (not while the
  // number is still held for the fight to land), else against what is printed.
  const left = loyal ? 0 : size.toughness!;
  const full = loyal ? 0 : figure.size.toughness! + damage;
  const tClass = loyal
    ? ""
    : damage > 0 && left < full
      ? "r"
      : figure.baseToughness !== undefined
        ? left > figure.baseToughness
          ? "g"
          : left < figure.baseToughness
            ? "r"
            : ""
        : "";
  return (
    <span
      ref={ref}
      className="bf-pt"
      title={title}
      data-size={loyal ? String(size.loyalty ?? "") : `${size.power}/${size.toughness}`}
      data-tint={tint ?? undefined}
      style={tint ? { color: tint, textShadow: `0 0 0.4em ${tint}` } : undefined}
    >
      {loyal ? (
        String(size.loyalty ?? "")
      ) : (
        <>
          {pClass && !tint ? <span className={pClass}>{size.power}</span> : size.power}/
          {tClass && !tint ? <span className={tClass}>{size.toughness}</span> : size.toughness}
        </>
      )}
    </span>
  );
}
