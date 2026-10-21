// The battlefield, drawn — PHASE_07 §7.15–§7.20, BATTLEFIELD_RENDERING.md
// §5, §7 step 2.
//
// Draws what layout() decides and nothing else: every position comes from
// it, every card is a real <button> placed by transform, and each carries
// its Phase 6 id and state as data attributes so a test reads the board
// the way a player sees it (§7.42, §7.45). No game logic: what a card IS
// is Forge's, from the snapshot; where it is, is layout()'s.

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "./battlefield.css";
import {
  HAND_ORIGIN,
  TAPPED_ORIGIN,
  layout,
  type Box,
  type LayoutCard,
  type RowId,
  type Viewport,
} from "./layout";

/** A permanent as the board needs it: layout's fields plus its picture. */
export interface BoardCard extends LayoutCard {
  /** An imported picture's reference, or null (tokens, hidden cards,
   * back faces without a picture). */
  art: string | null;
}

export interface BoardHandCard {
  id: string;
  name: string;
  kind: string;
  types: string;
  power: number | null;
  toughness: number | null;
  art: string | null;
}

export interface BoardProps {
  battlefield: readonly BoardCard[];
  hand: readonly BoardHandCard[];
  viewerSeat: number;
  /** Turns a picture reference into a URL (a match-scoped asset route in a
   * match, the reference itself for a synthetic board). */
  artUrl: (art: string) => string;
}

/** The canvas's palette, by what a card is (§7.40: the type also shows
 * as a glyph and words, never colour alone). */
type Look = "land" | "creature" | "artifact" | "walker";
function lookOf(kind: string, types: string): Look {
  if (kind === "creature") return "creature";
  if (kind === "land") return "land";
  if (/\bPlaneswalker\b/.test(types)) return "walker";
  return "artifact";
}
const GLYPH: Record<Look, string> = {
  land: "M12 20 V7 M12 7 L7 12 M12 7 L17 12",
  creature: "M4 18 L10 8 L14 14 L17 10 L20 18 Z",
  artifact: "M12 4 V20 M4 12 H20 M6.5 6.5 L17.5 17.5 M17.5 6.5 L6.5 17.5",
  walker: "M12 3 L19 9 V17 L12 21 L5 17 V9 Z",
};

function Glyph({ look, className }: { look: Look; className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={GLYPH[look]} />
    </svg>
  );
}

/** The type line's first part, as the canvas's bottom bar shows it:
 * "Creature — Angel" reads "Creature". */
function shortType(types: string): string {
  const head = types.split(/\s+—\s+/)[0] ?? "";
  return head.replace(/\bBasic\s+/, "");
}

/** Current power/toughness, or a planeswalker's loyalty, from Forge
 * (§7.20) -- never printed values. */
function figure(card: {
  power: number | null;
  toughness: number | null;
  counters?: readonly { name: string; count: number }[];
}): string {
  if (card.power !== null && card.toughness !== null) return `${card.power}/${card.toughness}`;
  const loyalty = card.counters?.find((c) => c.name === "LOYALTY");
  return loyalty ? String(loyalty.count) : "";
}

/** CSS for a box: fixed card size, placed only by transform (rendering
 * §5.1). Scale and rotation share one origin, so the drawn card lands
 * exactly where layout() put it. `top` is the y the container starts at. */
function placement(
  box: Box,
  cardW: number,
  cardH: number,
  origin: { x: number; y: number },
  top = 0,
): CSSProperties {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const tx = box.x - ox * (1 - box.scale);
  const ty = box.y - top - oy * (1 - box.scale);
  return {
    width: cardW,
    height: cardH,
    transformOrigin: `${ox}px ${oy}px`,
    transform: `translate3d(${tx}px, ${ty}px, 0) rotate(${box.rotation}deg) scale(${box.scale})`,
    zIndex: box.z,
  };
}

function CardFace({
  name,
  look,
  type,
  pt,
  art,
  faceDown,
}: {
  name: string;
  look: Look;
  type: string;
  pt: string;
  art: string | null;
  faceDown: boolean;
}) {
  if (faceDown) {
    return (
      <span className="bf-card-back" aria-hidden="true">
        <span className="bf-card-back-mark" />
      </span>
    );
  }
  return (
    <>
      <span className="bf-bar bf-bar-top">
        <span className="bf-name">{name}</span>
      </span>
      <span className="bf-window" aria-hidden="true">
        {art ? (
          // The scan's art box, cropped (owner decision 2026-10-20): the
          // whole card is for inspect, not for the table.
          <img className="bf-art" src={art} alt="" decoding="async" draggable={false} />
        ) : (
          <Glyph look={look} className="bf-glyph" />
        )}
      </span>
      {/* Power/toughness on the LEFT (PHASE 7 AMENDMENT 4): a squeezed
          row shows each card's left third, and that must include it. */}
      <span className="bf-bar bf-bar-bottom">
        {pt && <span className="bf-pt">{pt}</span>}
        <span className="bf-type">{type}</span>
      </span>
    </>
  );
}

/** Rows that share a horizontal band (the contract's land/creature/other
 * rows side by side), each band a container that clips vertically, so a
 * tilted card's corner tips tuck under the next band instead of covering
 * it (PHASE 7 AMENDMENT 4). Sideways nothing is clipped. */
interface Band {
  y: number;
  h: number;
  rows: Set<RowId>;
}
function bandsOf(rows: Record<RowId, { y: number; h: number }>): Band[] {
  const bands = new Map<string, Band>();
  for (const [id, rect] of Object.entries(rows) as [RowId, { y: number; h: number }][]) {
    const key = `${rect.y}:${rect.h}`;
    const band = bands.get(key) ?? { y: rect.y, h: rect.h, rows: new Set<RowId>() };
    band.rows.add(id);
    bands.set(key, band);
  }
  return [...bands.values()].sort((a, b) => a.y - b.y);
}

/** The board fills its container and lays itself out for that size. */
export function Board({ battlefield, hand, viewerSeat, artUrl }: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const result = useMemo(
    () => (viewport ? layout({ battlefield, hand, viewerSeat }, viewport) : null),
    [battlefield, hand, viewerSeat, viewport],
  );
  const byId = useMemo(() => new Map(battlefield.map((card) => [card.id, card])), [battlefield]);
  const bands = useMemo(() => (result ? bandsOf(result.geometry.rows) : []), [result]);

  if (!result) return <div ref={ref} className="bf-board" data-testid="battlefield" />;
  const { cardW, cardH } = result.geometry;
  const sideOf = (seat: number) => (seat === viewerSeat ? "viewer" : "opponent");

  const slotElement = (slot: (typeof result.slots)[number], top: number) => {
    const lead = byId.get(slot.ids[0]!)!;
    const count = slot.ids.length;
    const look = lookOf(lead.kind, lead.types);
    const side = slot.row.startsWith("viewer") ? "viewer" : "opponent";
    const pt = figure(lead);
    const attached = slot.attached.map((id) => byId.get(id)!);
    const label = [
      lead.faceDown && !lead.known
        ? "Face-down card"
        : lead.faceDown
          ? `${lead.name}, face down`
          : lead.name,
      count > 1 ? `${count} of them` : "",
      pt,
      lead.tapped ? "tapped" : "",
      lead.attacking ? "attacking" : "",
      attached.length > 0 ? `with ${attached.map((card) => card.name).join(" and ")}` : "",
      side === "viewer" ? "yours" : "opponent's",
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <div
        key={lead.id}
        className="bf-slot"
        style={placement(slot.box, cardW, cardH, TAPPED_ORIGIN, top)}
      >
        <button
          type="button"
          className={`bf-card bf-look-${look}${lead.tapped ? " bf-dim" : ""}${lead.attacking ? " bf-attacking" : ""}`}
          aria-label={label}
          data-object-id={lead.id}
          data-zone={slot.row}
          data-controller={side}
          data-tapped={String(lead.tapped)}
          data-attacking={lead.attacking ? "true" : undefined}
          data-pt={pt || undefined}
          data-face={lead.faceDown ? "down" : "up"}
          data-pile={count > 1 ? count : undefined}
        >
          <CardFace
            name={lead.name}
            look={look}
            type={shortType(lead.types)}
            pt={pt}
            art={lead.art ? artUrl(lead.art) : null}
            faceDown={lead.faceDown}
          />
          {lead.attacking ? (
            <span className="bf-state bf-state-attacking">ATTACKING</span>
          ) : lead.tapped ? (
            <span className="bf-state">TAPPED</span>
          ) : null}
          {count > 1 && <span className="bf-pile">×{count}</span>}
        </button>
        {attached.length > 0 && (
          // Auras and Equipment as name tags across the host's picture
          // (PHASE 7 AMENDMENT 4). Each is its own button, with its own
          // id, so it can be targeted and inspected like any permanent.
          <div className="bf-tags">
            {attached.map((card) => {
              const tagLook = lookOf(card.kind, card.types);
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`bf-tag bf-look-${tagLook}`}
                  aria-label={`${card.name}, attached to ${lead.faceDown && !lead.known ? "a face-down card" : lead.name}, ${sideOf(card.seat) === "viewer" ? "yours" : "opponent's"}`}
                  data-object-id={card.id}
                  data-zone={slot.row}
                  data-controller={sideOf(card.seat)}
                  data-attached-to={lead.id}
                  data-tapped={String(card.tapped)}
                  data-face="up"
                >
                  <Glyph look={tagLook} className="bf-tag-glyph" />
                  <span className="bf-tag-name">{card.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={ref} className="bf-board" data-testid="battlefield">
      <div
        className="bf-divider"
        style={{ top: result.geometry.height / 2, width: result.geometry.play.w }}
      />
      <aside
        className="bf-rail"
        aria-label="Game status"
        style={{ left: result.geometry.rail.x, width: result.geometry.rail.w }}
      />
      <div className="bf-cards" style={{ ["--card-h" as string]: `${cardH}px` } as CSSProperties}>
        {bands.map((band) => (
          <div
            key={band.y}
            className="bf-band"
            style={{ top: band.y, height: band.h, width: result.geometry.width }}
          >
            {result.slots
              .filter((slot) => band.rows.has(slot.row))
              .map((slot) => slotElement(slot, band.y))}
          </div>
        ))}
        {hand.map((card) => {
          const box = result.boxes.get(card.id);
          if (!box) return null;
          const look = lookOf(card.kind, card.types);
          const pt = figure(card);
          return (
            <div
              key={card.id}
              className="bf-slot"
              style={placement(box, cardW, cardH, HAND_ORIGIN)}
            >
              <button
                type="button"
                className={`bf-card bf-hand bf-look-${look}`}
                aria-label={`${card.name}, in your hand${pt ? `, ${pt}` : ""}`}
                data-object-id={card.id}
                data-zone="viewer:hand"
                data-controller="viewer"
                data-face="up"
              >
                <CardFace
                  name={card.name}
                  look={look}
                  type={shortType(card.types)}
                  pt={pt}
                  art={card.art ? artUrl(card.art) : null}
                  faceDown={false}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
