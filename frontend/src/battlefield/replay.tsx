// Spec 0103, item 3 (owner 2026-11-17, Q3 A; canvas "deep3-reports-comfort-
// 1117", section Q3, option A) -- replay a report's move on the table, at
// half speed: a click on the window's medallion, or R. The window stays
// open; the medallion's ring fills over the replay.
//
// Decided 5: only while the table is unchanged since that report. The game
// screen keeps the board pair the newest report arrived with (the board
// before it, and its own), and drops it the moment another board comes: the
// medallion then offers nothing and R does nothing. So the replay always
// ends on the board the table already shows -- nothing jumps when the live
// table comes back.
//
// The replay is the real Board, drawn a second time on a layer over the
// table that takes no pointer and no focus (inert): first the board before
// the report, then the report's own, so the Board plays the move exactly as
// it did, every animation on that layer at half speed. The plates' life
// numbers are not replayed (the life steps are the live plates' own, one
// clock for the page); the table's cards are.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../match";
import { Board } from "./Board";
import { boardFromSnapshot, exilePile } from "./fromSnapshot";
import type { PiledCard } from "./Board";

/** The replay's speed: half (the owner's "at half speed"). */
export const REPLAY_RATE = 0.5;
/** A replay never runs longer than this (a clock that never ends, a hidden tab). */
export const REPLAY_MAX_MS = 12_000;
/** It ends once nothing on its layer has moved for this long (after this much at least). */
const REPLAY_MIN_MS = 400;

/** The board pair a report arrived with: the board before it, and its own. */
export interface ReplayPair {
  key: string;
  prev: Snapshot;
  next: Snapshot;
}

/**
 * The pair the newest report arrived with, when [board] (the board now drawn)
 * brought a new report: the board before it and this one. Null otherwise --
 * any other board drops it (Decided 5).
 */
export function replayPairOf(before: Snapshot | null, board: Snapshot): ReplayPair | null {
  const key = board.action?.key;
  if (!before || !key || before.action?.key === key) return null;
  if (before.gameEpoch !== board.gameEpoch || before.seat !== board.seat) return null;
  return { key, prev: before, next: board };
}

function piledOf(board: Snapshot): Map<string, PiledCard> {
  const out = new Map<string, PiledCard>();
  for (const [zone, cards] of [
    ["graveyard", board.graveyard],
    ["exile", exilePile(board)],
  ] as const) {
    for (const card of cards)
      out.set(card.id, {
        id: card.id,
        seat: card.seat,
        zone,
        name: card.name,
        art: card.art,
        crop: card.crop ?? null,
        faceDown: card.faceDown && !card.known,
        look: card.kind,
      });
  }
  return out;
}

/** Every finite animation running on [root]'s layer, and how long the longest has left (ms). */
function running(root: Element): { all: Animation[]; left: number } {
  if (typeof root.getAnimations !== "function") return { all: [], left: 0 };
  const all = root.getAnimations({ subtree: true });
  let left = 0;
  for (const a of all) {
    const timing = a.effect?.getComputedTiming();
    if (!timing || timing.iterations === Infinity || a.playState !== "running") continue;
    const end = Number(timing.endTime ?? 0);
    const now = Number(a.currentTime ?? 0);
    left = Math.max(left, (end - now) / Math.abs(a.playbackRate || 1));
  }
  return { all, left };
}

/**
 * The replay's layer: the real Board over the table, the report's board pair
 * played again at half speed. [onProgress] 0..1 as it goes (the medallion's
 * ring), [onDone] when it has finished (or REPLAY_MAX_MS).
 */
export function ReplayLayer({
  pair,
  playW,
  artUrl,
  onProgress,
  onDone,
}: {
  pair: ReplayPair;
  /** The table's width: the layer covers the table, not the plates' column. */
  playW: number;
  artUrl: (art: string) => string;
  onProgress: (progress: number) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // First the board before the report (drawn as it was), then the report's own.
  const [stage, setStage] = useState<0 | 1>(0);
  const data = useMemo(
    () =>
      stage === 0 ? boardFromSnapshot(pair.prev, null) : boardFromSnapshot(pair.next, pair.prev),
    [stage, pair],
  );
  const shown = stage === 0 ? pair.prev : pair.next;
  const pileCards = useMemo(
    () => new Set([...shown.graveyard, ...shown.exile].map((card) => card.id)),
    [shown],
  );
  const piled = useMemo(() => piledOf(shown), [shown]);
  useEffect(() => {
    const timer = window.setTimeout(() => setStage(1), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const done = useRef(onDone);
  done.current = onDone;
  const progress = useRef(onProgress);
  progress.current = onProgress;
  // Every animation on the layer at half speed, each once, as they start.
  useLayoutEffect(() => {
    if (stage !== 1) return undefined;
    const root = ref.current;
    if (!root) return undefined;
    const slowed = new WeakSet<Animation>();
    const started = performance.now();
    let shown = 0;
    let quietSince: number | null = null;
    let timer = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      const { all, left } = running(root);
      for (const a of all) {
        if (slowed.has(a)) continue;
        slowed.add(a);
        a.updatePlaybackRate(a.playbackRate * REPLAY_RATE);
      }
      const elapsed = now - started;
      const leftNow = running(root).left;
      shown = Math.max(shown, Math.min(1, elapsed / Math.max(1, elapsed + leftNow)));
      progress.current(shown);
      if (left > 0) quietSince = null;
      else quietSince ??= now;
      if (
        (elapsed >= REPLAY_MIN_MS && quietSince !== null && now - quietSince >= 120) ||
        elapsed >= REPLAY_MAX_MS
      ) {
        stopped = true;
        progress.current(1);
        done.current();
        return;
      }
      timer = window.setTimeout(tick, 16);
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [stage]);
  const none = () => {};
  return (
    <div
      ref={ref}
      className="gs-replay"
      aria-hidden="true"
      data-replay={pair.key}
      data-replay-stage={stage}
      // The plates' column stays the live one: the layer covers the table only.
      style={{ clipPath: `inset(0 calc(100% - ${playW}px) 0 0)` }}
      {...{ inert: "" }}
    >
      <Board
        battlefield={data.battlefield}
        hand={data.hand}
        opponentHand={data.opponentHand}
        viewerSeat={shown.seat}
        artUrl={artUrl}
        arrivals={data.arrivals}
        departures={data.departures}
        merges={data.merges}
        returns={data.returns}
        tileMoves={data.tileMoves}
        countered={data.countered}
        leftBy={data.leftBy}
        fizzled={data.fizzled}
        survive={data.survive}
        moments={data.moments}
        combat={data.combat}
        stack={data.stack}
        copying={data.copying}
        sizeChanges={data.sizes}
        dayTime={shown.dayTime}
        fans={data.fans}
        pileCards={pileCards}
        piled={piled}
        turnNow={{ turn: shown.turn, activeSeat: shown.activeSeat, phase: shown.phase }}
        onPick={none}
        onInspect={none}
      />
    </div>
  );
}
