// Spec 0069, items 5 and 7 -- while you choose targets:
//  - the beam follows your pointer from the card being cast (or the card
//    whose ability it is), and the ripple shows on what you point at;
//  - for an Aura or Equipment there is no line: the creature you point at
//    shows the tab the card will sit in.
// The pointer is followed outside React (one listener, three attributes),
// so moving the mouse never re-draws the board.
import { useEffect, useRef } from "react";
import { Beam, Ripple } from "./Arrows";
import { effectSizes, rectEdge } from "./effects";
import type { Box, Geometry } from "./layout";

/** How far short of the pointer's tip the beam stops, in card heights. */
const SHORT = 0.04;

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** The beam's path from `from` to `to`: one gentle arc, lifted a little. */
export function aimPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  cardH: number,
): string {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const lift = Math.min(cardH * 0.5, dist * 0.18);
  const n = (v: number) => v.toFixed(1);
  return `M${n(from.x)} ${n(from.y)} Q${n((from.x + to.x) / 2)} ${n((from.y + to.y) / 2 - lift)} ${n(to.x)} ${n(to.y)}`;
}

export function AimPointer({
  geometry,
  from,
  attach,
}: {
  geometry: Geometry;
  /** The card the choice is for, where it is drawn; none, no beam. */
  from: Box | null;
  /** An Aura's or Equipment's name while its creature is chosen: a tab preview, no beam. */
  attach: string | null;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const beam = useRef<SVGGElement>(null);
  const ripple = useRef<SVGGElement>(null);
  const tab = useRef<HTMLSpanElement>(null);
  const cardH = geometry.cardH;
  const r = cardH * 0.1;
  const fx = from?.x;
  const fy = from?.y;
  const fw = from?.w;
  const fh = from?.h;
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const own = svg.current ?? tab.current;
      const board = own?.closest<HTMLElement>(".bf-board") ?? own?.parentElement;
      if (!board) return;
      const frame = board.getBoundingClientRect();
      const at = { x: e.clientX - frame.left, y: e.clientY - frame.top };
      const hit =
        e.target instanceof Element
          ? e.target.closest<HTMLElement>('[data-choosable="true"][data-object-id]')
          : null;
      const box = hit?.getBoundingClientRect();
      const player = hit?.dataset.objectId?.startsWith("player:") ?? false;
      if (attach !== null) {
        // Item 7: the tab the card will sit in, on the creature pointed at.
        const el = tab.current;
        if (!el) return;
        if (!box || player || !hit?.classList.contains("bf-card")) {
          el.dataset.off = "true";
          return;
        }
        el.dataset.off = "false";
        el.dataset.on = hit.dataset.objectId ?? "";
        el.style.left = `${box.right - frame.left}px`;
        el.style.top = `${box.top - frame.top}px`;
        el.style.height = `${box.height}px`;
        return;
      }
      if (!beam.current || !ripple.current || fx === undefined) return;
      const card = { x: fx, y: fy!, w: fw!, h: fh!, scale: 1, rotation: 0, z: 0 };
      let end = at;
      if (box) {
        // The ripple: round a player's life shield; on a card, on its picture.
        const centre = {
          x: box.left - frame.left + box.width / 2,
          y: box.top - frame.top + box.height * (player ? 0.5 : 0.42),
        };
        const size = player ? (Math.max(box.width, box.height) / 2) * 1.15 : r;
        const start = rectEdge(card, centre);
        const len = Math.max(0.001, Math.hypot(start.x - centre.x, start.y - centre.y));
        end = {
          x: centre.x + ((start.x - centre.x) / len) * size,
          y: centre.y + ((start.y - centre.y) / len) * size,
        };
        ripple.current.setAttribute(
          "transform",
          `translate(${centre.x.toFixed(1)} ${centre.y.toFixed(1)}) scale(${(size / r).toFixed(3)})`,
        );
        ripple.current.dataset.off = "false";
        ripple.current.dataset.on = hit?.dataset.objectId ?? "";
      } else {
        ripple.current.dataset.off = "true";
        delete ripple.current.dataset.on;
      }
      const start = rectEdge(card, end);
      const len = Math.max(0.001, Math.hypot(end.x - start.x, end.y - start.y));
      const short = box ? 0 : Math.min(len, cardH * SHORT);
      const tip = {
        x: end.x - ((end.x - start.x) / len) * short,
        y: end.y - ((end.y - start.y) / len) * short,
      };
      const d = aimPath(start, tip, cardH);
      for (const path of beam.current.querySelectorAll("path")) path.setAttribute("d", d);
      // Inside the card being cast there is nothing to point from.
      const inside = at.x > fx && at.x < fx + fw! && at.y > fy! && at.y < fy! + fh!;
      beam.current.dataset.off = String(inside && !box);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [attach, fx, fy, fw, fh, cardH, r]);
  if (attach !== null)
    return (
      <span
        ref={tab}
        className="bf-tab-preview"
        data-testid="tab-preview"
        data-off="true"
        aria-hidden="true"
        style={{
          width: cardH * 0.12,
          fontSize: cardH * 0.07,
          zIndex: 26000,
        }}
      >
        {attach}
      </span>
    );
  if (!from) return null;
  const w = effectSizes(geometry).line;
  return (
    <svg
      ref={svg}
      className="bf-pointer"
      data-testid="aim-pointer"
      width={geometry.width}
      height={geometry.height}
      style={{ zIndex: 26000 }}
      aria-hidden="true"
    >
      <g ref={beam} className="bf-pointer-beam" data-off="true">
        <Beam d="M0 0" w={w} />
      </g>
      <g ref={ripple} className="bf-pointer-ripple" data-off="true">
        <Ripple at={{ x: 0, y: 0 }} r={r} w={w} reduced={reducedMotion()} />
      </g>
    </svg>
  );
}
