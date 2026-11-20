import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HAND_ORIGIN,
  OPPONENT_HAND_ORIGIN,
  TAPPED_ORIGIN,
  geometry,
  layout,
  type Box,
} from "./layout";
import {
  GLIDE_LIFT,
  HAND_READ,
  HAND_RISE,
  READ_GAP,
  HURRY_MS,
  MOVE_MS,
  anchors,
  fateFrames,
  fateMs,
  flipFrames,
  glideFrames,
  handReadBox,
  handRiseBox,
  hurry,
  MERGE_FADE_AT,
  MERGE_FADE_MS,
  MERGE_MS,
  MERGE_PULL_MS,
  MERGE_RISE_SCALE,
  mergeFrames,
  PACE,
  paced,
  placement,
  RETURN_ARC,
  RETURN_GLIDE_MS,
  RETURN_GROW,
  RETURN_MS,
  RETURN_RISE,
  RETURN_RISE_MS,
  RIFFLE_MS,
  returnBackFrames,
  returnFrames,
  riffleFrames,
} from "./motion";
import { applyChanges, syntheticBoard } from "./fixture";
import { SCENARIO_NAMES, scenarioBoard } from "./scenarios";

/**
 * Movement geometry — BATTLEFIELD_RENDERING.md §7 step 4, PHASE 7
 * AMENDMENTS 4 and 6, spec 0040. Pure, like layout(): the browser only applies it.
 */

const VIEWPORTS = [
  { width: 1920, height: 947 }, // in a browser window (AGENTS UI-006)
  { width: 1920, height: 1080 },
  { width: 3440, height: 1440 },
  { width: 2560, height: 1440 },
];

/** Where CSS draws the local point (x, y) of a card placed at `box`. */
function drawn(box: Box, cardW: number, cardH: number, origin: { x: number; y: number }) {
  const ox = origin.x * cardW;
  const oy = origin.y * cardH;
  const tx = box.x - ox * (1 - box.scale);
  const ty = box.y - oy * (1 - box.scale);
  const t = (box.rotation * Math.PI) / 180;
  return (x: number, y: number) => ({
    x: tx + ox + box.scale * (Math.cos(t) * (x - ox) - Math.sin(t) * (y - oy)),
    y: ty + oy + box.scale * (Math.sin(t) * (x - ox) + Math.cos(t) * (y - oy)),
  });
}

describe("tapped cards fit their line (spec 0040, F-0040-B)", () => {
  it("every card's drawn corners stay inside its line, so nothing is cut", () => {
    const boards = [syntheticBoard(90, 30, 3), ...SCENARIO_NAMES.map((n) => scenarioBoard(n)!)];
    for (const vp of VIEWPORTS) {
      for (const board of boards) {
        const out = layout(board, vp);
        const g = out.geometry;
        const rects = new Map(out.lines.map((l) => [l.id, l.rect]));
        for (const slot of out.slots) {
          const rect = rects.get(slot.row)!;
          const at = drawn(slot.box, g.cardW, g.cardH, TAPPED_ORIGIN);
          const ys = [
            [0, 0],
            [g.cardW, 0],
            [0, g.cardH],
            [g.cardW, g.cardH],
          ].map(([x, y]) => at(x!, y!).y);
          // A 5-degree tilt is at most half a pixel taller than its line at 1080.
          const slack = 0.005 * rect.h;
          expect(Math.min(...ys)).toBeGreaterThanOrEqual(rect.y - slack);
          expect(Math.max(...ys)).toBeLessThanOrEqual(rect.y + rect.h + slack);
        }
      }
    }
  });
});

describe("the rail's zones (AMENDMENT 6)", () => {
  it("are in the rail, the opponent's above the stack above the viewer's", () => {
    for (const vp of VIEWPORTS) {
      const g = geometry(vp);
      const a = anchors(g);
      for (const id of ["stack", "viewer:graveyard", "opponent:exile", "viewer:library"] as const) {
        expect(a[id].x).toBeGreaterThan(g.rail.x);
        expect(a[id].x).toBeLessThan(g.rail.x + g.rail.w);
      }
      expect(a["opponent:exile"].y).toBeLessThan(a.stack.y);
      expect(a.stack.y).toBeLessThan(a["viewer:life"].y);
      expect(a["opponent:life"].y).toBeLessThan(a["opponent:library"].y);
      // Spec 0031: the opponent's hand fans down from the top edge, above
      // their back row.
      expect(a["opponent:hand"].y).toBeLessThan(g.halves.opponent.y);
      expect(a["viewer:hand"].y).toBeGreaterThan(g.handTop);
    }
  });

  it("sit on the plates' tiles and the life banner (specs 0029, 0038)", () => {
    const g = geometry({ width: 1600, height: 900 });
    const a = anchors(g);
    const at = (x: number) => g.rail.x + x; // the rail is 900 high here: 1 px = 1 unit
    // Spec 0031 — both plates: Library across the row, then Graveyard / Exile.
    for (const [side, top] of [
      // Spec 0038: the plates' tops in the evenly spaced rail.
      ["opponent", 26],
      ["viewer", 675],
    ] as const) {
      expect(a[`${side}:library`].x).toBeCloseTo(at(115.4), 0);
      expect(a[`${side}:library`].y).toBeCloseTo(top + 104, 0);
      expect(a[`${side}:graveyard`].x).toBeCloseTo(at(65.4), 0);
      expect(a[`${side}:exile`].x).toBeCloseTo(at(165.4), 0);
      expect(a[`${side}:exile`].y).toBe(a[`${side}:graveyard`].y);
      expect(a[`${side}:graveyard`].y).toBeCloseTo(top + 162, 0);
    }
    // Life: the banner at the head's right.
    expect(a["opponent:life"].x).toBeCloseTo(at(189.4), 0);
    expect(a["opponent:life"].y).toBeCloseTo(66, 0);
    expect(a["viewer:life"].y).toBeCloseTo(715, 0);
  });
});

describe("a pointed-at hand card and its reading card (spec 0094, F-0094-A)", () => {
  /** The four corners of a card placed at `box`, as drawn. */
  const cornersAt = (box: Box, cardW: number, cardH: number, origin: { x: number; y: number }) => {
    const at = drawn(box, cardW, cardH, origin);
    return [at(0, 0), at(cardW, 0), at(cardW, cardH), at(0, cardH)];
  };

  it("the card only rises; the reading card is 2.6x, upright, clear above the whole fan, in the play area", () => {
    for (const vp of VIEWPORTS) {
      for (const n of [1, 7, 12]) {
        for (const keep of [0, 300]) {
          const hand = Array.from({ length: n }, (_, i) => ({ id: `card:h${i}` }));
          const out = layout(
            { viewerSeat: 1, battlefield: [], hand, keepRight: { viewer: keep } },
            vp,
          );
          const g = out.geometry;
          for (const card of hand) {
            const rest = out.boxes.get(card.id)!;
            const risen = handRiseBox(rest, g);
            expect(risen.rotation).toBe(rest.rotation);
            expect(risen.scale).toBe(1);
            expect(risen.x).toBe(rest.x);
            expect(rest.y - risen.y).toBeCloseTo(HAND_RISE * g.cardH, 6);
            const read = handReadBox(rest, g, "viewer", keep);
            expect(read.rotation).toBe(0);
            expect(read.scale).toBe(HAND_READ);
            const at = drawn(read, g.cardW, g.cardH, { x: 0, y: 0 });
            const top = at(0, 0);
            const bottom = at(g.cardW, g.cardH);
            expect(bottom.x - top.x).toBeCloseTo(g.cardW * HAND_READ, 6);
            expect(bottom.y - top.y).toBeCloseTo(g.cardH * HAND_READ, 6);
            expect(top.y).toBeGreaterThanOrEqual(0);
            expect(top.x).toBeGreaterThanOrEqual(g.play.x + g.inset - 1e-6);
            expect(bottom.x).toBeLessThanOrEqual(
              g.play.x + g.play.w - Math.max(g.inset, keep) + 1e-6,
            );
            // Clear of every card of the fan, the risen one included: its
            // bottom READ_GAP above the highest corner of any of them.
            const fanTop = Math.min(
              ...hand.flatMap((other) =>
                cornersAt(
                  other.id === card.id ? risen : out.boxes.get(other.id)!,
                  g.cardW,
                  g.cardH,
                  HAND_ORIGIN,
                ).map((c) => c.y),
              ),
            );
            expect(bottom.y).toBeLessThanOrEqual(fanTop - READ_GAP * g.height + 1e-6);
            // ...and not floating far above it.
            expect(bottom.y).toBeGreaterThan(fanTop - READ_GAP * g.height - 0.1 * g.cardH);
            // Centred on the card, unless kept inside.
            const mid = cornersAt(risen, g.cardW, g.cardH, HAND_ORIGIN);
            const centre = (mid[0]!.x + mid[1]!.x) / 2;
            const clamped =
              centre - read.w / 2 < g.play.x + g.inset ||
              centre + read.w / 2 > g.play.x + g.play.w - Math.max(g.inset, keep);
            if (!clamped) expect((top.x + bottom.x) / 2).toBeCloseTo(centre, 6);
          }
        }
      }
    }
  });

  it("is about 254x355 at 1080 and 338x473 at 1440", () => {
    const size = (vp: { width: number; height: number }) => {
      const g = geometry(vp);
      return [g.cardW * HAND_READ, g.cardH * HAND_READ].map(Math.round);
    };
    const [w1, h1] = size({ width: 1920, height: 1080 });
    const [w2, h2] = size({ width: 2560, height: 1440 });
    expect(Math.abs(w1! - 254)).toBeLessThanOrEqual(2);
    expect(Math.abs(h1! - 355)).toBeLessThanOrEqual(2);
    expect(Math.abs(w2! - 338)).toBeLessThanOrEqual(2);
    expect(Math.abs(h2! - 473)).toBeLessThanOrEqual(2);
  });

  it("a discard pick's extra lift keeps the gap", () => {
    const vp = { width: 1920, height: 1080 };
    const hand = [{ id: "card:h0" }];
    const out = layout({ viewerSeat: 1, battlefield: [], hand }, vp);
    const g = out.geometry;
    const rest = out.boxes.get("card:h0")!;
    const plain = handReadBox(rest, g, "viewer", 0, 0);
    const lifted = handReadBox(rest, g, "viewer", 0, 0.08);
    expect(plain.y - lifted.y).toBeCloseTo(0.08 * g.cardH, 6);
  });

  it("their revealed card's reading card sits below their hand", () => {
    for (const vp of VIEWPORTS) {
      const theirs = Array.from({ length: 7 }, (_, i) => ({ id: `card:o${i}` }));
      const out = layout({ viewerSeat: 1, battlefield: [], hand: [], opponentHand: theirs }, vp);
      const g = out.geometry;
      for (const card of theirs) {
        const rest = out.boxes.get(card.id)!;
        const risen = handRiseBox(rest, g, "opponent");
        expect(risen.y - rest.y).toBeCloseTo(HAND_RISE * g.cardH, 6);
        const read = handReadBox(rest, g, "opponent");
        const fanBottom = Math.max(
          ...theirs.flatMap((other) =>
            cornersAt(
              other.id === card.id ? risen : out.boxes.get(other.id)!,
              g.cardW,
              g.cardH,
              OPPONENT_HAND_ORIGIN,
            ).map((c) => c.y),
          ),
        );
        expect(read.y).toBeGreaterThanOrEqual(fanBottom + READ_GAP * g.height - 1e-6);
        expect(read.y + read.h).toBeLessThan(g.height / 2 + g.cardH);
      }
    }
  });
});

describe("synthetic changes (the dev page's Next change)", () => {
  const start = syntheticBoard(40, 30, 1);

  it("are the same for the same seed and step", () => {
    expect(applyChanges(start, 9, 1).board).toEqual(applyChanges(start, 9, 1).board);
    expect(applyChanges(start, 0, 1).board).toEqual(start);
  });

  it("each does what it says", () => {
    let before = start;
    for (let n = 1; n <= 16; n++) {
      const step = applyChanges(start, n, 1);
      const was = new Set(before.battlefield.map((c) => c.id));
      const is = new Set(step.board.battlefield.map((c) => c.id));
      if (step.what.endsWith("dies")) {
        expect(step.departures.size).toBeGreaterThan(0);
        for (const id of step.departures.keys()) expect(is.has(id)).toBe(false);
      }
      if (step.what.includes("resolves")) {
        const [id, from] = [...step.arrivals][0]!;
        expect(from).toBe("stack");
        expect(was.has(id)).toBe(false);
        expect(is.has(id)).toBe(true);
      }
      if (step.what === "a land is played from the hand") {
        const moved = before.hand[0]!.id;
        expect(is.has(moved)).toBe(true);
        expect(step.board.hand.some((c) => c.id === moved)).toBe(false);
      }
      if (step.what.endsWith("returns to your hand")) {
        const back = step.board.hand[step.board.hand.length - 1]!.id;
        expect(was.has(back)).toBe(true);
        expect(is.has(back)).toBe(false);
      }
      before = step.board;
    }
  });
});

// Phase 10 A-00 -- "A · Glide" (owner 2026-11-06, Amendment 3).
describe("Glide", () => {
  const box = (x: number, y: number, scale = 1, rotation = 0): Box => ({
    x,
    y,
    w: 100 * scale,
    h: 140 * scale,
    scale,
    rotation,
    z: 0,
  });
  const origin = { x: 0.5, y: 0.5 };
  const numbers = (t: unknown) =>
    String(t)
      .replace("translate3d", "translate")
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);

  it("starts where the card is and lands exactly where the layout puts it", () => {
    const from = box(100, 600, 0.3);
    const to = box(500, 300, 1, 90);
    const frames = glideFrames(from, to, 100, 140, origin);
    expect(frames[0]!["transform"]).toBe(placement(from, 100, 140, origin).transform);
    expect(frames.at(-1)!["transform"]).toBe(placement(to, 100, 140, origin).transform);
    expect(frames.at(-1)!["offset"]).toBe(1);
  });

  it("bows upward: halfway, the card is above the straight line", () => {
    const frames = glideFrames(box(0, 400), box(800, 400), 100, 140, origin);
    const middle = numbers(frames[10]!["transform"]);
    expect(middle[1]!).toBeLessThan(400 - 0.1 * 800 * 0.9);
  });

  it("lifts on a journey, hardly at all on a short hop", () => {
    // The highest point of the lift, wherever it falls in time.
    const scaleAt = (frames: Keyframe[]) =>
      Math.max(...frames.map((f) => numbers(f["transform"]).at(-1)!));
    expect(scaleAt(glideFrames(box(0, 400), box(800, 400), 100, 140, origin))).toBeCloseTo(
      1 + GLIDE_LIFT,
      2,
    );
    expect(scaleAt(glideFrames(box(0, 400), box(20, 400), 100, 140, origin))).toBeLessThan(1.01);
  });

  it("fades as asked, landing at the end value", () => {
    const frames = glideFrames(box(0, 0), box(300, 0), 100, 140, origin, origin, {
      from: 1,
      to: 0.15,
    });
    expect(frames[0]!["opacity"]).toBe(1);
    expect(frames.at(-1)!["opacity"]).toBeCloseTo(0.15, 5);
  });

  it("a tap turns in place: no bow, no lift", () => {
    const frames = glideFrames(box(200, 200), box(200, 200, 1, 90), 100, 140, origin);
    for (const frame of frames) {
      const [x, y] = numbers(frame["transform"]);
      expect(x).toBeCloseTo(200, 5);
      expect(y).toBeCloseTo(200, 5);
    }
  });
});

describe("hurry: the player acts while cards move", () => {
  const fake = (endTime: number, currentTime: number, iterations = 1, playState = "running") => {
    const animation = {
      playState,
      currentTime,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime, iterations }) },
      updatePlaybackRate(rate: number) {
        this.playbackRate = rate;
      },
    };
    return animation;
  };

  it("finishes what is moving in a tenth of a second, and leaves endless glows alone", () => {
    const long = fake(450, 50);
    const almost = fake(450, 400);
    const glow = fake(Infinity, 900, Infinity);
    const root = { getAnimations: () => [long, almost, glow] } as unknown as Element;
    hurry(root);
    expect(long.playbackRate).toBeCloseTo(400 / HURRY_MS, 5);
    expect(almost.playbackRate).toBe(1); // 50 ms left: already quicker than a hurry
    expect(glow.playbackRate).toBe(1);
  });
});

describe("defeated and exiled (Phase 10 A-04, A-05)", () => {
  const card = (x: number, y: number, scale = 1): Box => ({
    x,
    y,
    w: 100 * scale,
    h: 140 * scale,
    scale,
    rotation: 0,
    z: 0,
  });
  const origin = { x: 0.5, y: 0.5 };
  for (const fate of ["defeated", "exiled"] as const) {
    it(`${fate}: the fate shows first, then one Glide, landing exactly`, () => {
      const to = card(1700, 900, 0.3);
      const { frames, duration } = fateFrames(fate, card(500, 300), to, 100, 140, origin, origin);
      expect(duration).toBe(fateMs(fate) + MOVE_MS);
      const offsets = frames.map((f) => Number(f["offset"]));
      expect(offsets[0]).toBe(0);
      expect(offsets.at(-1)).toBe(1);
      for (let i = 1; i < offsets.length; i++) expect(offsets[i]!).toBeGreaterThan(offsets[i - 1]!);
      expect(frames.at(-1)!["transform"]).toBe(placement(to, 100, 140, origin).transform);
      expect(frames.at(-1)!["opacity"]).toBeCloseTo(0.15, 5);
      // Every frame names the same filters, so the browser can blend them.
      const names = (f: Keyframe) => String(f["filter"]).replace(/\([^)]*\)/g, "()");
      for (const f of frames) expect(names(f)).toBe(names(frames[0]!));
    });
  }
});

describe("Lift, flip, settle (Phase 10 A-09)", () => {
  it("the old face lifts and turns edge-on, then is gone; the new one turns round and settles", () => {
    const out = flipFrames(136, "out");
    const into = flipFrames(136, "in");
    expect(out[0]!["opacity"]).toBe(1);
    expect(out.at(-1)!["opacity"]).toBe(0);
    expect(into[0]!["opacity"]).toBe(0);
    expect(into.at(-1)!["opacity"]).toBe(1);
    // Edge-on at the same moment, so one hands over to the other.
    const edgeOut = out.find((f) => String(f["transform"]).includes("rotateY(90deg)"))!["offset"];
    const shown = into.find((f) => f["opacity"] === 1)!["offset"];
    expect(Number(shown)).toBeCloseTo(Number(edgeOut) + 0.005, 6);
    // It ends where it started: on the table, its own size.
    expect(String(into.at(-1)!["transform"])).toContain("translateY(0px) scale(1)");
  });
});

describe("Fusion burst (Phase 10 A-10)", () => {
  const card = (x: number, y: number, scale = 1): Box => ({
    x,
    y,
    w: 110 * scale,
    h: 154 * scale,
    scale,
    rotation: 0,
    z: 0,
  });
  const origin = { x: 0.5, y: 0.5 };
  const colour = "185 147 232";
  const host = card(330, 200);
  const partner = card(500, 200);
  const scaleOf = (f: Keyframe) => Number(/scale\(([^)]+)\)/.exec(String(f["transform"]))![1]);
  const slamAt = (frames: Keyframe[], seen: number) =>
    Number(frames.find((f) => f["opacity"] === seen)!["offset"]) * MERGE_MS;

  it("the merged card: unseen until the slam, rises to 1.18, and lands exactly where the layout puts it", () => {
    const frames = mergeFrames("new", host, host, 110, 154, origin, colour);
    expect(frames[0]!["offset"]).toBe(0);
    expect(frames.at(-1)!["offset"]).toBe(1);
    for (let i = 1; i < frames.length; i++)
      expect(Number(frames[i]!["offset"])).toBeGreaterThan(Number(frames[i - 1]!["offset"]));
    expect(frames[0]!["transform"]).toBe(placement(host, 110, 154, origin).transform);
    expect(frames[0]!["opacity"]).toBe(0);
    expect(frames.at(-1)!["transform"]).toBe(placement(host, 110, 154, origin).transform);
    expect(frames.at(-1)!["opacity"]).toBe(1);
    expect(String(frames.at(-1)!["filter"])).toContain("brightness(1)");
    // Seen from the slam, which comes after the pull.
    expect(slamAt(frames, 1)).toBeCloseTo(MERGE_PULL_MS + 1, 6);
    // Out of the light: three times as bright at the slam, glowing in the merge's colour.
    const slam = frames.find((f) => f["opacity"] === 1)!;
    expect(String(slam["filter"])).toContain("brightness(3)");
    const peak = Math.max(...frames.map(scaleOf));
    expect(peak).toBeGreaterThan(MERGE_RISE_SCALE - 0.03);
    expect(peak).toBeLessThanOrEqual(MERGE_RISE_SCALE + 1e-9);
    expect(frames.some((f) => String(f["filter"]).includes(`rgb(${colour}`))).toBe(true);
  });

  it("the partner and the old face: pulled in with a wind-up away, fading into the merge from the slam, either side of the spot", () => {
    const coming = mergeFrames("partner", partner, host, 110, 154, origin, colour);
    const old = mergeFrames("old", host, host, 110, 154, origin, colour);
    for (const frames of [coming, old]) {
      expect(frames[0]!["opacity"]).toBe(1);
      expect(frames.at(-1)!["opacity"]).toBe(0);
      // Spec 0083 (L1): still seen at the slam, then fading out over
      // MERGE_FADE_MS from just after it -- never gone at full strength.
      const at = (ms: number) =>
        frames.find((f) => Math.abs(Number(f["offset"]) * MERGE_MS - ms) < 1e-6);
      expect(at(MERGE_PULL_MS + 1)!["opacity"]).toBe(1);
      const gone = slamAt(frames, 0);
      expect(gone).toBeGreaterThanOrEqual(MERGE_PULL_MS + MERGE_FADE_AT + MERGE_FADE_MS - 1);
      const opacities = frames.map((f) => Number(f["opacity"]));
      for (let i = 1; i < opacities.length; i++)
        expect(opacities[i]!).toBeLessThanOrEqual(opacities[i - 1]!);
    }
    expect(coming[0]!["transform"]).toBe(placement(partner, 110, 154, origin).transform);
    expect(old[0]!["transform"]).toBe(placement(host, 110, 154, origin).transform);
    const xOf = (f: Keyframe) =>
      Number(/translate3d\(([-\d.e]+)px/.exec(String(f["transform"]))![1]);
    const hostX = xOf(placement(host, 110, 154, origin));
    // The wind-up: the partner first moves AWAY from the spot (right), and up.
    expect(xOf(coming[3]!)).toBeGreaterThan(xOf(coming[0]!));
    // The slam: 18 canvas pixels right of the spot, the old face 18 left.
    const atSlam = (frames: Keyframe[]) => frames.at(-1)!;
    expect(xOf(atSlam(coming)) - hostX).toBeCloseTo(18, 6);
    expect(xOf(atSlam(old)) - hostX).toBeCloseTo(-18, 6);
  });

  it("every part runs the same length, so a hurry keeps them together", () => {
    const parts = (["partner", "old", "new"] as const).map((part) =>
      mergeFrames(part, partner, host, 110, 154, origin, colour),
    );
    for (const frames of parts) expect(frames.at(-1)!["offset"]).toBe(1);
    // The slam is the same moment in all three: the new face appears as the
    // others are at their slam spot (spec 0083: they fade from there).
    const slam = (MERGE_PULL_MS + 1) / MERGE_MS;
    expect(slamAt(parts[2]!, 1)).toBeCloseTo(MERGE_PULL_MS + 1, 6);
    for (const frames of parts) expect(frames.some((f) => f["offset"] === slam)).toBe(true);
  });

  it("a hurry finishes a merge in a tenth of a second, like every other movement", () => {
    let rate = 1;
    const run = {
      playState: "running",
      currentTime: 200,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: MERGE_MS, iterations: 1 }) },
      updatePlaybackRate(r: number) {
        rate = r;
      },
    };
    hurry({ getAnimations: () => [run] } as unknown as Element);
    expect((MERGE_MS - 200) / rate).toBeCloseTo(HURRY_MS, 6);
  });
});

describe("Lift and glide (Phase 10 A-14)", () => {
  const box = (x: number, y: number, scale = 1, rotation = 0): Box => ({
    x,
    y,
    w: 100 * scale,
    h: 140 * scale,
    scale,
    rotation,
    z: 0,
  });
  const origin = { x: 0.5, y: 0.5 };
  const numbers = (t: unknown) =>
    String(t)
      .replace("translate3d", "translate")
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
  const at = (frames: Keyframe[], ms: number) =>
    frames.find((f) => Math.abs(Number(f["offset"]) - ms / RETURN_MS) < 1e-9)!;

  it("is the canvas's numbers: 180 ms up, 520 ms across (at spec 0106's pace)", () => {
    expect(RETURN_RISE_MS).toBe(paced(180));
    expect(RETURN_GLIDE_MS).toBe(paced(520));
    expect(RETURN_MS).toBe(paced(180) + paced(520));
    expect(RETURN_GROW).toBe(1.05);
    expect(RIFFLE_MS).toBe(paced(700));
  });

  it("starts exactly where the card is and lands exactly where the layout puts it", () => {
    const from = box(300, 500);
    const to = box(800, 950, 0.75, 4);
    const frames = returnFrames(from, to, 100, 140, origin, { x: 0.5, y: 1 });
    expect(frames[0]!["transform"]).toBe(placement(from, 100, 140, origin).transform);
    expect(frames[0]!["offset"]).toBe(0);
    expect(frames.at(-1)!["transform"]).toBe(placement(to, 100, 140, { x: 0.5, y: 1 }).transform);
    expect(frames.at(-1)!["offset"]).toBe(1);
    expect(frames.at(-1)!["opacity"]).toBe(1); // whole: a card of that hand
    // Offsets only ever go forward.
    for (let i = 1; i < frames.length; i++)
      expect(Number(frames[i]!["offset"])).toBeGreaterThan(Number(frames[i - 1]!["offset"]));
  });

  it("first rises a little and grows to 1.05, with the gold glow, then arcs above the straight line", () => {
    const frames = returnFrames(box(0, 500), box(800, 500), 100, 140, origin);
    const top = numbers(at(frames, RETURN_RISE_MS)["transform"]);
    expect(top[0]).toBeCloseTo(0, 6);
    expect(top[1]).toBeCloseTo(500 - RETURN_RISE * 140, 6);
    expect(top.at(-1)).toBeCloseTo(RETURN_GROW, 6);
    expect(String(at(frames, RETURN_RISE_MS)["filter"])).toContain("rgba(241, 195, 106");
    expect(String(frames.at(-1)!["filter"])).toContain("0px 0px 0px"); // glow gone as it lands
    const middle = numbers(at(frames, RETURN_RISE_MS + RETURN_GLIDE_MS / 2)["transform"]);
    // Halfway down from the rise to its place, and the arc above that.
    expect(middle[1]!).toBeCloseTo(500 - (RETURN_RISE * 140) / 2 - RETURN_ARC * 140, 6);
  });

  it("into a library it sinks into the pile; into a hidden hand the card fades out as its back fades in", () => {
    const from = box(0, 500);
    const to = box(1700, 60, 0.3);
    const sink = returnFrames(from, to, 100, 140, origin, origin, "sink");
    expect(sink.at(-1)!["opacity"]).toBe(0);
    expect(at(sink, RETURN_RISE_MS + RETURN_GLIDE_MS / 2)["opacity"]).toBe(1);
    const out = returnFrames(from, to, 100, 140, origin, origin, "out");
    const inn = returnFrames(from, to, 100, 140, origin, origin, "in");
    expect(out.length).toBe(inn.length);
    out.forEach((frame, i) => {
      // The same path, and between them always one whole card.
      expect(frame["transform"]).toBe(inn[i]!["transform"]);
      expect(Number(frame["opacity"]) + Number(inn[i]!["opacity"])).toBeCloseTo(1, 9);
    });
    expect(out[0]!["opacity"]).toBe(1);
    expect(inn[0]!["opacity"]).toBe(0);
    expect(inn.at(-1)!["opacity"]).toBe(1);
    // The turn is on the way, not at either end: still face up at 40% of the glide.
    expect(at(inn, RETURN_RISE_MS + RETURN_GLIDE_MS * (6 / 16))["opacity"]).toBe(0);
  });

  it("the card back over its face turns down between 45% and 55% of the glide", () => {
    const frames = returnBackFrames();
    expect(frames[0]!["opacity"]).toBe(0);
    expect(frames[1]!["offset"]).toBeCloseTo((180 + 0.45 * 520) / 700, 9);
    expect(frames[1]!["opacity"]).toBe(0);
    expect(frames[2]!["offset"]).toBeCloseTo((180 + 0.55 * 520) / 700, 9);
    expect(frames.at(-1)!["opacity"]).toBe(1);
  });

  it("a riffle fans each back out and back to rest", () => {
    for (let i = 0; i < 6; i++) {
      const frames = riffleFrames(i, 0.7);
      expect(frames[0]!["transform"]).toBe(frames.at(-1)!["transform"]);
      expect(String(frames[1]!["transform"])).not.toBe(frames[0]!["transform"]);
    }
    expect(numbers(riffleFrames(0, 1)[1]!["transform"]).slice(2, 4)).toEqual([-14, -10]);
  });

  it("a hurry finishes it in a tenth of a second, like every other movement", () => {
    let rate = 1;
    const run = {
      playState: "running",
      currentTime: 100,
      playbackRate: 1,
      effect: { getComputedTiming: () => ({ endTime: RETURN_MS, iterations: 1 }) },
      updatePlaybackRate(r: number) {
        rate = r;
      },
    };
    hurry({ getAnimations: () => [run] } as unknown as Element);
    expect((RETURN_MS - 100) / rate).toBeCloseTo(HURRY_MS, 6);
  });
});

// --- Spec 0106, item 1 (F-0106-A): the table's pace -------------------------------------------

type PaceClass = "move" | "wait" | "limit" | "loop" | "screen" | "derived";
/**
 * Every timing constant on the battlefield, classified (spec 0106's As built):
 * a movement is written `paced(<the canvas's ms>)`; a wait, limit, loop or the
 * loading screen's own time is not paced and says so on its line; a derived one
 * is made of the others. A new constant fails until it is classified here.
 */
const PACE_TABLE: Record<string, Record<string, PaceClass>> = {
  "motion.ts": {
    MOVE_MS: "move",
    SETTLE_MS: "move",
    HURRY_MS: "wait",
    FLIP_MS: "move",
    MERGE_PULL_MS: "move",
    MERGE_RISE_MS: "move",
    MERGE_MS: "derived",
    MERGE_FLASH_MS: "move",
    MERGE_RING_MS: "move",
    MERGE_BRIGHT_MS: "move",
    MERGE_GLOW_MS: "move",
    MERGE_FADE_MS: "move",
    MERGE_FADE_AT: "move",
    TETHER_MS: "move",
    PULL_MS: "move",
    PULSE_MS: "move",
    SHAKE_MS: "move",
    CRACK_MS: "move",
    BANISH_MS: "move",
    SWEEP_MS: "move",
    SPENT_FOLD_MS: "move",
    SPENT_BEAT_MS: "move",
    COIN_MS: "move",
    RETURN_RISE_MS: "move",
    RETURN_GLIDE_MS: "move",
    RETURN_MS: "derived",
    RETURN_GLOW_PEAK_MS: "move",
    RIFFLE_MS: "move",
    RIFFLE_BEAT_MS: "move",
  },
  "Board.tsx": {
    ATTACK_MS: "move",
    ATTACK_BEAT_MS: "move",
    BLOCK_MS: "move",
    BLOCK_BEAT_MS: "move",
    LIFE_MARK_MS: "wait",
    LIFE_CRACK_MS: "move",
    LIFE_GLOW_MS: "move",
    FIZZLE_WARD_MS: "move",
    PHASE_IN_MS: "move",
    PULSE_MS: "move",
    WASH_MS: "move",
    SPLIT_LIFT_MS: "move",
    SPELL_HIT_MS: "move",
    SHUFFLE_AFTER_MS: "move",
    TETHERS_GONE_MS: "limit",
    LINE_OUT_MS: "move",
    SWING_MS: "move",
    RESOLVE_MS: "move",
    FAN_GONE_MS: "limit",
    FAN_AFTER_LAND_MS: "wait",
    RISE_MS: "move",
    SHOW_LIFT_AT: "move",
    SPELL_WAIT_MS: "limit",
    STACK_IN_MS: "move",
    LANDED_FADE_MS: "move",
  },
  "GameScreen.tsx": {
    RESPONSE_WINDOW_MS: "wait",
    LANDING_BEAT_MS: "wait",
    THEIR_SPELL_HOLD_MS: "derived",
    SWING_HOLD_MS: "limit",
    SWEEP_MS: "move",
    HANDOFF_MS: "move",
    FREE_RISE_CAP_MS: "limit",
    RESOLVING_AFTER_MS: "wait",
    STEADY_MS: "wait",
    PLACING_QUIET_MS: "wait",
    SWITCH_SIDES_MS: "move",
    LIFE_HIT_MS: "move",
  },
  "alive.ts": {
    ALIVE_MOTES_MS: "move",
    ALIVE_PULSE_MS: "move",
    ALIVE_RING_MS: "move",
    ALIVE_CLOSE_MS: "move",
    ALIVE_BACK_MS: "move",
    ALIVE_FLOAT_MS: "wait",
    ALIVE_POP_MS: "move",
  },
  "benchScenes.ts": { STORM_BEAT_MS: "wait", REPORT_BEAT_MS: "wait", FLYER_TAB_LIT_MS: "wait" },
  "breathMotion.ts": { ZZ_LOOP_MS: "loop", ZZ_GAP_MS: "loop" },
  "copies.ts": {
    COPY_LIFT_MS: "move",
    COPY_GLIDE_MS: "move",
    COPY_FADE_MS: "move",
    COPY_GHOST_MS: "derived",
    COPY_FLIP_AT: "derived",
    COPY_MARK_AT: "move",
    MARK_GROW_MS: "move",
    ORIGINAL_GLOW_MS: "move",
    PEEL_IN_LIFT_MS: "move",
    PEEL_IN_MS: "derived",
    PEEL_MARK_AT: "move",
    PEEL_BEAT_MS: "move",
    COPY_END_MS: "move",
    FIZZLE_REACH_MS: "move",
    FIZZLE_RING_MS: "move",
    FIZZLE_BEAM_OUT_AT: "move",
    FIZZLE_GREY_AT: "move",
    FIZZLE_GREY_MS: "move",
    FIZZLE_GO_AT: "move",
    FIZZLE_MS: "derived",
    FIZZLE_HOLD_MS: "derived",
  },
  "effects.ts": { NUMBER_MS: "wait" },
  "fights.ts": {
    FIGHT_FOCUS_MS: "move",
    FIGHT_REAR_MS: "move",
    FIGHT_LUNGE_MS: "move",
    FIGHT_SECOND_MS: "move",
    FIGHT_KNOCK_MS: "move",
    FIGHT_BACK_MS: "move",
    FIGHT_BEAT_MS: "wait",
    FIGHT_CRACKED_MS: "move",
    STRIKE_REAR_MS: "move",
    STRIKE_LUNGE_MS: "move",
    STRIKE_HOLD_MS: "wait",
    STRIKE_BACK_MS: "move",
    STRIKE_AFTER_MS: "wait",
    CARRY_MS: "move",
    FIGHTS_FADE_MS: "move",
    SLASH_MS: "move",
    SLASH_GAP_MS: "move",
    SLASH_NUMBER_MS: "wait",
    HURT_EDGE_MS: "move",
    FIGHTS_MAX_MS: "limit",
  },
  "gameEnd.ts": {
    END_WAIT_MAX_MS: "limit",
    BREAK_AT: "move",
    BREAK_MS: "move",
    CRACK_IN_MS: "move",
    DIM_MS: "move",
    PLATE_DIM_AFTER: "move",
    FLARE_AT: "move",
    FLARE_MS: "move",
    GLOW_MS: "move",
    BANNER_AT: "move",
    BANNER_MS: "move",
  },
  "graves.ts": {
    DISCARD_LIFT_MS: "move",
    DISCARD_DROP_MS: "move",
    DISCARD_MS: "derived",
    DISCARD_BEAT_MS: "move",
    MILL_BEAT_MS: "move",
    MILL_OUT_MS: "move",
    MILL_IN_MS: "move",
    MILL_MS: "derived",
    STRIKE_MS: "move",
    ASH_MS: "move",
    COUNTER_GO_MS: "move",
    COUNTER_MS: "derived",
    STRIKE_FX_MS: "move",
    SHOW_RISE_MS: "move",
    SHOW_HOLD_MS: "wait",
    SHOW_GLIDE_MS: "move",
    SHOW_MS: "derived",
    SHOW_BEAT_MS: "move",
    SWEPT_LIFT_MS: "move",
    SWEPT_HOLD_MS: "wait",
    SWEPT_MS: "derived",
    TILE_POP_MS: "move",
  },
  "lifeTicks.ts": { LIFE_POINT_MS: "wait", LIFE_CHANGE_MAX_MS: "limit", LIFE_BEAT_MS: "wait" },
  "markMotion.ts": {
    RISE_MS: "move",
    RISE_HOLD_MS: "wait",
    DROP_MS: "move",
    POP_MS: "move",
    RISER_MS: "derived",
    RISER_BEAT_MS: "move",
    MARK_LAND_MS: "derived",
    WHY_PULSE_MS: "move",
    COMBAT_POP_MS: "move",
    HELD_IN_MS: "move",
    HELD_FLY_MS: "move",
    FREED_WAIT_MS: "move",
    TILE_GLOW_LEAD_MS: "move",
    TILE_GLOW_MS: "move",
  },
  "opening.ts": {
    DEAL_BEAT_MS: "move",
    DEAL_MS: "move",
    DEAL_NUMBER_AT: "move",
    TURN_DOWN_MS: "move",
    TURN_DOWN_BEAT_MS: "move",
    SWEEP_AT: "move",
    SWEEP_BEAT_MS: "move",
    SWEEP_MS: "move",
    RIFFLE_AT: "move",
    REDEAL_AT: "move",
    PUT_BACK_MS: "move",
    KEEP_FADE_MS: "move",
    KEEP_MS: "move",
  },
  "payPicks.ts": { PAY_HOLD_MS: "wait" },
  "piles.ts": {
    PEEL_MS: "move",
    TOKEN_GROW_MS: "move",
    TOKEN_MS: "derived",
    TOKEN_BEAT_MS: "move",
    TOKEN_BEAT_ABILITY_MS: "move",
    TOKEN_AFTER_MS: "move",
    SPARK_LEAD_MS: "move",
    SPARK_MS: "move",
    WAVE_MS: "move",
    WAVE_STEP_MS: "move",
    WAVE_NUMBER_AT: "move",
    BADGE_POP_MS: "move",
  },
  "reports.ts": { FOLD_MS: "wait" },
  "restart.ts": {
    RESTART_HOLD_MS: "limit",
    SWEEP_BEAT_MS: "move",
    SWEEP_SPAN_MS: "limit",
    RESTART_WAIT_MS: "limit",
  },
  "sizeTicks.ts": {
    BADGE_LEAD_MS: "move",
    TICK_LEAD_MS: "move",
    POP_MS: "move",
    GLOW_MS: "move",
    SHAKE_MS: "move",
    FLOAT_MS: "wait",
    TINT_AFTER_MS: "move",
    BADGE_GROW_MS: "move",
    BADGE_POP_MS: "move",
    BADGE_OUT_MS: "move",
    SHRINK_BEAT_MS: "wait",
  },
  "stepAside.ts": {
    ASIDE_MS: "move",
    BACK_AFTER_MS: "wait",
    STILL_HOLD_MS: "wait",
    STILL_FADE_MS: "move",
  },
  "survive.ts": {
    DOME_MS: "move",
    WARD_MS: "move",
    BREAK_MS: "move",
    SPARK_MS: "move",
    ZERO_MS: "wait",
    SHIELD_UP_MS: "move",
    SHAPE_IN_MS: "move",
    REGEN_BURST_AT: "move",
    REGEN_BURST_MS: "move",
    SILVER_SHATTER_AT: "move",
    SILVER_GONE_MS: "move",
    SILVER_SHARD_MS: "move",
    WARD_RING_MS: "move",
    WARD_FLARE_MS: "move",
  },
  "umbra.ts": {
    TAB_GO_MS: "move",
    UNFOLD_MS: "move",
    SLIDE_MS: "move",
    SHIELD_LEAD_MS: "move",
    HIT_MS: "move",
    CRACK_AT: "move",
    GONE_AT: "move",
    GONE_MS: "move",
    SHARD_MS: "move",
    GHOST_AT: "move",
  },
  "CardBadges.tsx": { MARK_OUT_MS: "move", PREVENT_TICK_AT_MS: "move", PREVENT_STEP_MS: "wait" },
  "CastingCard.tsx": {
    FLY_MS: "move",
    DECIDE_MS: "wait",
    SETTLE_MS: "move",
    FLIP_MS: "move",
    HOLD_MS: "wait",
  },
  "DayMedallion.tsx": { MEDALLION_MS: "move", TURN_MS: "move" },
  "DiceWindows.tsx": { ROLL_LINGER_MS: "wait" },
  "FanCards.tsx": {
    FAN_RISE_MS: "move",
    FAN_SINK_MS: "move",
    FAN_CLOSE_MS: "move",
    FAN_GLOW_MS: "move",
    FAN_TICK_MS: "move",
    FAN_MORE_MS: "move",
    FAN_FLOAT_MS: "wait",
    TILE_PULSE_MS: "move",
  },
  "LibraryTop.tsx": {
    TOP_RISE_MS: "move",
    TOP_HOLD_MS: "wait",
    TOP_SETTLE_MS: "move",
    TOP_SHOW_MS: "derived",
    TOP_LEAVE_MS: "move",
  },
  "LoadingRing.tsx": { COLLAPSE_MS: "screen", REVEAL_MS: "screen", BURST_MS: "screen" },
  "PoisonBadge.tsx": {
    PULSE_MS: "move",
    GROW_MS: "move",
    UNPOISON_STEP_MS: "wait",
    UNPOISON_PILL_MS: "wait",
    UNPOISON_GONE_AT: "move",
    UNPOISON_GONE_MS: "move",
  },
  "RevealTray.tsx": { READ_START_MS: "wait", READ_MS: "wait" },
  "RoomDoors.tsx": { DOOR_OPEN_MS: "move" },
  "flights.tsx": {
    HOLDER_FLY_MS: "move",
    HOLDER_LAND_MS: "move",
    EMBLEM_FLY_MS: "move",
    EMBLEM_AFTER_MS: "move",
    RING_FLY_MS: "move",
    SPARK_MS: "move",
    LOST_MS: "move",
  },
  "manaBalls.tsx": {
    BALL_MS: "move",
    BALL_LAG_MS: "move",
    POP_MS: "move",
    SPARK_MS: "move",
    BURST_MS: "move",
    PILL_HOLD_MS: "wait",
    BALLS_LONGEST_MS: "limit",
  },
  "playerMarks.tsx": {
    COUNT_POINT_MS: "wait",
    COUNT_CHANGE_MAX_MS: "limit",
    COUNT_PILL_MS: "wait",
    COUNT_PULSE_MS: "move",
    GROW_MS: "move",
    MAP_LIFT_MS: "move",
    MAP_STEP_AT: "move",
    MAP_STEP_MS: "move",
    MAP_GLOW_AT: "move",
  },
  "replay.tsx": { REPLAY_MAX_MS: "limit", REPLAY_MIN_MS: "limit" },
  "turnStart.tsx": {
    PLATE_RUN_MS: "move",
    SHIELD_GLOW_AT: "move",
    SHIELD_GLOW_MS: "move",
    ROLL_MS: "move",
    SWEEP_MS: "move",
  },
};

/** The waits and limits spec 0106 lists by name: never paced. */
const UNPACED: [string, string, number][] = [
  ["motion.ts", "HURRY_MS", 100],
  ["CastingCard.tsx", "HOLD_MS", 650],
  ["CastingCard.tsx", "DECIDE_MS", 150],
  ["fights.ts", "FIGHT_BEAT_MS", 450],
  ["fights.ts", "SLASH_NUMBER_MS", 1400],
  ["fights.ts", "FIGHTS_MAX_MS", 8000],
  ["RevealTray.tsx", "READ_MS", 1100],
  ["reports.ts", "FOLD_MS", 300],
  ["manaBalls.tsx", "BALLS_LONGEST_MS", 8000],
  ["replay.tsx", "REPLAY_MAX_MS", 12_000],
  ["gameEnd.ts", "END_WAIT_MAX_MS", 3000],
  ["restart.ts", "RESTART_HOLD_MS", 4000],
  ["restart.ts", "RESTART_WAIT_MS", 30_000],
  ["Board.tsx", "SPELL_WAIT_MS", 6500],
  ["GameScreen.tsx", "RESPONSE_WINDOW_MS", 5000],
  ["GameScreen.tsx", "SWING_HOLD_MS", 1500],
];

const here = resolve(__dirname);
const sourceOf = (file: string) => readFileSync(resolve(here, file), "utf8");
/** `const NAME... = rhs;` and the rest of its line. */
function declaration(source: string, name: string): { rhs: string; line: string } | null {
  const m = new RegExp(`^\\s*(?:export )?const ${name}\\b[^=]*= (.+?);(.*)$`, "m").exec(source);
  return m ? { rhs: m[1]!, line: m[0] } : null;
}

describe("F-0106-A · the table's pace (spec 0106, item 1)", () => {
  it("is 1.25x, rounded to a whole millisecond", () => {
    expect(PACE).toBe(1.25);
    expect(paced(450)).toBe(563);
    expect(MOVE_MS).toBe(paced(450));
  });

  it("every timing constant on the battlefield is classified (a new one must be)", () => {
    const files = readdirSync(here).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f),
    );
    const missing: string[] = [];
    for (const file of files) {
      const source = sourceOf(file);
      const names = [
        ...source.matchAll(/^\s*(?:export )?const ([A-Z][A-Z0-9_]*_MS)\b[^=]*=/gm),
        ...source.matchAll(/^\s*(?:export )?const ([A-Z][A-Z0-9_]*_(?:AT|AFTER))\s*=\s*(\d+)/gm),
      ]
        .filter((m) => m[2] === undefined || Number(m[2]) >= 20)
        .map((m) => m[1]!);
      for (const name of names) if (!PACE_TABLE[file]?.[name]) missing.push(`${file} ${name}`);
    }
    expect(missing).toEqual([]);
  });

  it("each movement is paced(<the canvas's ms>); each wait, limit and loop says it is not", async () => {
    const modules = import.meta.glob<Record<string, unknown>>("./*.{ts,tsx}");
    const wrong: string[] = [];
    for (const [file, names] of Object.entries(PACE_TABLE)) {
      const source = sourceOf(file);
      const mod = await modules[`./${file}`]!();
      for (const [name, how] of Object.entries(names)) {
        const d = declaration(source, name);
        if (!d) {
          wrong.push(`${file} ${name}: not found`);
          continue;
        }
        const base = /^paced\((\d+)\)$/.exec(d.rhs);
        if (how === "move") {
          if (!d.rhs.includes("paced(")) wrong.push(`${file} ${name}: not paced`);
          if (base && name in mod && mod[name] !== paced(Number(base[1])))
            wrong.push(`${file} ${name}: ${String(mod[name])} is not paced(${base[1]})`);
        } else if (how === "derived") {
          if (/(?<![A-Za-z_(\d])\d{2,}(?![\d)])/.test(d.rhs.replace(/paced\([^)]*\)/g, "")))
            wrong.push(`${file} ${name}: a bare number in a derived time`);
        } else if (d.rhs.includes("paced(") || !d.line.includes("not paced:")) {
          wrong.push(`${file} ${name}: a ${how} must not be paced, and must say so`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("the waits and limits spec 0106 names keep their numbers", async () => {
    const modules = import.meta.glob<Record<string, unknown>>("./*.{ts,tsx}");
    for (const [file, name, ms] of UNPACED) {
      expect(PACE_TABLE[file]![name], `${file} ${name}`).toMatch(/wait|limit/);
      const d = declaration(sourceOf(file), name)!;
      expect(Number(d.rhs.replace(/_/g, "")), `${file} ${name}`).toBe(ms);
      const mod = await modules[`./${file}`]!();
      if (name in mod) expect(mod[name], `${file} ${name}`).toBe(ms);
    }
  });
});
