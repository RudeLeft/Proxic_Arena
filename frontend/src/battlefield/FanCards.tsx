// Spec 0087 (owner 2026-11-13, A · glow and a fan beside the plate; canvas
// gaps-marks-1113 sections 6-9, Amendment 1) -- one card standing in a fan
// beside a plate: the card, its pile's corner sign (graveyard or exile, the
// canvas's), the gold-rimmed square it wears (foretold: an eye; plotted: a
// clock-hand; Amendment 1's ability from a graveyard: its own small mark),
// and a suspended card's round time badge. It is drawn where pileFan.ts
// puts it; Board.tsx moves it (rising out of its tile, back into it, closing
// the gap) on the board's clock, so a click hurries it (A-00).

import { Breath } from "./Breath";
import type { CSSProperties, ReactNode } from "react";
import type { Box } from "./layout";
import type { FanCard, FanZone } from "./pileFan";

/** The canvas's corner signs: an exile star on blue, a tombstone on grey. */
const SIGN: Record<FanZone, ReactNode> = {
  exile: (
    <path
      d="M10 1.5 L12.2 7.8 L18.5 10 L12.2 12.2 L10 18.5 L7.8 12.2 L1.5 10 L7.8 7.8 Z"
      fill="#eaf4ff"
    />
  ),
  graveyard: <path d="M5 18 V8 A5 5 0 0 1 15 8 V18 Z" fill="#eeeeee" />,
};

/** The canvas's hourglass, on the time badge. */
const HOURGLASS = (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path
      d="M5 2.5 H15 M5 17.5 H15 M6.2 2.5 C6.2 7.5 13.8 12.5 13.8 17.5 M13.8 2.5 C13.8 7.5 6.2 12.5 6.2 17.5"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
  </svg>
);

/** Amendment 1 -- the gold-rimmed squares (0076's look): what the card is, there. */
const SQUARE: Record<"foretold" | "plotted" | "ability", ReactNode> = {
  // An eye: foretold, face down until it is cast.
  foretold: (
    <>
      <path
        d="M2 12S5.6 6 12 6 22 12 22 12 18.4 18 12 18 2 12 2 12z"
        fill="none"
        stroke="#f2c46a"
        strokeWidth="1.9"
      />
      <circle cx="12" cy="12" r="3.1" fill="#f2c46a" />
    </>
  ),
  // A clock-hand: plotted, cast on a later turn.
  plotted: (
    <>
      <circle cx="12" cy="12" r="8.6" fill="none" stroke="#f2c46a" strokeWidth="1.9" />
      <path
        d="M12 6.6V12l3.8 2.6"
        fill="none"
        stroke="#f2c46a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  ),
  // An ability used from here (Unearth, Scavenge, Embalm, Encore):
  // the activation's bolt.
  ability: <path d="M13.5 2.5 6 13.2h5.2L9.8 21.5 18 10.2h-5.3z" fill="#f2c46a" stroke="none" />,
};

export function FanCardView({
  card,
  box,
  face,
  className,
  breathes = false,
  label,
  data,
  handlers,
}: {
  card: FanCard;
  box: Box;
  /** The card's face (Board's CardFace, as the hand draws it). */
  face: ReactNode;
  /** What the board's act() says of it (choosable, selected, unpayable...). */
  className: string;
  /** Spec 0090 (2) -- it breathes "you can pick this": its soft glow layer (Breath). */
  breathes?: boolean;
  label: string;
  data: Record<string, string | undefined>;
  handlers: {
    onClick?: (() => void) | undefined;
    onContextMenu?: ((event: { preventDefault: () => void }) => void) | undefined;
  };
}) {
  const square = card.square ?? (card.how === "ability" && card.known ? "ability" : null);
  const style: CSSProperties = {
    width: box.w,
    height: box.h,
    transform: `translate3d(${box.x}px, ${box.y}px, 0)`,
    zIndex: box.z,
    ["--card-h" as string]: `${box.h}px`,
  };
  return (
    <div
      className={`bf-fan-card bf-fan-${card.side}${card.how === "suspended" ? " bf-fan-suspended" : ""}`}
      style={style}
      data-fan-card={card.id}
      data-fan-side={card.side}
      data-fan-zone={card.zone}
      data-fan-how={card.how}
      // A trigger or ability of this card rises from it (Board's railBox).
      data-rise-from={card.id}
    >
      <button
        type="button"
        className={`bf-card bf-fan-face${className}${breathes ? " bf-breathes" : ""}`}
        aria-label={label}
        {...data}
        {...handlers}
        data-object-id={card.id}
        data-zone={`${card.side}:${card.zone}`}
        data-controller={card.side}
        data-face={card.faceDown ? "down" : "up"}
      >
        {face}
      </button>
      {breathes && <Breath />}
      <span
        className={`bf-fan-sign bf-fan-sign-${card.zone}`}
        data-sign={card.zone}
        aria-hidden="true"
      >
        <svg viewBox="0 0 20 20">{SIGN[card.zone]}</svg>
      </span>
      {square && (
        <span className="bf-fan-square" data-square={square} aria-hidden="true">
          <svg viewBox="0 0 24 24">{SQUARE[square]}</svg>
        </span>
      )}
      {card.how === "suspended" && card.time !== null && (
        <span className="bf-fan-time" data-time={card.time} aria-hidden="true">
          <span className="bf-fan-time-g">{HOURGLASS}</span>
          <span className="bf-fan-time-n">{card.time}</span>
        </span>
      )}
    </div>
  );
}

/** The words a screen reader hears for a fan card (and pointing says). */
export function fanWords(card: FanCard, whose: string): string {
  const what = card.known ? card.name : "A face-down card";
  const where = card.zone === "graveyard" ? `${whose} graveyard` : `${whose} exile`;
  const how =
    card.how === "suspended"
      ? `suspended, ${card.time ?? 0} time ${card.time === 1 ? "counter" : "counters"}`
      : card.how === "ability"
        ? card.mine
          ? "you may use its ability from there"
          : "its ability may be used from there"
        : card.mine
          ? "you may play it from there"
          : "may be played from there";
  const square =
    card.square === "foretold" ? ", foretold" : card.square === "plotted" ? ", plotted" : "";
  return `${what}, in ${where}${square}, ${how}`;
}

// --- the movements (the canvas's, on the board's clock) ------------------------

/** Rising out of its tile into the fan (the canvas: 0.45 s, from 0.6 of the tile's size). */
export const FAN_RISE_MS = 450;
/** Back into its tile when it can no longer be used. */
export const FAN_SINK_MS = 400;
/** The fan closing a gap (the canvas: 0.4 s, eased in and out). */
export const FAN_CLOSE_MS = 400;
/** The glow's swell as it lands (the canvas: a bump over 0.5 s, 0.3 s in). */
export const FAN_GLOW_MS = 500;
/** The time badge's pop and its rising −1 (the canvas: 0.3 s pop; the number rises 34 px). */
export const FAN_TICK_MS = 300;
export const FAN_FLOAT_MS = 1000;
/** A tile's pulse as a card rises out of it. */
export const TILE_PULSE_MS = 500;

/** From a tile's centre, small and faint, to its place in the fan. */
export function riseFrames(
  from: { x: number; y: number },
  box: Box,
  tileScale: number,
): Keyframe[] {
  const dx = from.x - (box.x + box.w / 2);
  const dy = from.y - (box.y + box.h / 2);
  return [
    {
      transform: `translate3d(${box.x + dx}px, ${box.y + dy}px, 0) scale(${tileScale})`,
      opacity: 0.3,
    },
    {
      transform: `translate3d(${box.x + dx * 0.4}px, ${box.y + dy * 0.4}px, 0) scale(${(tileScale + 1) / 2})`,
      opacity: 1,
      offset: 0.55,
    },
    { transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(1)`, opacity: 1 },
  ];
}

/** From its place in the fan back into its tile, shrinking and fading there. */
export function sinkFrames(box: Box, to: { x: number; y: number }, tileScale: number): Keyframe[] {
  const dx = to.x - (box.x + box.w / 2);
  const dy = to.y - (box.y + box.h / 2);
  return [
    { transform: `translate3d(${box.x}px, ${box.y}px, 0) scale(1)`, opacity: 1 },
    {
      transform: `translate3d(${box.x + dx}px, ${box.y + dy}px, 0) scale(${tileScale})`,
      opacity: 0,
    },
  ];
}

/** The gap closing: from where it stood to where it stands now. */
export function closeFrames(was: Box, box: Box): Keyframe[] {
  return [
    { transform: `translate3d(${was.x}px, ${was.y}px, 0)` },
    { transform: `translate3d(${box.x}px, ${box.y}px, 0)` },
  ];
}
