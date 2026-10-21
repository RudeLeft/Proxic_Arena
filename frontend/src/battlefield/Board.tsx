// The battlefield, drawn — PHASE_07 §7.15–§7.20, BATTLEFIELD_RENDERING.md
// §5, §7 steps 2 and 4.
//
// Draws what layout() decides and nothing else: every position comes from
// it, every card is a real <button> placed by transform, and each carries
// its Phase 6 id and state as data attributes so a test reads the board
// the way a player sees it (§7.42, §7.45). No game logic: what a card IS
// is Forge's, from the snapshot; where it is, is layout()'s.
//
// Movement (step 4, PHASE 7 AMENDMENT 6). Every card is one element keyed
// by its object id, in one layer, so when its box changes -- a tap, a row
// re-centring, a land played from the hand, a creature returned to it --
// the same element glides there (a CSS transition on `transform`). A card
// that was nowhere on the board travels in from its zone in the rail; a
// card that left travels to its zone as a "ghost" (no id, no clicks) and
// fades. None of it gates input (§7.36): the board's state is always the
// newest snapshot's, and an animation only decorates the way there.

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
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
  type Viewport,
} from "./layout";
import {
  MOVE_EASING,
  MOVE_MS,
  anchors,
  bandClip,
  bandOf,
  boxAt,
  handZoomBox,
  placement,
  type AnchorId,
} from "./motion";

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
  /** Where a card that was not on the board came from (default: the
   * stack, which is where most permanents come from). */
  arrivals?: ReadonlyMap<string, AnchorId>;
  /** Where a card that left the board went (default: its controller's
   * graveyard). A card that moved to the hand needs nothing: it is still
   * drawn, and simply moves. */
  departures?: ReadonlyMap<string, AnchorId>;
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

/** Enough of a card to draw it on its way out, after it has left. */
interface Drawn {
  name: string;
  look: Look;
  type: string;
  pt: string;
  art: string | null;
  faceDown: boolean;
  side: "viewer" | "opponent";
}

interface Ghost extends Drawn {
  id: string;
  box: Box;
  origin: { x: number; y: number };
  /** Where it goes: a zone in the rail (fading as it shrinks there), or
   * the spot of the card it joined (a pile, a host). */
  to: Box;
  toOrigin: { x: number; y: number };
  fade: boolean;
}

/** One thing layout() placed, ready to draw. */
interface Item {
  id: string;
  /** Every object id it stands for: a pile's members, a host's tags. */
  ids: string[];
  box: Box;
  origin: { x: number; y: number };
  clip?: string;
  drawn: Drawn;
  content: ReactNode;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}

/** The board fills its container and lays itself out for that size. */
export function Board({ battlefield, hand, viewerSeat, artUrl, arrivals, departures }: BoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cardsRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [pointed, setPointed] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const elements = useRef(new Map<string, HTMLDivElement>());
  const previous = useRef<{
    viewport: Viewport;
    at: Map<string, { box: Box; origin: { x: number; y: number } }>;
    drawn: Map<string, Drawn>;
    mounted: Set<string>;
  } | null>(null);

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

  const items = useMemo<Item[]>(() => {
    if (!result) return [];
    const g = result.geometry;
    const sideOf = (seat: number) => (seat === viewerSeat ? "viewer" : "opponent");
    const out: Item[] = [];

    for (const slot of result.slots) {
      const lead = byId.get(slot.ids[0]!)!;
      const count = slot.ids.length;
      const look = lookOf(lead.kind, lead.types);
      const side = slot.row.startsWith("viewer") ? "viewer" : "opponent";
      const pt = figure(lead);
      const attached = slot.attached.map((id) => byId.get(id)!);
      const band = bandOf(g, slot.row);
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
      const drawn: Drawn = {
        name: lead.name,
        look,
        type: shortType(lead.types),
        pt,
        art: lead.art ? artUrl(lead.art) : null,
        faceDown: lead.faceDown,
        side,
      };
      out.push({
        id: lead.id,
        ids: [...slot.ids, ...slot.attached],
        box: slot.box,
        origin: TAPPED_ORIGIN,
        // Tilted corners tuck under the next band (AMENDMENT 4).
        clip: bandClip(slot.box, g.cardW, g.cardH, TAPPED_ORIGIN, band.top, band.bottom),
        drawn,
        content: (
          <>
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
              <CardFace {...drawn} />
              {lead.attacking ? (
                <span className="bf-state bf-state-attacking">ATTACKING</span>
              ) : lead.tapped ? (
                <span className="bf-state">TAPPED</span>
              ) : null}
              {count > 1 && <span className="bf-pile">×{count}</span>}
            </button>
            {attached.length > 0 && (
              // Auras and Equipment as name tags across the host's picture
              // (AMENDMENT 4). Each is its own button, with its own id, so
              // it can be targeted and inspected like any permanent.
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
          </>
        ),
      });
    }

    for (const card of hand) {
      const rest = result.boxes.get(card.id);
      if (!rest) continue;
      const look = lookOf(card.kind, card.types);
      const pt = figure(card);
      const drawn: Drawn = {
        name: card.name,
        look,
        type: shortType(card.types),
        pt,
        art: card.art ? artUrl(card.art) : null,
        faceDown: false,
        side: "viewer",
      };
      const zoomed = pointed === card.id;
      const box = zoomed ? handZoomBox(rest, g) : rest;
      const show = () => setPointed(card.id);
      const hide = () => setPointed((now) => (now === card.id ? null : now));
      out.push({
        id: card.id,
        ids: [card.id],
        box,
        origin: HAND_ORIGIN,
        drawn,
        content: (
          <button
            type="button"
            className={`bf-card bf-hand bf-look-${look}`}
            aria-label={`${card.name}, in your hand${pt ? `, ${pt}` : ""}`}
            data-object-id={card.id}
            data-zone="viewer:hand"
            data-controller="viewer"
            data-face="up"
            data-zoomed={zoomed ? "true" : undefined}
            onPointerEnter={show}
            onPointerLeave={hide}
            onFocus={show}
            onBlur={hide}
          >
            <CardFace {...drawn} />
          </button>
        ),
      });
    }
    return out;
  }, [result, byId, hand, viewerSeat, artUrl, pointed]);

  // After each commit, before paint: start what should move.
  useLayoutEffect(() => {
    if (!result) return;
    const g = result.geometry;
    const where = anchors(g);
    const now = new Map<string, { box: Box; origin: { x: number; y: number } }>();
    const drawn = new Map<string, Drawn>();
    for (const item of items) {
      for (const id of item.ids) now.set(id, { box: item.box, origin: item.origin });
      drawn.set(item.id, item.drawn);
    }
    const before = previous.current;
    const resized =
      before !== null && (before.viewport.width !== g.width || before.viewport.height !== g.height);
    const still = reducedMotion();

    if (resized && cardsRef.current) {
      // A new window size is not a move: everything goes straight there.
      // Forcing a style pass with transitions off makes it so.
      cardsRef.current.dataset.instant = "true";
      void cardsRef.current.offsetWidth;
      delete cardsRef.current.dataset.instant;
    }

    if (before && !resized && !still) {
      for (const item of items) {
        if (before.mounted.has(item.id)) continue; // the same element: CSS glides it
        const element = elements.current.get(item.id);
        if (!element || typeof element.animate !== "function") continue;
        // A new element: from wherever the object was drawn before (a
        // pile it left, the hand), or else from its zone in the rail.
        const was = before.at.get(item.id);
        const from = was
          ? placement(was.box, g.cardW, g.cardH, was.origin).transform
          : placement(
              boxAt(where[arrivals?.get(item.id) ?? "stack"], g),
              g.cardW,
              g.cardH,
              item.origin,
            ).transform;
        const to = placement(item.box, g.cardW, g.cardH, item.origin).transform;
        element.animate(
          [
            { transform: from, opacity: was ? 1 : 0.2 },
            { transform: to, opacity: 1 },
          ],
          { duration: MOVE_MS, easing: MOVE_EASING },
        );
      }
      // A card that no longer has an element of its own leaves as a ghost:
      // into the spot of the card it joined (a land into its pile), or,
      // gone from the board, toward its zone in the rail.
      const leaving: Ghost[] = [];
      const elementsNow = new Set(items.map((item) => item.id));
      for (const [id, d] of before.drawn) {
        if (elementsNow.has(id)) continue;
        const at = before.at.get(id);
        if (!at) continue;
        const joined = now.get(id);
        leaving.push(
          joined
            ? { ...d, id, ...at, to: joined.box, toOrigin: joined.origin, fade: false }
            : {
                ...d,
                id,
                ...at,
                to: boxAt(where[departures?.get(id) ?? `${d.side}:graveyard`], g),
                toOrigin: at.origin,
                fade: true,
              },
        );
      }
      if (leaving.length > 0) setGhosts((list) => [...list, ...leaving]);
    }

    previous.current = {
      viewport: { width: g.width, height: g.height },
      at: now,
      drawn,
      mounted: new Set(items.map((item) => item.id)),
    };
  }, [items, result, arrivals, departures]);

  if (!result) return <div ref={ref} className="bf-board" data-testid="battlefield" />;
  const g = result.geometry;

  return (
    <div ref={ref} className="bf-board" data-testid="battlefield">
      <div className="bf-divider" style={{ top: g.height / 2, width: g.play.w }} />
      <aside
        className="bf-rail"
        aria-label="Game status"
        style={{ left: g.rail.x, width: g.rail.w }}
      />
      <div
        ref={cardsRef}
        className="bf-cards"
        style={
          {
            ["--card-h" as string]: `${g.cardH}px`,
            ["--move-ms" as string]: `${MOVE_MS}ms`,
            ["--move-easing" as string]: MOVE_EASING,
          } as CSSProperties
        }
      >
        {items.map((item) => (
          <div
            key={item.id}
            ref={(element) => {
              if (element) elements.current.set(item.id, element);
              else elements.current.delete(item.id);
            }}
            className="bf-slot"
            style={{
              width: g.cardW,
              height: g.cardH,
              ...placement(item.box, g.cardW, g.cardH, item.origin),
              clipPath: item.clip,
              zIndex: item.box.z,
            }}
          >
            {item.content}
          </div>
        ))}
        {ghosts.map((ghost) => (
          <GhostCard
            key={`ghost:${ghost.id}`}
            ghost={ghost}
            cardW={g.cardW}
            cardH={g.cardH}
            done={() => setGhosts((list) => list.filter((x) => x !== ghost))}
          />
        ))}
      </div>
    </div>
  );
}

/** A card that has left, on its way to its zone: drawn, never clickable,
 * gone once it gets there. */
function GhostCard({
  ghost,
  cardW,
  cardH,
  done,
}: {
  ghost: Ghost;
  cardW: number;
  cardH: number;
  done: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const from = placement(ghost.box, cardW, cardH, ghost.origin);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof element.animate !== "function" || reducedMotion()) {
      done();
      return;
    }
    const animation = element.animate(
      [
        { transform: from.transform, opacity: 1 },
        {
          transform: placement(ghost.to, cardW, cardH, ghost.toOrigin).transform,
          opacity: ghost.fade ? 0.15 : 1,
        },
      ],
      { duration: MOVE_MS, easing: MOVE_EASING, fill: "forwards" },
    );
    animation.onfinish = done;
    // Unmounting (or StrictMode's rehearsal) stops it without finishing it.
    return () => {
      animation.onfinish = null;
      animation.cancel();
    };
    // Runs once: a ghost goes where it was sent when it appeared.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div
      ref={ref}
      className="bf-slot bf-ghost"
      aria-hidden="true"
      data-ghost-of={ghost.id}
      style={{ width: cardW, height: cardH, ...from, zIndex: ghost.box.z + 2000 }}
    >
      <div className={`bf-card bf-look-${ghost.look}`}>
        <CardFace {...ghost} />
      </div>
    </div>
  );
}
