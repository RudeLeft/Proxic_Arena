// /dev/board — a synthetic battlefield (BATTLEFIELD_RENDERING.md §6:
// "a dev route that generates a synthetic board: ?permanents=N&faces=M&
// seed=S. The route is also how an agent inspects the board
// reproducibly.").
//
// Not a game and not linked from anywhere: it draws a seeded board so the
// renderer can be looked at, measured and tested without a match. It says
// so on screen, because a page that looks like a game and is not one is
// exactly what §1.105 warns against.

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Board } from "./Board";
import { syntheticBoard } from "./fixture";

function number(params: URLSearchParams, key: string, fallback: number, max: number): number {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value >= 0 ? Math.min(Math.floor(value), max) : fallback;
}

export default function DevBoardPage() {
  const [params] = useSearchParams();
  const permanents = number(params, "permanents", 40, 200);
  const faces = number(params, "faces", 30, 60);
  const seed = number(params, "seed", 1, 1_000_000);
  const board = useMemo(() => syntheticBoard(permanents, faces, seed), [permanents, faces, seed]);

  return (
    <div className="bf-page">
      <Board
        battlefield={board.battlefield}
        hand={board.hand}
        viewerSeat={board.viewerSeat}
        artUrl={(art) => art}
      />
      <p className="bf-dev-note" role="note">
        Synthetic board — permanents {permanents}, faces {faces}, seed {seed}. Not a game.
      </p>
    </div>
  );
}
