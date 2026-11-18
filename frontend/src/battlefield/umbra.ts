// Spec 0089 (Q4 B, variant b -- owner 2026-11-13, canvas deep2-gameflow-1113)
// -- an umbra saves its creature. As the effect that would destroy the
// creature resolves, the umbra's side tab swings out and unfolds into a gold
// heater shield with the umbra's picture inside, covering the creature; the
// blow (a wipe's flash, the spell's beam) cracks it and it shatters, and a
// small ghost of the umbra goes to its owner's graveyard. The creature stays.
//
// Pure, like survive.ts: from where the tab and its creature stood and when
// the blow lands, the marks to play -- each one animation on the board's
// clock (A-00: a click hurries it). The Board only applies them. Nothing here
// decides that an umbra saved anything: the game says so (`survived` "umbra",
// `by` the Aura -- Forge's own replacement record, never a card's name).

import type { Box } from "./layout";

/** One mark, as the Board's FightMark takes it. */
export interface UmbraMark {
  key: string;
  kind: "umbratab" | "umbrashield" | "shard";
  style: Record<string, string | number>;
  frames: Keyframe[];
  duration: number;
  delay: number;
  of: string;
  /** The jump check follows the Aura through its tab and its shield. */
  ghostOf?: string;
}

/** The tab leaves the creature's edge, widening and fading (the canvas's 0.3 s). */
export const TAB_GO_MS = 300;
/** The shield unfolds from the tab (0.55 s), first sliding over the creature (0.3 s). */
export const UNFOLD_MS = 550;
export const SLIDE_MS = 300;
/**
 * Spec 0101 (combat Q6 v3) -- it starts unfolding this long before the
 * blow: its unfold, then whole 150 ms before the blow, the lead every shield
 * shape shares (survive.ts SHIELD_UP_MS). Was 650 (0089: whole 100 ms before).
 */
export const SHIELD_LEAD_MS = 550 + 150;
/** The blow: it brightens (0.3 s); it cracks 80 ms in; it goes from 250 ms over 200. */
export const HIT_MS = 300;
export const CRACK_AT = 80;
export const GONE_AT = 250;
export const GONE_MS = 200;
/** Its pieces fly from 250 ms after the blow, for 0.6 s. */
export const SHARDS = 18;
export const SHARD_MS = 600;
/** A small ghost of the umbra leaves for the graveyard 400 ms after the blow, at 0.55 of a card. */
export const GHOST_AT = 400;
export const GHOST_SCALE = 0.55;
/** The shield's size over its creature (the canvas's 1.35 x 1.22 of the card). */
export const SHIELD_W = 1.35;
export const SHIELD_H = 1.22;

/**
 * When the umbra's parts play, from the board's start: the shield is whole
 * SHIELD_LEAD_MS before the blow; a blow sooner than that (a single
 * destroy's beam) waits for it.
 */
export function umbraTimes(blow: number): { start: number; blow: number } {
  const start = Math.max(0, blow - SHIELD_LEAD_MS);
  return { start, blow: Math.max(blow, start + SHIELD_LEAD_MS) };
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const easeIO = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/**
 * The tab (`tab`: its box on the creature's right edge) swinging out, the
 * shield over the creature (`host`: its box), its pieces. All from the
 * board's start (`start`, `blow`: umbraTimes); [k] is the card height over
 * the canvas's 135.
 */
export function umbraMarks(
  key: string,
  aura: string,
  host: Box,
  tab: Box,
  start: number,
  blow: number,
  /** Toward the middle of the table: -1 for a creature on your side (up), 1 on theirs. */
  toMiddle: number,
): UmbraMark[] {
  const out: UmbraMark[] = [];
  const k = host.h / 135;
  const cx = host.x + host.w / 2;
  const cy = host.y + host.h / 2;
  const tabX = tab.x + tab.w / 2;
  // 1. The tab: held where it was from the first frame (the Aura has left
  //    the board's list), then it swings toward the middle of the creature,
  //    widening and fading as the shield takes over.
  const tabTotal = start + TAB_GO_MS;
  const t0 = start / tabTotal;
  const tabFrames: Keyframe[] = [{ offset: 0, opacity: 1, transform: "translateX(0px) scaleX(1)" }];
  if (t0 > 0) tabFrames.push({ offset: t0, opacity: 1, transform: "translateX(0px) scaleX(1)" });
  for (const q of [0.25, 0.5, 0.75, 1]) {
    tabFrames.push({
      offset: t0 + (1 - t0) * q,
      opacity: 1 - q,
      transform: `translateX(${((cx - tabX) * easeIO(q)).toFixed(1)}px) scaleX(${(1 + 2 * q).toFixed(2)})`,
    });
  }
  out.push({
    key: `${key}:tab`,
    kind: "umbratab",
    style: { left: tab.x, top: tab.y, width: tab.w, height: tab.h, ["--card-h"]: `${host.h}px` },
    frames: tabFrames,
    duration: tabTotal,
    delay: 0,
    of: aura,
    ghostOf: aura,
  });
  // 2. The shield: unfolding (scaleX from a sliver) as it slides from the
  //    tab over the creature, tilting a little; brightening and swelling at
  //    the blow; cracked; gone.
  const w = host.w * SHIELD_W;
  const h = host.h * SHIELD_H;
  const top = cy + 8 * k * toMiddle;
  const end = blow + GONE_AT + GONE_MS;
  const total = end - start;
  const at = (ms: number) => Math.min(1, Math.max(0, (ms - start) / total));
  const shield: Keyframe[] = [];
  const pose = (ms: number) => {
    const form = easeIO(Math.min(1, Math.max(0, (ms - start) / UNFOLD_MS)));
    const slide = easeOut(Math.min(1, Math.max(0, (ms - start) / SLIDE_MS)));
    const hitP = Math.min(1, Math.max(0, (ms - blow) / HIT_MS));
    const hit = hitP > 0 && hitP < 1 ? Math.sin(Math.PI * hitP) : 0;
    const gone = Math.min(1, Math.max(0, (ms - blow - GONE_AT) / GONE_MS));
    const x = tabX + (cx - tabX) * slide;
    return {
      offset: at(ms),
      opacity: Math.min(1, form * 1.5) * (1 - gone),
      transform: `translate(${(x - w / 2).toFixed(1)}px, ${(top - h / 2).toFixed(1)}px) scale(${(1 + 0.08 * hit).toFixed(3)}) scaleX(${Math.max(0.06, form).toFixed(3)}) rotate(${(-4 * form).toFixed(2)}deg)`,
      filter: `brightness(${(1 + 0.4 * hit).toFixed(2)})`,
    };
  };
  const stops = new Set<number>([start, end, blow, blow + HIT_MS, blow + GONE_AT]);
  for (let ms = start; ms <= end; ms += 50) stops.add(ms);
  for (const ms of [...stops].sort((a, b) => a - b)) shield.push(pose(ms));
  out.push({
    key: `${key}:shield`,
    kind: "umbrashield",
    style: { left: 0, top: 0, width: w, height: h, ["--crack-at"]: `${blow + CRACK_AT}ms` },
    frames: shield,
    duration: total,
    delay: start,
    of: aura,
    ghostOf: aura,
  });
  // 3. Its pieces, thrown out from the middle, falling a little.
  for (let i = 0; i < SHARDS; i++) {
    const a = (i / SHARDS) * Math.PI * 2 + ((i * 37) % 10) / 10;
    const sp = (70 + ((i * 29) % 60)) * k;
    const rot = (i % 2 ? 1 : -1) * (90 + ((i * 41) % 180));
    const fall = 40 * k;
    const sw = (10 + ((i * 7) % 14)) * k;
    const sh = (6 + ((i * 5) % 10)) * k;
    const frames: Keyframe[] = [0, 0.25, 0.5, 0.75, 1].map((q) => ({
      offset: q,
      opacity: 1 - q,
      transform: `translate(${(Math.cos(a) * sp * easeOut(q)).toFixed(1)}px, ${(Math.sin(a) * sp * easeOut(q) + fall * q * q).toFixed(1)}px) rotate(${(rot * q).toFixed(0)}deg)`,
    }));
    out.push({
      key: `${key}:shard:${i}`,
      kind: "shard",
      style: { left: cx, top, width: sw, height: sh },
      frames,
      duration: SHARD_MS,
      delay: blow + GONE_AT,
      of: aura,
    });
  }
  return out;
}

/** The ghost of the umbra on its way to the graveyard: the shield's middle, at GHOST_SCALE of the creature. */
export function umbraGhostBox(host: Box, cardW: number, cardH: number): Box {
  const s = host.scale * GHOST_SCALE;
  const w = cardW * s;
  const h = cardH * s;
  return {
    ...host,
    x: host.x + host.w / 2 - w / 2,
    y: host.y + host.h / 2 - h / 2,
    w,
    h,
    scale: s,
    rotation: 0,
  };
}
