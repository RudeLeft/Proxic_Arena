// A card's close-up in the Deck Depot — spec 0008 (owner 2026-10-24).
//
// Click a card and it opens large: the close-up (?size=full, the same
// check as the grid's copy), its name and how many copies. ← / → step
// through the deck in the order the bands show it; Esc, the close button
// or a click outside closes it. A card that turns over has Turn over,
// which shows the face Forge names as its back.

import { useEffect, useId, useRef, useState } from "react";
import { SharpCard, closeUpOf, fetchAhead } from "./closeUp";
import type { DeckEntryView } from "./decks";

export function CardZoom({
  cards,
  index,
  onIndex,
  onClose,
}: {
  cards: DeckEntryView[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const card = cards[index]!;
  const [turned, setTurned] = useState(false);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement | null>(null);

  const step = (by: number) => {
    setTurned(false);
    onIndex((index + by + cards.length) % cards.length);
  };

  useEffect(() => {
    dialog.current?.focus();
    // The page behind stays where it is while the close-up is open.
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);

  // Spec 0015 — the cards either side, so a step is sharp at once.
  useEffect(() => {
    const around = [
      cards[(index + 1) % cards.length],
      cards[(index - 1 + cards.length) % cards.length],
    ];
    fetchAhead(around.flatMap((near) => (near?.artUrl ? [closeUpOf(near.artUrl)] : [])));
  }, [cards, index]);

  const back = turned && card.backArtUrl;
  const art = back ? card.backArtUrl : card.artUrl;
  const name = back ? (card.backFaceName ?? card.cardName) : card.cardName;

  return (
    <div
      className="pa-zoom-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="pa-zoom"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialog}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          } else if (event.key === "ArrowLeft") {
            step(-1);
          } else if (event.key === "ArrowRight") {
            step(1);
          } else if (event.key === "Tab") {
            // Focus stays in the close-up while it is open.
            const stops = [...(dialog.current?.querySelectorAll<HTMLElement>("button") ?? [])];
            const first = stops[0];
            const last = stops[stops.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <button type="button" className="pa-zoom-close" aria-label="Close" onClick={onClose}>
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18">
            <path d="M4 4l10 10M14 4 4 14" />
          </svg>
        </button>
        <div className="pa-zoom-stage">
          <button
            type="button"
            className="pa-zoom-step"
            aria-label="Previous card"
            onClick={() => step(-1)}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
              <path d="M14 4 7 11l7 7" />
            </svg>
          </button>
          <div className="pa-zoom-card">
            {art ? (
              // The grid's copy shows at once (it is cached); the close-up
              // takes its place once it is whole (spec 0015).
              <span className="pa-zoom-art">
                <SharpCard low={art} high={closeUpOf(art)} alt={name} />
              </span>
            ) : (
              <span className="pa-zoom-art pa-zoom-noart">{name}</span>
            )}
          </div>
          <button
            type="button"
            className="pa-zoom-step"
            aria-label="Next card"
            onClick={() => step(1)}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22">
              <path d="m8 4 7 7-7 7" />
            </svg>
          </button>
        </div>
        <div className="pa-zoom-caption">
          <span id={titleId} className="pa-zoom-name">
            {name}
          </span>
          <span className="pa-zoom-meta">
            {card.quantity} {card.quantity === 1 ? "copy" : "copies"} · {index + 1} of{" "}
            {cards.length}
          </span>
          {card.backArtUrl && (
            <button
              type="button"
              className="pa-button pa-zoom-turn"
              aria-pressed={turned}
              onClick={() => setTurned(!turned)}
            >
              Turn over
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
