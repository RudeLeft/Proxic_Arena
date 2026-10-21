// /dev/board — a synthetic battlefield (BATTLEFIELD_RENDERING.md §6:
// "a dev route that generates a synthetic board: ?permanents=N&faces=M&
// seed=S. The route is also how an agent inspects the board
// reproducibly.").
//
// Not a game and not linked from anywhere: it draws a seeded board so the
// renderer can be looked at, measured and tested without a match. It says
// so on screen, because a page that looks like a game and is not one is
// exactly what §1.105 warns against.
//
// `&change=N` applies N seeded changes (a land taps, a creature dies, a
// spell resolves...), and "Next change" applies one more, so movement can
// be watched -- and tested -- step by step (§7 step 4).

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Board } from "./Board";
import { applyChanges, syntheticBoard } from "./fixture";

function number(params: URLSearchParams, key: string, fallback: number, max: number): number {
  const raw = params.get(key);
  const value = raw === null ? NaN : Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback;
}

/** The synthetic board's pictures are data URIs already. */
const asIs = (art: string) => art;

export default function DevBoardPage() {
  const [params, setParams] = useSearchParams();
  const permanents = number(params, "permanents", 40, 200);
  const faces = number(params, "faces", 30, 60);
  const seed = number(params, "seed", 1, 1_000_000);
  const change = number(params, "change", 0, 10_000);
  const start = useMemo(() => syntheticBoard(permanents, faces, seed), [permanents, faces, seed]);
  const now = useMemo(() => applyChanges(start, change, seed), [start, change, seed]);

  const next = () => {
    const after = new URLSearchParams(params);
    after.set("change", String(change + 1));
    setParams(after, { replace: true });
  };

  return (
    <div className="bf-page">
      <Board
        battlefield={now.board.battlefield}
        hand={now.board.hand}
        viewerSeat={now.board.viewerSeat}
        artUrl={asIs}
        arrivals={now.arrivals}
        departures={now.departures}
      />
      <div className="bf-dev-note" role="note">
        <span>
          Synthetic board — permanents {permanents}, faces {faces}, seed {seed}, change {change}
          {change > 0 ? ` (${now.what})` : ""}. Not a game.
        </span>
        <button type="button" className="bf-dev-next" onClick={next}>
          Next change
        </button>
      </div>
    </div>
  );
}
