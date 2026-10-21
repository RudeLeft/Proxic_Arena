// /dev/bench — the performance budget, measured (BATTLEFIELD_RENDERING.md
// §6 "The performance budget -- a gate, not a hope", §7 step 6).
//
//   ?permanents=80&faces=60&seed=1&res=full|fit
//
// `faces` is how many DIFFERENT pictures the board shows (each card gets
// one, round-robin). `res=full` serves every picture at the scan's own
// size, as Arena serves imported scans today; `res=fit` at the size the
// table draws it -- what the planned `srcset` (§5.4) would serve.
//
// Card pictures here are generated rasters the size of a real imported
// scan (745 x 1040 PNG), with grain so they are no easier to decode than
// one; no real card art is used or stored. Three timed actions, each
// result shown on the page and kept on `window.__bench` for the benchmark
// spec to read:
//
//   Show board      snapshot -> first paint of the board (budget 300 ms)
//   Shift all       every row re-centres at once: frame times (60 fps)
//   New face        a never-seen picture enters play: until it is decoded
//                   and painted (budget 100 ms)
//
// Not linked from anywhere, signed-in only, and labelled: not a game.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Board, type BoardCard } from "./Board";
import { syntheticBoard } from "./fixture";
import { geometry } from "./layout";

function number(params: URLSearchParams, key: string, fallback: number, max: number): number {
  const raw = params.get(key);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback;
}

/** A picture with a real scan's layout and grain, at `scale` of a real
 * scan's 745 x 1040. */
async function rasterScan(name: string, seed: number, scale: number): Promise<string> {
  const w = Math.round(745 * scale);
  const h = Math.round(1040 * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  let hash = seed;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `hsl(${hue} 25% 62%)`;
  ctx.fillRect(30, 30, 685, 980);
  const art = ctx.createLinearGradient(56, 115, 689, 578);
  art.addColorStop(0, `hsl(${hue} 55% 38%)`);
  art.addColorStop(1, `hsl(${(hue + 120) % 360} 60% 45%)`);
  ctx.fillStyle = art;
  ctx.fillRect(56, 115, 633, 463);
  ctx.fillStyle = `hsl(${(hue + 40) % 360} 70% 60%)`;
  ctx.beginPath();
  ctx.arc(372, 330, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.font = "38px serif";
  ctx.fillText(name, 62, 90);
  // Grain over everything, like a scanned photograph: it is what makes a
  // real scan expensive to decode.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const image = ctx.getImageData(0, 0, w, h);
  let s = hash || 1;
  for (let i = 0; i < image.data.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0;
    const n = ((s >>> 16) & 31) - 16;
    image.data[i] = Math.max(0, Math.min(255, image.data[i]! + n));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1]! + n));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2]! + n));
  }
  ctx.putImageData(image, 0, 0);
  const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), "image/png"));
  return URL.createObjectURL(blob);
}

export interface BenchResults {
  ready: boolean;
  faces: number;
  /** "full" (scan size) or "fit" (drawn size), and the picture scale. */
  res: string;
  scale: number;
  /** Show board: data handed to React -> first frame painted with it. */
  firstPaintMs?: number;
  /** ...and -> every visible picture decoded. */
  allFacesMs?: number;
  /** Shift all: frame intervals during the move. */
  frames?: number[];
  longTasks?: number;
  /** New face: entering play -> its picture decoded and painted. */
  newFaceMs?: number;
  /** Decoded size of every distinct picture on the board, at its own
   * resolution (what a browser holds for an undownscaled PNG). */
  decodedBytes?: number;
}

declare global {
  interface Window {
    __bench?: BenchResults;
  }
}

/** The pictures here are object URLs already. */
const asIs = (art: string) => art;

const nextFrame = () => new Promise<number>((done) => requestAnimationFrame(done));

export default function DevBenchPage() {
  const [params] = useSearchParams();
  const permanents = number(params, "permanents", 80, 200);
  const faces = number(params, "faces", 60, 120);
  const seed = number(params, "seed", 1, 1_000_000);
  const res = params.get("res") === "fit" ? "fit" : "full";
  const base = useMemo(() => syntheticBoard(permanents, faces, seed), [permanents, faces, seed]);

  const [art, setArt] = useState<Map<string, string> | null>(null);
  const [fresh, setFresh] = useState<string | null>(null); // the never-shown picture
  const [shown, setShown] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [extra, setExtra] = useState<BoardCard | null>(null);
  const [results, setResults] = useState<BenchResults>({
    ready: false,
    faces: 0,
    res,
    scale: 1,
  });
  const mark = useRef<{ kind: "show" | "face"; at: number } | null>(null);

  useEffect(() => {
    window.__bench = results;
  }, [results]);

  // Make `faces` distinct rasters, plus one that is never shown until
  // "New face". At "fit", each is the size the table draws a card's
  // picture at (its art box fills the card's window), in device pixels.
  useEffect(() => {
    let live = true;
    void (async () => {
      const g = geometry({ width: window.innerWidth, height: window.innerHeight });
      const scale =
        res === "fit" ? Math.min(1, ((g.cardH * 0.736) / 0.445 / 1040) * devicePixelRatio) : 1;
      const made = new Map<string, string>();
      for (let k = 0; k < Math.max(1, faces); k++) {
        made.set(`face:${k}`, await rasterScan(`Face ${k + 1}`, seed, scale));
      }
      const unseen = await rasterScan("A Brand New Face", seed + 7, scale);
      if (!live) return;
      setArt(made);
      setFresh(unseen);
      setResults({ ready: true, faces: made.size, res, scale });
    })();
    return () => {
      live = false;
    };
  }, [base, seed, faces, res]);

  const board = useMemo(() => {
    if (!art) return null;
    // Round-robin over the STARTING board, fixed per card: the k-th card
    // with a picture shows face k mod faces, whatever later leaves.
    const faceOf = new Map<string, string>();
    for (const c of [...base.battlefield, ...base.hand]) {
      if (c.art) faceOf.set(c.id, `face:${faceOf.size % art.size}`);
    }
    const pic = (c: { id: string; art: string | null }) =>
      c.art ? (art.get(faceOf.get(c.id) ?? "") ?? null) : null;
    let battlefield = base.battlefield.map((c) => ({ ...c, art: pic(c) }));
    if (shifted) {
      // Every row re-centres: the oldest card of each group leaves.
      const seen = new Set<string>();
      battlefield = battlefield.filter((c) => {
        const key = `${c.seat}:${c.kind}`;
        if (seen.has(key) || c.attachedTo !== null) return true;
        seen.add(key);
        return false;
      });
    }
    if (extra) battlefield = [...battlefield, extra];
    return {
      battlefield,
      hand: base.hand.map((c) => ({ ...c, art: pic(c) })),
    };
  }, [art, base, shifted, extra]);

  // Timings that end at a paint: measured after React has committed.
  useLayoutEffect(() => {
    const m = mark.current;
    if (!m) return;
    mark.current = null;
    void (async () => {
      if (m.kind === "show") {
        await nextFrame();
        await nextFrame(); // the frame after the one that painted the board
        const firstPaintMs = performance.now() - m.at;
        const images = [...document.querySelectorAll<HTMLImageElement>(".bf-art")];
        await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
        await nextFrame();
        const allFacesMs = performance.now() - m.at;
        const pixels = new Map<string, number>();
        for (const img of images) pixels.set(img.src, img.naturalWidth * img.naturalHeight);
        const decodedBytes = [...pixels.values()].reduce((n, p) => n + p * 4, 0);
        setResults((r) => ({ ...r, firstPaintMs, allFacesMs, decodedBytes }));
      } else {
        const img = document.querySelector<HTMLImageElement>(
          '[data-object-id="card:bench-new"] .bf-art',
        );
        if (img) await img.decode().catch(() => undefined);
        await nextFrame();
        setResults((r) => ({ ...r, newFaceMs: performance.now() - m.at }));
      }
    })();
  });

  const show = () => {
    mark.current = { kind: "show", at: performance.now() };
    setShown(true);
  };
  const shift = async () => {
    const frames: number[] = [];
    let longTasks = 0;
    const observer =
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask")
        ? new PerformanceObserver((list) => (longTasks += list.getEntries().length))
        : null;
    observer?.observe({ type: "longtask" });
    setShifted((s) => !s);
    let last = await nextFrame();
    const end = last + 400; // the move is 250 ms; a margin either side
    while (last < end) {
      const now = await nextFrame();
      frames.push(now - last);
      last = now;
    }
    observer?.disconnect();
    setResults((r) => ({ ...r, frames, longTasks }));
  };
  const newFace = () => {
    if (!fresh) return;
    mark.current = { kind: "face", at: performance.now() };
    setExtra({
      ...base.battlefield.find((c) => c.kind === "creature" && !c.faceDown)!,
      id: "card:bench-new",
      name: "A Brand New Face",
      seat: base.viewerSeat,
      tapped: false,
      attacking: false,
      attachedTo: null,
      enteredAt: 1e9,
      art: fresh,
    });
  };

  return (
    <div className="bf-page">
      {shown && board && (
        <Board
          battlefield={board.battlefield}
          hand={board.hand}
          viewerSeat={base.viewerSeat}
          artUrl={asIs}
        />
      )}
      <div className="bf-dev-note" role="note">
        <span>
          Benchmark — permanents {permanents}, faces {results.faces || faces}, pictures {res}. Not a
          game.{" "}
          {results.firstPaintMs !== undefined &&
            `First paint ${results.firstPaintMs.toFixed(0)} ms. `}
          {results.frames && `Shift: worst frame ${Math.max(...results.frames).toFixed(1)} ms. `}
          {results.newFaceMs !== undefined && `New face ${results.newFaceMs.toFixed(0)} ms.`}
        </span>
        <button type="button" className="bf-dev-next" disabled={!art || shown} onClick={show}>
          Show board
        </button>
        <button
          type="button"
          className="bf-dev-next"
          disabled={!shown}
          onClick={() => void shift()}
        >
          Shift all
        </button>
        <button
          type="button"
          className="bf-dev-next"
          disabled={!shown || !!extra}
          onClick={newFace}
        >
          New face
        </button>
      </div>
    </div>
  );
}
