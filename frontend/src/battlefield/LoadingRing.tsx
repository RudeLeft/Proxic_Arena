// While a game starts -- spec 0065, option A "Mana vortex" (owner
// 2026-11-07, canvas loading-1107): no logo; the five mana symbols orbit
// with glowing trails, faster and faster into a swirl, and when the table
// arrives they collapse into the centre and burst into light, the table
// opening out from the flash. The line underneath says what the wait is,
// in a player's words -- never the name of the engine behind it.
//
// The ending never holds the table up: the board is drawn in the same
// render its first picture arrives, UNDER the burst, and the burst plays
// over it -- clicks pass straight through -- for BURST_MS, then goes.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { symbolUrl } from "./ManaCost";

/** The colour pie, clockwise from the top, as on the back of a card. */
const PIE = ["W", "U", "B", "R", "G"] as const;
type Pip = (typeof PIE)[number];
/** Each symbol's light (the canvas's colours). */
const LIGHT: Record<Pip, readonly [number, number, number]> = {
  W: [255, 240, 200],
  U: [90, 170, 255],
  B: [170, 110, 200],
  R: [255, 110, 50],
  G: [90, 210, 110],
};

/** The ending: the symbols fall into the centre... */
export const COLLAPSE_MS = 300;
/** ...the flash and the opening circle reach the screen's corners... */
export const REVEAL_MS = 600;
/** ...and the last sparks fade: then the loading screen is gone (under 1.5 s). */
export const BURST_MS = 1200;

const BACKDROP = "#05070a";
const ORBIT = 112;
const PIP = 50;

const rgba = (c: readonly number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const easeIn = (t: number) => Math.max(0, Math.min(1, t)) ** 3;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function stillWanted(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

interface Spark {
  ring?: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  grow?: number;
  w?: number;
  c: readonly number[];
  life: number;
  max: number;
  drag?: number;
  alpha?: number;
}

/**
 * The swirl's clock, kept across loading screens: the page's "Starting
 * the game." hands over to the table's "Setting up the table…" a moment
 * later, and the symbols carry on where they were instead of starting
 * again.
 */
const swirl = { angle: 0, clock: 0, seen: 0 };

/**
 * When the loading screen shows (spec 0065): from [due] while nothing is
 * [drawn], and -- once it has shown -- on past the board's arrival, as
 * the burst, until it calls [done]. A board that arrives before [due]
 * never sees it.
 */
export function useVortexHandover(drawn: boolean, due: boolean) {
  const [up, setUp] = useState(false);
  // Derived in render, not in an effect: an effect would paint one frame
  // of the bare table before the burst covered it.
  if (due && !drawn && !up) setUp(true);
  const done = useCallback(() => setUp(false), []);
  return { show: up || (due && !drawn), ready: drawn, done };
}

export function LoadingRing({
  words,
  ready = false,
  onDone,
}: {
  words: string;
  /** The table has arrived: burst, then [onDone]. */
  ready?: boolean;
  onDone?: () => void;
}) {
  const [still] = useState(stillWanted);
  const done = useRef(onDone);
  done.current = onDone;

  // The end comes on a timer, not on animation frames: a tab in the
  // background draws no frames, and the table must still be uncovered.
  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => done.current?.(), still ? 250 : BURST_MS);
    return () => window.clearTimeout(timer);
  }, [ready, still]);

  return (
    <div
      className={`gs-loading${ready ? " gs-loading-ready" : ""}${still ? " gs-loading-still" : ""}`}
      role="status"
      data-vortex={ready ? "burst" : "wait"}
    >
      {still ? null : <Vortex ready={ready} />}
      <div className="gs-vortex" aria-hidden="true">
        {still
          ? PIE.map((symbol, i) => (
              <span
                key={symbol}
                className="gs-vortex-pip"
                style={{ "--gs-angle": `${i * 72}deg` } as CSSProperties}
              >
                <img src={symbolUrl(symbol)} alt="" draggable={false} />
              </span>
            ))
          : null}
      </div>
      <p className="gs-ring-words">{words}</p>
    </div>
  );
}

/** The canvas: the backdrop, the swirl and, once [ready], the burst with the table showing through. */
function Vortex({ ready }: { ready: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return undefined;
    const pictures = PIE.map((symbol) => {
      const picture = new Image();
      picture.src = symbolUrl(symbol) ?? "";
      return picture;
    });
    const now0 = performance.now();
    if (now0 - swirl.seen > 1000) {
      swirl.angle = 0;
      swirl.clock = 0;
    }
    let last = now0;
    let readyAt: number | null = null;
    let burst = false;
    let sparks: Spark[] = [];
    let frame = 0;

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      swirl.seen = now;
      const per = dt * 60; // the canvas's rates were per frame at 60 a second

      const box = canvas.parentElement!.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const W = box.width;
      const H = box.height;
      const centre = canvas.parentElement!.querySelector(".gs-vortex")?.getBoundingClientRect();
      const CX = centre ? centre.left - box.left + centre.width / 2 : W / 2;
      const CY = centre ? centre.top - box.top + centre.height / 2 : H / 2;
      const far = Math.hypot(Math.max(CX, W - CX), Math.max(CY, H - CY));

      let t: number;
      if (readyRef.current) {
        readyAt ??= now;
        t = (now - readyAt) / 1000;
      } else {
        if (readyAt !== null) {
          // The table went again before the burst ended: back to waiting.
          readyAt = null;
          burst = false;
        }
        swirl.clock += dt;
        t = swirl.clock;
      }
      const ending = readyAt !== null;
      const inS = COLLAPSE_MS / 1000;
      const revealS = REVEAL_MS / 1000;

      let R: number;
      let speed: number;
      let size = PIP;
      let flash = 0;
      if (!ending) {
        speed = 0.6 + Math.min(1.4, t * 0.12);
        R = ORBIT + Math.sin(t * 1.3) * 6;
      } else {
        const k = easeIn(t / inS);
        speed = 2 + k * 26;
        R = ORBIT * (1 - k);
        size = PIP * (1 - 0.6 * k);
        flash = t > inS ? Math.max(0, 1 - (t - inS) / revealS) : 0;
      }
      swirl.angle += speed * dt;

      // The backdrop; once the burst comes, a circle of it opens on the table.
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = BACKDROP;
      ctx.fillRect(0, 0, W, H);
      if (ending && t >= inS) {
        const r = ((t - inS) / revealS) * far;
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(CX, CY, Math.max(0, r), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }

      // The swirl's glow at the centre.
      if (!ending || t < inS) {
        const core = ctx.createRadialGradient(CX, CY, 0, CX, CY, 150);
        core.addColorStop(0, `rgba(255,230,180,${ending ? 0.35 + easeIn(t / inS) * 0.65 : 0.12})`);
        core.addColorStop(1, "rgba(255,230,180,0)");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(CX, CY, 150, 0, Math.PI * 2);
        ctx.fill();

        PIE.forEach((symbol, i) => {
          const a = swirl.angle + (i * 2 * Math.PI) / 5;
          // Its trail: a fading arc behind it.
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const len = Math.min(2.2, 0.5 + speed * 0.12);
          for (let j = 0; j < 18; j++) {
            const aa = a - (j / 18) * len;
            const rr = R + j * (ending ? 3 : 0.6);
            ctx.fillStyle = rgba(LIGHT[symbol], 0.32 * (1 - j / 18));
            ctx.beginPath();
            ctx.arc(
              CX + Math.cos(aa) * rr,
              CY + Math.sin(aa) * rr,
              size * 0.22 * (1 - j / 22),
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
          ctx.restore();
          const x = CX + Math.cos(a) * R;
          const y = CY + Math.sin(a) * R;
          const picture = pictures[i]!;
          if (picture.complete && picture.naturalWidth > 0) {
            const glow = 0.6 + 0.4 * Math.sin(t * 4 + i);
            ctx.save();
            ctx.shadowColor = rgba(LIGHT[symbol], Math.min(1, glow));
            ctx.shadowBlur = 28 * glow;
            ctx.drawImage(picture, x - size / 2, y - size / 2, size, size);
            ctx.restore();
          }
          if (Math.random() < 0.5 * per) {
            sparks.push({
              x,
              y,
              vx: -Math.sin(a) * 30 + rnd(-10, 10),
              vy: Math.cos(a) * 30 + rnd(-10, 10),
              r: rnd(1, 2.5),
              c: LIGHT[symbol],
              life: 0.8,
              max: 0.8,
              drag: 0.98,
            });
          }
        });
        // Motes spiralling in.
        for (let n = 0; n < 2; n++) {
          if (Math.random() >= per) continue;
          const a = rnd(0, Math.PI * 2);
          const r0 = rnd(180, 260);
          sparks.push({
            x: CX + Math.cos(a) * r0,
            y: CY + Math.sin(a) * r0,
            vx: -Math.cos(a) * 60 - Math.sin(a) * 50,
            vy: -Math.sin(a) * 60 + Math.cos(a) * 50,
            r: 1.2,
            c: LIGHT[PIE[(n * 2) % 5]!],
            life: 2.5,
            max: 2.5,
            alpha: 0.6,
          });
        }
      }

      // The burst: sparks every way and a ring of light to the corners.
      if (ending && t >= inS && !burst) {
        burst = true;
        for (let n = 0; n < 220; n++) {
          const a = rnd(0, Math.PI * 2);
          const v = rnd(120, 620);
          const life = rnd(0.4, 0.85);
          sparks.push({
            x: CX,
            y: CY,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            r: rnd(1.5, 3.5),
            c: LIGHT[PIE[n % 5]!],
            life,
            max: 0.85,
            drag: 0.96,
          });
        }
        sparks.push({
          ring: true,
          x: CX,
          y: CY,
          r: 10,
          vx: 0,
          vy: 0,
          grow: far / revealS,
          c: [255, 240, 210],
          w: 6,
          life: revealS,
          max: revealS,
        });
      }

      // The sparks.
      const keep: Spark[] = [];
      for (const p of sparks) {
        p.life -= dt;
        if (p.life <= 0) continue;
        if (p.drag) {
          const d = p.drag ** per;
          p.vx *= d;
          p.vy *= d;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const a = Math.min(1, p.life / p.max) * (p.alpha ?? 1);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        if (p.ring) {
          ctx.strokeStyle = rgba(p.c, a);
          ctx.lineWidth = p.w ?? 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + (p.max - p.life) * (p.grow ?? 0), 0, Math.PI * 2);
          ctx.stroke();
        } else {
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2);
          g.addColorStop(0, rgba([255, 255, 255], a));
          g.addColorStop(0.3, rgba(p.c, a));
          g.addColorStop(1, rgba(p.c, 0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        keep.push(p);
      }
      sparks = keep;

      if (flash > 0) {
        ctx.fillStyle = `rgba(255,248,230,${flash * 0.85})`;
        ctx.fillRect(0, 0, W, H);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvasRef} className="gs-vortex-canvas" aria-hidden="true" />;
}
