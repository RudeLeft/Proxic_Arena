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

import { useEffect, useLayoutEffect, useRef } from "react";
import type { SnapshotCard } from "../match";
import { SharpCard, closeUpOf } from "../closeUp";
import { figure } from "./Board";
import type { Box, Geometry } from "./layout";
import { manaSymbols, symbolUrl } from "./ManaCost";

/** How much bigger than a card on the table. */
const GROW = 2.5;
/** Rises out of the hand, and flies away, in this long. */
export const FLY_MS = 560;

/** Where the card floats: the middle of the table, as big as fits. */
export function castingBox(g: Geometry): Box {
  const h = Math.min(g.cardH * GROW, g.height * 0.5);
  const w = (h * g.cardW) / g.cardH;
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
 * The cost as it is being paid: each printed symbol, lit once paid. A
 * generic symbol shows what of it is still owed ("{2}" with one paid
 * shows 1). `owing` is Forge's own "still owing" -- null when nothing is
 * being paid yet (a target is asked first).
 */
export function costPips(
  manaCost: string | null,
  owing: readonly string[] | null,
): { symbol: string; paid: boolean }[] {
  const printed = manaSymbols(manaCost);
  if (owing === null) return printed.map((symbol) => ({ symbol, paid: false }));
  const left = [...owing];
  const generic = left.filter((s) => /^\d+$/.test(s)).reduce((n, s) => n + Number(s), 0);
  let genericLeft = generic;
  return printed.map((symbol) => {
    if (/^\d+$/.test(symbol)) {
      const owed = Math.min(Number(symbol), genericLeft);
      genericLeft -= owed;
      return owed === 0 ? { symbol, paid: true } : { symbol: String(owed), paid: false };
    }
    const at = left.indexOf(symbol);
    if (at >= 0) {
      left.splice(at, 1);
      return { symbol, paid: false };
    }
    return { symbol, paid: true };
  });
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

export function CastingCard({
  card,
  geometry,
  from,
  owing,
  artUrl,
}: {
  card: SnapshotCard;
  geometry: Geometry;
  /** Where it rose from (the card clicked in hand), when known. */
  from: Box | null;
  /** Forge's "still owing", while it is being paid for. */
  owing: string[] | null;
  artUrl: (art: string) => string;
}) {
  const box = castingBox(geometry);
  const ref = useRef<HTMLDivElement>(null);
  const colour = emberColour(card.manaCost);
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
  const pips = costPips(card.manaCost, owing);
  return (
    <div
      ref={ref}
      className="gs-cast"
      data-object-id={card.id}
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        ["--gs-cast-colour" as string]: colour,
      }}
      role="img"
      aria-label={`Being cast: ${card.name}`}
    >
      <Embers colour={colour} />
      <div className="gs-cast-sway">
        <Face card={card} artUrl={artUrl} />
      </div>
      {pips.length > 0 && (
        <div className="gs-cast-cost" aria-label={owing ? "Paying its cost" : "Its cost"}>
          {pips.map((pip, i) => {
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
 */
export function CastingFlight({
  card,
  geometry,
  to,
  artUrl,
  onDone,
}: {
  card: SnapshotCard;
  geometry: Geometry;
  to: Box | null;
  artUrl: (art: string) => string;
  onDone: () => void;
}) {
  const box = castingBox(geometry);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !to || typeof el.animate !== "function") {
      onDone();
      return;
    }
    const dx = to.x + to.w / 2 - (box.x + box.w / 2);
    const dy = to.y + to.h / 2 - (box.y + box.h / 2);
    const animation = el.animate(
      [
        { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
        {
          transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(0.75) rotate(5deg)`,
          opacity: 1,
          offset: 0.5,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${to.h / box.h}) rotate(${to.rotation}deg)`,
          opacity: 0.35,
        },
      ],
      { duration: FLY_MS, easing: "cubic-bezier(.5,0,.2,1)", fill: "forwards" },
    );
    animation.onfinish = onDone;
    return () => animation.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  return (
    <div
      ref={ref}
      className="gs-cast gs-cast-leaving"
      style={{
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        ["--gs-cast-colour" as string]: emberColour(card.manaCost),
      }}
      aria-hidden="true"
    >
      <Face card={card} artUrl={artUrl} />
    </div>
  );
}
