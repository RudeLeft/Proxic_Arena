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
//
// `&scenario=<name>` draws one of spec 0040's ten named boards instead
// (scenarios.ts: early, mid, landsheavy, wide, tokens, artifacts, combat,
// stress, horde, commander).
//
// `&script=combat` instead plays a fixed little game, step by step: an
// attack, blocks, first-strike and regular damage, a Bolt and a response
// on the stack, an Equip choice (§7 step 5's lines and effects).

import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Board } from "./Board";
import { applyChanges, combatScript, syntheticBoard } from "./fixture";
import { scenarioBoard, scenarioLabel } from "./scenarios";
import { avatarUrl } from "../avatars";

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
  const scenario = params.get("scenario") ?? "";
  const start = useMemo(
    () => scenarioBoard(scenario) ?? syntheticBoard(permanents, faces, seed),
    [scenario, permanents, faces, seed],
  );
  const script = params.get("script") === "combat";
  const scene = useMemo(() => (script ? combatScript(change) : null), [script, change]);
  const now = useMemo(
    () => scene ?? applyChanges(start, change, seed),
    [scene, start, change, seed],
  );

  // ?unsets=1 -- the Un-set markers (Phase 8 Amendment 1): every creature in
  // a sector, in turn, and a Contraption on sprocket 2 for each player.
  const unsets = params.get("unsets") === "1";
  const sectors = ["Alpha", "Beta", "Gamma"];
  const battlefield = unsets
    ? [
        ...now.board.battlefield.map((card, i) =>
          card.kind === "creature" ? { ...card, sector: sectors[i % 3]! } : card,
        ),
        ...[1, 2].map((seat) => ({
          ...now.board.battlefield.find(
            (card) => card.kind === "artifact" || card.kind === "creature",
          )!,
          id: `card:slingshot-${seat}`,
          seat,
          name: "Goblin Slingshot",
          kind: "artifact",
          types: "Artifact — Contraption",
          power: null,
          toughness: null,
          tapped: false,
          attacking: false,
          sprocket: 2,
          art: null,
        })),
      ]
    : now.board.battlefield;

  // `&combat=1` (spec 0059) -- the board's attackers attack the other player;
  // with `&pw=N` the last N of a side attack the defender's first planeswalker;
  // with `&blocked=N` (spec 0063) the defender's first N untapped creatures
  // block the first N attackers, one each.
  const atWalkers = number(params, "pw", 0, 200);
  const blocking = number(params, "blocked", 0, 200);
  const derived = useMemo(() => {
    if (params.get("combat") !== "1" || script) return null;
    const field = now.board.battlefield;
    const attackers = field.filter((c) => c.attacking);
    const blockers = field.filter(
      (c) =>
        c.kind === "creature" &&
        !c.attacking &&
        !c.tapped &&
        attackers.length > 0 &&
        c.seat !== attackers[0]!.seat,
    );
    return {
      blocks: blockers
        .slice(0, Math.min(blocking, attackers.length))
        .map((b, i) => ({ blocker: b.id, attacker: attackers[i]!.id })),
      attackers: attackers.map((c) => {
        const mine = attackers.filter((a) => a.seat === c.seat);
        const walker = field.find((w) => w.seat !== c.seat && /\bPlaneswalker\b/.test(w.types));
        const late = mine.indexOf(c) >= mine.length - atWalkers;
        return {
          id: c.id,
          target: walker && late ? { object: walker.id } : { player: c.seat === 1 ? 2 : 1 },
        };
      }),
    };
  }, [params, script, now, atWalkers, blocking]);
  const blockerIds = new Set((derived?.blocks ?? []).map((b) => b.blocker));
  const fielded = blockerIds.size
    ? battlefield.map((c) => (blockerIds.has(c.id) ? { ...c, blocking: true } : c))
    : battlefield;

  const next = () => {
    const after = new URLSearchParams(params);
    after.set("change", String(change + 1));
    setParams(after, { replace: true });
  };

  return (
    <div className="bf-page">
      <Board
        battlefield={fielded}
        hand={now.board.hand}
        viewerSeat={now.board.viewerSeat}
        artUrl={asIs}
        arrivals={now.arrivals}
        departures={now.departures}
        combat={scene?.combat ?? derived}
        // Spec 0028: a picture for each caster, as the game gives them.
        stack={(scene?.stack ?? []).map((s) => ({
          ...s,
          caster: avatarUrl(s.seat === 1 ? "avatar-01" : "avatar-46"),
        }))}
        pointedStack={scene?.pointedStack ?? null}
        // `&clock=1`: the response window's ring round the front card (spec 0028).
        clock={params.get("clock") ? `dev:${change}` : null}
        attaching={scene?.attaching ?? null}
        damage={scene?.damage ?? null}
      />
      <div className="bf-dev-note" role="note">
        <span>
          {script
            ? "Synthetic combat"
            : scenarioLabel(scenario)
              ? `Named board: ${scenarioLabel(scenario)}`
              : `Synthetic board: permanents ${permanents}, faces ${faces}, seed ${seed}`}
          , change {change}
          {change > 0 ? ` (${now.what})` : ""}. Not a game.
        </span>
        <button type="button" className="bf-dev-next" onClick={next}>
          Next change
        </button>
      </div>
    </div>
  );
}
