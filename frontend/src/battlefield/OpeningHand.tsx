// Phase 9 W-15 (owner 2026-11-03, option A) -- the start of the game:
// play or draw, keep or mulligan, the cards put back, and a Leyline begun
// in play, all with the opening hand laid out across the table, large
// enough to read. The game still asks one question at a time; the page
// answers the later ones from what was clicked here (GameScreen).

import { useState } from "react";
import type { Decision, Snapshot, SnapshotCard } from "../match";
import { headingFor } from "../matchText";

/** The questions this window answers. */
export const OPENING_KINDS = new Set([
  "chooseStartingPlayer",
  "mulliganKeepHand",
  "tuckCardsViaMulligan",
  "chooseSaToActivateFromOpeningHand",
]);

/** The option of [decision] about [card], by the game's own ids. */
export function optionFor(decision: Decision, card: SnapshotCard) {
  return decision.options.find(
    (o) =>
      o.objectId === card.id ||
      o.actionId === `tuck:${card.id}` ||
      o.actionId === `opening:${card.id}`,
  );
}

/** "(2 to go)" in the game's own words; 1 when it does not say. */
export function toGo(decision: Decision): number {
  const match = /\((\d+) to go\)/.exec(decision.prompt ?? "");
  return match ? Number(match[1]) : 1;
}

/** "once", "twice", "3 times". */
export function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

export function OpeningHand({
  decision,
  board,
  busy,
  artUrl,
  onAnswer,
  onPutBack,
  onBegin,
  area,
}: {
  /** The table's area (the play area, full height): the window covers it, not the column. */
  area: { x: number; w: number; h: number };
  decision: Decision;
  board: Snapshot;
  busy: boolean;
  artUrl: (art: string) => string;
  onAnswer: (actionId: string | null) => void;
  /** The cards to put back, in the order clicked: the first now, the rest as asked. */
  onPutBack: (cards: string[]) => void;
  /** The cards to begin in play, in the order ticked; then no more. */
  onBegin: (cards: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const hand = board.hand;
  const me = board.players.find((p) => p.seat === board.seat);
  const mulligans = me?.mulligans ?? 0;
  // How many times the other player mulliganed: public (owner 2026-11-03).
  const them = board.players.find((p) => p.seat !== board.seat);
  const theirs =
    them && (them.mulligans ?? 0) > 0 ? `${them.name} mulliganed ${times(them.mulligans!)}` : "";
  const lands = hand.filter((c) => c.kind === "land").length;
  const option = (key: string) => decision.options.find((o) => o.actionId === key);
  const kind = decision.kind;

  const toggle = (id: string, most: number) =>
    setPicked((now) =>
      now.includes(id) ? now.filter((p) => p !== id) : now.length < most ? [...now, id] : now,
    );

  let title = "";
  let line = "";
  let buttons: {
    key: string;
    word: string;
    sub?: string | undefined;
    quiet?: boolean;
    act: () => void;
  }[] = [];
  let pickable: (card: SnapshotCard) => boolean = () => false;
  let most = 0;
  let pickWord = "";

  if (kind === "chooseStartingPlayer") {
    title = "Play or draw";
    line = decision.prompt ?? "Play first, or draw first?";
    buttons = decision.options.map((o, i) => ({
      key: o.actionId,
      word: o.label ?? "",
      sub: /play/i.test(o.label ?? "")
        ? "You're a turn ahead"
        : /draw/i.test(o.label ?? "")
          ? "You're a card ahead"
          : undefined,
      quiet: i > 0,
      act: () => onAnswer(o.actionId),
    }));
  } else if (kind === "mulliganKeepHand") {
    title = "Your opening hand";
    line = [
      `${hand.length} card${hand.length === 1 ? "" : "s"}`,
      `${lands} land${lands === 1 ? "" : "s"}`,
      mulligans > 0 ? `mulliganed ${times(mulligans)}` : "",
      theirs,
    ]
      .filter(Boolean)
      .join(" · ");
    const keep = option("mulligan:keep");
    const again = option("mulligan:again");
    buttons = [
      ...(keep
        ? [{ key: keep.actionId, word: `Keep ${hand.length}`, act: () => onAnswer(keep.actionId) }]
        : []),
      ...(again
        ? [
            {
              key: again.actionId,
              word: "Mulligan",
              sub: `Draw seven again, put ${mulligans + 1} back`,
              quiet: true,
              act: () => onAnswer(again.actionId),
            },
          ]
        : []),
    ];
  } else if (kind === "tuckCardsViaMulligan") {
    most = toGo(decision);
    const left = most - picked.length;
    title = `Put ${most} card${most === 1 ? "" : "s"} back`;
    line =
      left > 0
        ? `Click the cards that go to the bottom of your library · ${left} to go`
        : `${most === 1 ? "This one goes" : "These go"} to the bottom of your library.`;
    pickable = (card) => !!optionFor(decision, card);
    pickWord = "Goes back";
    buttons =
      left > 0
        ? []
        : [
            {
              key: "put-back",
              word: `Keep these ${hand.length - most}`,
              sub: `${most === 1 ? "The one" : `The ${most}`} you picked go${most === 1 ? "es" : ""} to the bottom`,
              act: () => onPutBack(picked),
            },
          ];
  } else {
    // Leyline of the Void and the like: begin the game with it in play.
    most = hand.length;
    title = "Your opening hand";
    line = "Tick the cards to begin the game with in play. They aren't cast, and nothing is paid.";
    pickable = (card) => !!optionFor(decision, card);
    pickWord = "✓ Starts in play";
    buttons = [
      {
        key: "begin",
        word: picked.length > 0 ? `Begin with ${picked.length} in play` : "Begin with none in play",
        act: () => onBegin(picked),
      },
    ];
  }

  return (
    <div
      className="gs-opening"
      data-kind={kind}
      role="dialog"
      aria-modal="false"
      aria-labelledby="gs-opening-title"
      style={{ left: area.x, width: area.w, height: area.h }}
    >
      <div className="gs-opening-head">
        {/* The game's own name for the question, for a screen reader (and
            the tests that read it); the words over the hand are the page's. */}
        <h2 className="pa-visually-hidden gs-question-title">{headingFor(kind)}</h2>
        <p id="gs-opening-title" className="gs-opening-title">
          {title}
        </p>
        <p className="gs-opening-line">{line}</p>
      </div>
      {kind !== "chooseStartingPlayer" && (
        <ul className="gs-opening-hand">
          {hand.map((card) => {
            const can = pickable(card);
            const on = picked.includes(card.id);
            return (
              <li key={card.id}>
                <button
                  type="button"
                  className={`gs-opening-card${on ? " gs-opening-on" : ""}${kind === "tuckCardsViaMulligan" && on ? " gs-opening-back" : ""}`}
                  disabled={!can || busy}
                  aria-pressed={can ? on : undefined}
                  aria-label={`${card.name}${on ? `, ${pickWord}` : ""}`}
                  onClick={() => toggle(card.id, most)}
                >
                  {card.art ? (
                    <img src={artUrl(card.art)} alt="" draggable={false} />
                  ) : (
                    <span className="gs-opening-plain">
                      <b>{card.name}</b>
                      <span>{card.types}</span>
                    </span>
                  )}
                  {on && <span className="gs-opening-tag">{pickWord}</span>}
                  {!on && can && kind === "chooseSaToActivateFromOpeningHand" && (
                    <span className="gs-opening-tag gs-opening-tag-quiet">Start in play?</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="gs-opening-buttons">
        {buttons.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`gs-opening-button${b.quiet ? " gs-opening-quiet" : ""}`}
            disabled={busy}
            onClick={b.act}
          >
            {b.word}
            {b.sub && <small>{b.sub}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}
