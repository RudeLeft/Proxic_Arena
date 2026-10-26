// Close-ups without the paint-in — spec 0015 (owner 2026-10-26).
//
// A zoomed card used to fetch the original scan and the browser painted it
// top to bottom as it arrived. Now: the table's small copy shows at once,
// and the sharp copy (?size=full, a light JPEG since spec 0015) takes its
// place only when it has arrived and been decoded. During a game the
// close-ups of cards in view are fetched ahead, a few at a time, so most
// zooms are sharp from the first frame.

import { useEffect, useState } from "react";

/** Close-ups already asked for in this tab: each is fetched once. */
const asked = new Set<string>();
/** Close-ups that have arrived whole: shown straight away, no swap. */
const ready = new Set<string>();
const waiting: string[] = [];
let running = 0;
/** A few at a time, so fetching ahead never crowds out the game itself. */
const AT_ONCE = 2;

/** Loads [url] and settles once it can be drawn in one go (or never will). */
function load(url: string): Promise<void> {
  const image = new Image();
  image.decoding = "async";
  const arrived = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("no picture"));
  });
  image.src = url;
  return arrived
    .then(() => (typeof image.decode === "function" ? image.decode() : undefined))
    .then(() => {
      ready.add(url);
    });
}

function next() {
  while (running < AT_ONCE && waiting.length > 0) {
    running++;
    load(waiting.shift()!)
      .catch(() => {
        // Not fetched ahead: the zoom shows the table copy until it comes.
      })
      .finally(() => {
        running--;
        next();
      });
  }
}

/** Fetches close-ups ahead of time, each once; the browser keeps them for the zoom. */
export function fetchAhead(urls: Iterable<string>): void {
  for (const url of urls) {
    if (asked.has(url)) continue;
    asked.add(url);
    waiting.push(url);
  }
  next();
}

/** The close-up URL for a card picture's table URL. */
export const closeUpOf = (url: string) => `${url}?size=full`;

/**
 * A card picture that starts as the table copy ([low]) and becomes the
 * sharp one ([high]) only once that is whole: never a half-painted card.
 */
export function SharpCard({
  low,
  high,
  alt,
  className,
}: {
  low: string;
  high: string;
  alt: string;
  className?: string;
}) {
  const [arrived, setArrived] = useState<string | null>(null);

  useEffect(() => {
    if (ready.has(high)) return;
    let current = true;
    load(high)
      .then(() => {
        if (current) setArrived(high);
      })
      .catch(() => {
        // A close-up that will not load: the table copy stays.
      });
    return () => {
      current = false;
    };
  }, [high]);

  const sharp = arrived === high || ready.has(high);
  return <img className={className} src={sharp ? high : low} alt={alt} />;
}
