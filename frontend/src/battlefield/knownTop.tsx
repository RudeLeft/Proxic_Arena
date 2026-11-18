// Spec 0103, item 4 (owner 2026-11-17, Q4 A; canvas "deep3-reports-comfort-
// 1117", section Q4, option A) -- the cards you know are on top of your
// library. After Brainstorm (or a scry kept on top) the worker remembers the
// cards you put there, in your order, and sends them to you alone
// (`knownTop`, KnownTops). Point at your Library tile: they slide out beside
// it, face up, numbered from the top (1 = your next draw). Nothing shows at
// rest. The other player is never sent them, so their page has nothing to
// draw (HID-001, HID-005): the tile itself is the same either way.
//
// The canvas's look, in the rail's units (the rail is a 900-high board; the
// canvas is 1080): each card 0.8 of a table card (108 high at 1080: 90 here),
// the first centred 52 (43) left of the rail, the next 92 (77) further left,
// a little above the tile's middle; the gold order disc on each card's top
// edge; they slide in from 46 (38) to the right over 0.28 s.

import type { SnapshotCard } from "../match";
import { pictureUrl } from "../closeUp";

export function KnownTop({ cards }: { cards: readonly SnapshotCard[] }) {
  if (cards.length === 0) return null;
  return (
    <span className="gs-known" role="group" aria-label="The cards you know on top of your library">
      {cards.map((card, i) => {
        const pic = card.art;
        return (
          <span
            key={card.id}
            className="gs-known-card"
            data-known={i + 1}
            aria-label={`${i + 1}: ${card.name}${i === 0 ? ", your next draw" : ""}`}
          >
            <span
              className={`gs-known-face${pic ? "" : " gs-known-words"}`}
              style={pic ? { backgroundImage: `url(${pictureUrl(pic)})` } : undefined}
            >
              {!pic && <b>{card.name}</b>}
            </span>
            <b className="gs-known-n" aria-hidden="true">
              {i + 1}
            </b>
          </span>
        );
      })}
    </span>
  );
}
