// Spec 0088 (owner 2026-11-13, Q4 C, canvas "deep2-triggers-reports-1113")
// -- the top of a library, on its tile.
//
// When the top card is public (Courser of Kruphix, Future Sight) or the
// viewer may look at it or play it (Bolas's Citadel), the game sends it
// (`libraryTop`). Each new top card rises out of the Library tile and shows
// enlarged for a moment (0074's rise and show), then settles small on the
// tile's right end, clear of the count. It glows when it may be played from
// there, and a cast rises from it as from 0087's fan. A card only its owner
// may look at is sent to the owner only: the other player sees nothing new.
//
// The canvas's C, in its own numbers (1920 x 1080 board pixels): the small
// card 70 high, centred 33 in from the tile's right end and 24 below its top
// (so it stands a little above the tile); it rises from the tile's middle to
// the plate's show spot at 1.2 of a table card (0.3 s, turning face up),
// holds (to 0.9 s), and settles onto the tile (0.4 s, its glow fading).

import { sameProps } from "./sameProps";
import { Breath } from "./Breath";
import { memo, useLayoutEffect, useRef, useState } from "react";
import type { SnapshotCard } from "../match";
import type { Box, Geometry } from "./layout";
import { paced, anchors } from "./motion";
import { pictureUrl } from "../closeUp";
import { besideTile, SHOW_SCALE } from "./graves";

/** The rise out of the tile, the hold, the settle (the canvas's 0.3, 0.6, 0.4 s). */
export const TOP_RISE_MS = paced(300);
export const TOP_HOLD_MS = 600; // not paced: a wait (spec 0106)
export const TOP_SETTLE_MS = paced(400);
export const TOP_SHOW_MS = TOP_RISE_MS + TOP_HOLD_MS + TOP_SETTLE_MS;
/** A top card that leaves (drawn, played, cast): it fades where it stood. */
export const TOP_LEAVE_MS = paced(250);
/**
 * Where the small card stands on [side]'s Library tile, in board pixels:
 * the rail is drawn on a 900-high board scaled to the real one (motion.ts
 * anchors), the whole-row tile 194 x 52 there, the card 42 x 58 standing 7 in
 * from its right end and 9 above its top (game.css .gs-libtop) -- at 1080 the
 * canvas's 50 x 70, centred 33 in from the right end and 24 below the top.
 */
export function libraryTopBox(g: Geometry, side: "viewer" | "opponent"): Box {
  const k = g.height / 900;
  const tile = anchors(g)[`${side}:library`];
  const w = 42 * k;
  const h = 58 * k;
  const cx = tile.x + (97 - 7 - 21) * k;
  const cy = tile.y + (-26 - 9 + 29) * k;
  return { x: cx - w / 2, y: cy - h / 2, w, h, scale: 1, rotation: 0, z: 0 };
}

/** The board's own box of an element (the board may be scaled to fit). */
function boardBox(el: HTMLElement): { box: Box; root: HTMLElement; k: number } | null {
  const root = el.closest<HTMLElement>(".bf-board");
  if (!root) return null;
  const rb = root.getBoundingClientRect();
  const k = root.offsetWidth > 0 ? rb.width / root.offsetWidth || 1 : 1;
  const r = el.getBoundingClientRect();
  return {
    box: {
      x: (r.left - rb.left) / k,
      y: (r.top - rb.top) / k,
      w: r.width / k,
      h: r.height / k,
      scale: 1,
      rotation: 0,
      z: 0,
    },
    root,
    k,
  };
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/**
 * The rise and show, as keyframes on the small card (which is drawn at its
 * place on the tile): from the tile's middle, small, turning face up, to the
 * show spot at SHOW_SCALE of a table card, held, then home. `dx/dy` are the
 * offsets of the tile's middle and the show spot from the card's own
 * centre, in board pixels; `big` its scale at the show spot.
 */
export function topShowFrames(
  tile: { dx: number; dy: number },
  show: { dx: number; dy: number },
  big: number,
): Keyframe[] {
  const at = (ms: number) => ms / TOP_SHOW_MS;
  const glow = (g: number) => `drop-shadow(0px 0px ${14 * g}px rgba(241, 195, 106, ${0.85 * g}))`;
  return [
    {
      offset: 0,
      transform: `translate(${tile.dx}px, ${tile.dy}px) scale(${big * 0.33}, ${big * 0.33})`,
      opacity: 0.5,
      filter: glow(0.85),
    },
    // Edge-on as it turns face up (the canvas: a back for the first 40%).
    {
      offset: at(TOP_RISE_MS * 0.4),
      transform: `translate(${tile.dx + (show.dx - tile.dx) * 0.4}px, ${tile.dy + (show.dy - tile.dy) * 0.4}px) scale(${big * 0.04}, ${big * 0.6})`,
      opacity: 1,
      filter: glow(0.85),
    },
    {
      offset: at(TOP_RISE_MS),
      transform: `translate(${show.dx}px, ${show.dy}px) scale(${big}, ${big})`,
      opacity: 1,
      filter: glow(0.85),
    },
    {
      offset: at(TOP_RISE_MS + TOP_HOLD_MS),
      transform: `translate(${show.dx}px, ${show.dy}px) scale(${big}, ${big})`,
      opacity: 1,
      filter: glow(0.85),
    },
    { offset: 1, transform: "translate(0px, 0px) scale(1, 1)", opacity: 1, filter: glow(0) },
  ];
}

/** The card back shown over the face while it turns up (the first 40% of the rise). */
export function topBackFrames(): Keyframe[] {
  const turn = (TOP_RISE_MS * 0.4) / TOP_SHOW_MS;
  return [
    { offset: 0, opacity: 1 },
    { offset: turn, opacity: 1 },
    { offset: Math.min(1, turn + 0.001), opacity: 0 },
    { offset: 1, opacity: 0 },
  ];
}

/**
 * One library's top card on its tile: the small card, glowing when it may be
 * played from there, a click a click on that card (its options), and its
 * rise and show when it is new. `quiet`: the first board the page draws
 * (nothing animates in from anywhere).
 */
function LibraryTopView({
  card,
  owner,
  choosable,
  busy,
  quiet,
  onPick,
}: {
  /** Null when there is none to show now (the one shown before fades where it stood). */
  card: SnapshotCard | null;
  /** Whose library, as the players read it ("your", "Bob's"). */
  owner: string;
  choosable: boolean;
  busy: boolean;
  quiet: boolean;
  onPick: (id: string) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLSpanElement>(null);
  const [leaving, setLeaving] = useState<SnapshotCard | null>(null);
  const shown = useRef<SnapshotCard | null>(null);
  useLayoutEffect(() => {
    const was = shown.current;
    shown.current = card;
    if (!card) {
      if (was) setLeaving(was);
      return;
    }
    const el = ref.current;
    if (!el) return;
    // Spec 0095: nothing is measured for the same card (every other board).
    if (was?.id === card.id) return;
    if (was) setLeaving(was);
    if (quiet || reducedMotion() || typeof el.animate !== "function") return;
    const placed = boardBox(el);
    if (!placed) return;
    // The rise and show, from the tile's middle to the plate's show spot.
    const { box, root, k } = placed;
    const tile = el.parentElement?.querySelector<HTMLElement>('[data-zone-tile$=":library"]');
    const tileAt = tile ? boardBox(tile)?.box : undefined;
    const rail = root.querySelector<HTMLElement>(".bf-rail");
    const cards = root.querySelector<HTMLElement>(".bf-cards");
    const cardH = Number.parseFloat(
      (cards ? getComputedStyle(cards).getPropertyValue("--card-h") : "") || "0",
    );
    if (!tileAt || !rail || !(cardH > 0) || !(box.h > 0)) return;
    const rb = root.getBoundingClientRect();
    const height = rb.height / k;
    const railX = (rail.getBoundingClientRect().left - rb.left) / k;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const spot = besideTile(railX, height, tileAt.y + tileAt.h / 2);
    const frames = topShowFrames(
      { dx: tileAt.x + tileAt.w / 2 - cx, dy: tileAt.y + tileAt.h / 2 - cy },
      { dx: spot.x - cx, dy: spot.y - cy },
      (SHOW_SCALE * cardH) / box.h,
    );
    el.animate(frames, { duration: TOP_SHOW_MS, easing: "linear" });
    backRef.current?.animate(topBackFrames(), { duration: TOP_SHOW_MS, easing: "linear" });
  }, [card, quiet]);
  const pic = card ? (card.crop ?? card.art) : null;
  const playable = (card?.uses?.length ?? 0) > 0;
  return (
    <>
      {leaving && leaving.id !== card?.id && (
        <TopLeaving key={leaving.id} card={leaving} done={() => setLeaving(null)} />
      )}
      {card && (
        <button
          type="button"
          ref={ref}
          className={`gs-libtop${playable ? " gs-libtop-playable" : ""}${choosable ? " gs-choosable gs-breathes" : ""}`}
          data-object-id={card.id}
          data-zone="library"
          data-library-top={card.id}
          data-playable={playable ? "true" : undefined}
          data-choosable={choosable ? "true" : undefined}
          disabled={busy && choosable}
          aria-label={`${card.name}, on top of ${owner} library${playable ? ", may be played from there" : ""}${choosable ? ", can be chosen" : ""}`}
          onClick={() => onPick(card.id)}
        >
          <span
            className="gs-libtop-art"
            style={pic ? { backgroundImage: `url(${pictureUrl(pic)})` } : undefined}
          />
          <span className="gs-libtop-name">{card.name}</span>
          <span ref={backRef} className="gs-libtop-back" aria-hidden="true" />
        </button>
      )}
      {/* Spec 0090 (2) -- its "you can pick this" glow, a soft layer over its edge. */}
      {card && choosable && <Breath className=" bf-breath-libtop" />}
    </>
  );
}

export const LibraryTop = memo(LibraryTopView, sameProps);

/** A top card that left the top (drawn, played, cast): it fades where it stood, small. */
function TopLeaving({ card, done }: { card: SnapshotCard; done: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof el.animate !== "function") {
      done();
      return;
    }
    const run = el.animate(
      [
        { opacity: 1, transform: "scale(1)" },
        { opacity: 0, transform: "scale(0.85)" },
      ],
      { duration: TOP_LEAVE_MS, easing: "ease-in", fill: "forwards" },
    );
    run.onfinish = done;
    run.oncancel = done;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as it leaves
  }, []);
  const pic = card.crop ?? card.art;
  return (
    <span
      ref={ref}
      className="gs-libtop gs-libtop-leaving"
      aria-hidden="true"
      data-ghost-of={card.id}
    >
      <span
        className="gs-libtop-art"
        style={pic ? { backgroundImage: `url(${pictureUrl(pic)})` } : undefined}
      />
      <span className="gs-libtop-name">{card.name}</span>
    </span>
  );
}
