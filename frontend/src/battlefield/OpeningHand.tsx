// Phase 9 W-15 (owner 2026-11-03, option A) -- the start of the game:
// play or draw, keep or mulligan, the cards put back, and a Leyline begun
// in play, all with the opening hand laid out across the table, large
// enough to read. The game still asks one question at a time; the page
// answers the later ones from what was clicked here (GameScreen).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import cardBack from "../assets/card-back.webp";
import type { Decision, Snapshot, SnapshotCard } from "../match";
import { headingFor } from "../matchText";
import { capital, capitalNumber, countWords, numberWord, timesWord } from "../words";
import { PeekButton, usePeek, WindowFactLines } from "./GameWindow";
import {
  DEAL_FROM,
  DEAL_MS,
  KEEP_FADE_MS,
  KEEP_MS,
  PUT_BACK_MS,
  SWEEP_MS,
  TURN_DOWN_BEAT_MS,
  TURN_DOWN_MS,
  dealAt,
  dealFrames,
  sweepAt,
  turnDownFrames,
} from "./opening";
import { reducedMotion, useHurry } from "./playerMarks";
import { paced } from "./motion";

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

/** "once", "twice", "three times" (spec 0113, W1-086: `timesWord`). */
export function times(n: number): string {
  return timesWord(n);
}

/** Spec 0089 (Q2 A) -- what the viewer's own hand did this update, before the first turn. */
export function ownOpening(board: Snapshot): {
  out: number;
  where: string | null;
  dealt: string[];
} | null {
  if (board.turn !== 0) return null;
  let out = 0;
  let where: string | null = null;
  const dealt: string[] = [];
  for (const m of board.moves ?? []) {
    if (m.from.seat !== board.seat || m.to.seat !== board.seat) continue;
    if (m.from.zone === "hand" && m.to.zone === "library") {
      out += 1;
      where = m.where ?? where;
    } else if (m.from.zone === "library" && m.to.zone === "hand" && m.card) dealt.push(m.card);
  }
  return out > 0 || dealt.length > 0 ? { out, where, dealt } : null;
}

/** A card of the window drawn on its way out (swept back, put back): where it stood, how it goes. */
interface Leaving {
  key: string;
  card: SnapshotCard;
  left: number;
  top: number;
  w: number;
  h: number;
  card0: Keyframe[];
  back0: Keyframe[];
  duration: number;
  delay: number;
  /** It was picked to go back: dropped and greyed, as the window drew it. */
  dropped: boolean;
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
  waiting = false,
  closing = false,
  delay = 0,
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
  /**
   * Spec 0089 (Q2 A) -- the question was answered and the next one is still to
   * come (a mulligan's new seven, the cards to put back): the window stays,
   * playing the deal, with nothing to press.
   */
  waiting?: boolean;
  /** Spec 0089 (Q2 A) -- kept: the hand glides down into place as the window fades. */
  closing?: boolean;
  /** Spec 0089 (Q2 A) -- the deal waits this long (the loading screen still up). */
  delay?: number;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  // One window for the whole opening (spec 0089): each question starts unpicked.
  const askedFor = useRef(decision.decisionId);
  if (askedFor.current !== decision.decisionId) {
    askedFor.current = decision.decisionId;
    if (picked.length > 0) setPicked([]);
  }
  const winRef = useRef<HTMLDivElement>(null);
  const leaving = useOpeningMotion(winRef, board, closing, delay);
  useHurry(winRef, true);
  // Amendment 18 -- Space or Peek fades this window too.
  const peek = usePeek(true);
  const hand = board.hand;
  const me = board.players.find((p) => p.seat === board.seat);
  const mulligans = me?.mulligans ?? 0;
  // How many times the other player mulliganed: public (owner 2026-11-03).
  const them = board.players.find((p) => p.seat !== board.seat);
  const theirs =
    them && (them.mulligans ?? 0) > 0 ? `${them.name} mulliganed ${times(them.mulligans!)}.` : "";
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
    // Spec 0113 (W1-087): "Seven cards, three lands", then the other player's line.
    line = [
      capital(
        [
          countWords(hand.length, "card"),
          countWords(lands, "land"),
          mulligans > 0 ? `mulliganed ${times(mulligans)}` : "",
        ]
          .filter(Boolean)
          .join(", "),
      ),
      theirs,
    ]
      .filter(Boolean)
      .join(". ");
    const keep = option("mulligan:keep");
    const again = option("mulligan:again");
    buttons = [
      ...(keep
        ? [
            {
              key: keep.actionId,
              word: `Keep these ${numberWord(hand.length)}`,
              act: () => onAnswer(keep.actionId),
            },
          ]
        : []),
      ...(again
        ? [
            {
              key: again.actionId,
              word: "Mulligan",
              sub: `Draw seven again and put ${numberWord(mulligans + 1)} back`,
              quiet: true,
              act: () => onAnswer(again.actionId),
            },
          ]
        : []),
    ];
  } else if (kind === "tuckCardsViaMulligan") {
    most = toGo(decision);
    const left = most - picked.length;
    title = `Put ${countWords(most, "card")} back`;
    line =
      left > 0
        ? `Click the cards that go to the bottom of your library. ${capitalNumber(left)} more to go.`
        : `${most === 1 ? "This one goes" : "These go"} to the bottom of your library.`;
    pickable = (card) => !!optionFor(decision, card);
    pickWord = "Goes back";
    buttons =
      left > 0
        ? []
        : [
            {
              key: "put-back",
              word: `Keep these ${numberWord(hand.length - most)}`,
              sub: `${most === 1 ? "The one" : `The ${numberWord(most)}`} you picked go${most === 1 ? "es" : ""} to the bottom`,
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
        word:
          picked.length > 0
            ? `Begin with ${numberWord(picked.length)} in play`
            : "Begin with none in play",
        act: () => onBegin(picked),
      },
    ];
  }

  if (waiting || closing) buttons = [];
  return (
    <div
      ref={winRef}
      className={`gs-opening${peek ? " gs-win-peek" : ""}${closing ? " gs-opening-closing" : ""}`}
      data-kind={kind}
      data-waiting={waiting ? "true" : undefined}
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
        <WindowFactLines />
      </div>
      {kind !== "chooseStartingPlayer" && (
        <ul className="gs-opening-hand">
          {hand.map((card) => {
            const can = pickable(card);
            const on = picked.includes(card.id);
            return (
              <li key={card.id} data-card-id={card.id}>
                <button
                  type="button"
                  className={`gs-opening-card${on ? " gs-opening-on" : ""}${kind === "tuckCardsViaMulligan" && on ? " gs-opening-back" : ""}`}
                  data-object-id={card.id}
                  data-zone="opening"
                  disabled={!can || busy || waiting || closing}
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
                  {/* Spec 0089 (Q2 A) -- its back, laid over it while it is face down on its way. */}
                  <img className="gs-opening-cardback" src={cardBack} alt="" draggable={false} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* Spec 0089 (Q2 A) -- the cards on their way out: swept back, put back. */}
      {leaving.map((g) => (
        <OpeningGhost key={g.key} ghost={g} artUrl={artUrl} />
      ))}
      <div className="gs-opening-buttons">
        <span className="gs-win-peek-hint gs-opening-peek">
          <PeekButton />
          <span className="gs-peek-or">or hold Space</span>
        </span>
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

/** Where an element stands, relative to the window. */
function within(el: Element, win: DOMRect): { x: number; y: number; w: number; h: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left - win.left, y: r.top - win.top, w: r.width, h: r.height };
}

/**
 * Spec 0089 (Q2 A) -- the window's cards, dealt from the Library tile, swept
 * back into it by a mulligan and dealt again, one put back to the bottom,
 * and -- kept -- gliding down into the hand. Once per update, from the
 * game's own moves (ownOpening); a window that opens on a hand already dealt
 * (the other player decided first) lifts its cards out of the hand instead.
 * Every movement is a Web Animation on the window (a click hurries it); with
 * reduce motion nothing moves.
 */
function useOpeningMotion(
  winRef: { current: HTMLDivElement | null },
  board: Snapshot,
  closing: boolean,
  wait: number,
): Leaving[] {
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  /** The cards the window showed last, where each stood. */
  const shown = useRef(new Map<string, { card: SnapshotCard; at: ReturnType<typeof within> }>());
  const played = useRef<number | null>(null);
  useLayoutEffect(() => {
    const win = winRef.current;
    if (!win) return;
    const wr = win.getBoundingClientRect();
    const slots = new Map<string, HTMLElement>();
    for (const li of win.querySelectorAll<HTMLElement>(".gs-opening-hand > li[data-card-id]"))
      slots.set(li.dataset["cardId"] ?? "", li);
    const capture = () => {
      const now = new Map<string, { card: SnapshotCard; at: ReturnType<typeof within> }>();
      for (const card of board.hand) {
        const li = slots.get(card.id);
        if (li) now.set(card.id, { card, at: within(li, wr) });
      }
      shown.current = now;
    };
    if (played.current === board.stateRevision) return;
    const first = played.current === null;
    played.current = board.stateRevision;
    const before = shown.current;
    if (reducedMotion() || closing || board.turn !== 0 || typeof win.animate !== "function") {
      capture();
      return;
    }
    const tileEl = document.querySelector('[data-zone-tile="viewer:library"]');
    const tile = tileEl ? within(tileEl, wr) : null;
    const tileC = tile ? { x: tile.x + tile.w / 2, y: tile.y + tile.h / 2 } : null;
    const o = ownOpening(board);
    const cardOf = (li: HTMLElement) => li.querySelector<HTMLElement>(".gs-opening-card");
    const backOf = (li: HTMLElement) => li.querySelector<HTMLElement>(".gs-opening-cardback");
    const run = (el: HTMLElement | null, frames: Keyframe[], delay: number, duration: number) =>
      el?.animate(frames, { duration, delay, easing: "linear", fill: "backwards" });
    /** The size a card has on the tile, as a share of its size in the window. */
    const small = (at: { h: number }) => (tile ? Math.min(1, (tile.h / at.h) * 1.2) : DEAL_FROM);
    /** Deal each of [ids] from the tile into its place. */
    const deal = (ids: readonly string[], afterSweep: boolean) => {
      if (!tileC) return;
      ids.forEach((id, i) => {
        const li = slots.get(id);
        if (!li) return;
        const at = within(li, wr);
        const f = dealFrames(tileC.x - (at.x + at.w / 2), tileC.y - (at.y + at.h / 2), small(at));
        run(cardOf(li), f.card, wait + dealAt(i, afterSweep), DEAL_MS);
        run(backOf(li), f.back, wait + dealAt(i, afterSweep), DEAL_MS);
      });
    };
    const added: Leaving[] = [];
    const inHand = board.hand.map((c) => c.id);
    if (o && o.out > 0 && o.where === "shuffled") {
      // A mulligan: the seven shown turn face down and sweep back; then the new seven.
      [...before.values()].forEach(({ card, at }, i) => {
        if (!tileC) return;
        const down = turnDownFrames();
        const back = dealFrames(
          tileC.x - (at.x + at.w / 2),
          tileC.y - (at.y + at.h / 2),
          small(at),
          true,
          false,
        );
        // One animation each: turned down in place, then off to the tile.
        const total = sweepAt(i) + SWEEP_MS;
        const share = (ms: number) => Math.min(1, ms / total);
        const downAt = i * TURN_DOWN_BEAT_MS;
        const card0: Keyframe[] = [
          { offset: 0, transform: "scale(1, 1)", opacity: 1 },
          ...down.card.map((f) => ({
            ...f,
            offset: share(downAt + Number(f.offset) * TURN_DOWN_MS),
            opacity: 1,
          })),
          ...back.card.slice(1).map((f) => ({
            ...f,
            offset: share(sweepAt(i) + Number(f.offset) * SWEEP_MS),
            opacity: Number(f.offset) > 0.78 ? 1 - (Number(f.offset) - 0.78) / 0.22 : 1,
          })),
        ];
        const back0: Keyframe[] = [
          { offset: 0, opacity: 0 },
          ...down.back.map((f) => ({
            ...f,
            offset: share(downAt + Number(f.offset) * TURN_DOWN_MS),
          })),
          { offset: 1, opacity: 1 },
        ];
        added.push({
          key: `swept:${board.stateRevision}:${card.id}:${i}`,
          card,
          left: at.x,
          top: at.y,
          w: at.w,
          h: at.h,
          card0,
          back0,
          duration: total,
          delay: wait,
          dropped: false,
        });
      });
      deal(inHand, true);
    } else if (o && o.out > 0) {
      // Put back: each picked card glides to the bottom of the library,
      // turning face down; the rest close up.
      let n = 0;
      for (const [id, { card, at: slot }] of before) {
        if (inHand.includes(id) || !tileC) continue;
        // As the window drew it, picked: dropped 36 px and at 0.94 (game.css .gs-opening-back).
        const at = {
          x: slot.x + slot.w * 0.03,
          y: slot.y + 36 + slot.h * 0.03,
          w: slot.w * 0.94,
          h: slot.h * 0.94,
        };
        const f = dealFrames(
          tileC.x - (at.x + at.w / 2),
          tileC.y + tile!.h * 0.35 - (at.y + at.h / 2),
          small(at),
          true,
        );
        added.push({
          key: `back:${board.stateRevision}:${id}`,
          card,
          left: at.x,
          top: at.y,
          w: at.w,
          h: at.h,
          card0: f.card.map((x) => ({
            ...x,
            opacity: Number(x.offset) > 0.85 ? 1 - (Number(x.offset) - 0.85) / 0.15 : 1,
          })),
          back0: f.back,
          duration: PUT_BACK_MS,
          delay: wait + n++ * 60,
          dropped: true,
        });
      }
      for (const id of inHand) {
        const was = before.get(id)?.at;
        const li = slots.get(id);
        if (!was || !li) continue;
        const now = within(li, wr);
        const dx = was.x - now.x;
        const dy = was.y - now.y;
        if (Math.abs(dx) + Math.abs(dy) < 1) continue;
        run(
          cardOf(li),
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
          0,
          SWEEP_MS,
        );
      }
    } else if (o && o.dealt.length > 0) {
      deal(inHand, false);
    } else if (first) {
      // The window opens on a hand dealt a while ago (the other player
      // chose first): each card lifts out of the hand into its place.
      board.hand.forEach((card, i) => {
        const li = slots.get(card.id);
        if (!li) return;
        const fan = document.querySelector(
          `[data-zone="viewer:hand"][data-object-id="${card.id}"]`,
        );
        if (!fan) {
          deal([card.id], false);
          return;
        }
        const at = within(li, wr);
        const from = within(fan, wr);
        const f = dealFrames(
          from.x + from.w / 2 - (at.x + at.w / 2),
          from.y + from.h / 2 - (at.y + at.h / 2),
          from.h / at.h,
          false,
          false,
        );
        run(cardOf(li), f.card, wait + i * 40, DEAL_MS);
      });
    }
    capture();
    if (added.length > 0) setLeaving((list) => [...list, ...added]);
  }, [winRef, board, closing, wait]);
  // Kept: the hand glides down into place, the window fading round it.
  useLayoutEffect(() => {
    const win = winRef.current;
    if (!closing || !win || reducedMotion() || typeof win.animate !== "function") return;
    const wr = win.getBoundingClientRect();
    win.animate([{ backgroundColor: "rgb(4 6 8 / 66%)" }, { backgroundColor: "rgb(4 6 8 / 0%)" }], {
      duration: KEEP_FADE_MS,
      easing: "ease-out",
      fill: "forwards",
    });
    for (const part of win.querySelectorAll<HTMLElement>(".gs-opening-head, .gs-opening-buttons"))
      part.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: KEEP_FADE_MS,
        easing: "ease-out",
        fill: "forwards",
      });
    let i = 0;
    for (const li of win.querySelectorAll<HTMLElement>(".gs-opening-hand > li[data-card-id]")) {
      const id = li.dataset["cardId"] ?? "";
      const fan = document.querySelector<HTMLElement>(
        `[data-zone="viewer:hand"][data-object-id="${id}"]`,
      );
      const card = li.querySelector<HTMLElement>(".gs-opening-card");
      if (!fan || !card) continue;
      const at = within(li, wr);
      const to = within(fan, wr);
      // The hand card's own size and tilt (its fan's rotation), not its box.
      const holder = fan.parentElement ?? fan;
      const m =
        typeof DOMMatrixReadOnly === "function"
          ? new DOMMatrixReadOnly(getComputedStyle(holder).transform)
          : null;
      const turn = m ? (Math.atan2(m.b, m.a) * 180) / Math.PI : 0;
      const s = ((fan.offsetHeight || to.h) * (m ? Math.hypot(m.a, m.b) : 1)) / at.h;
      card.animate(
        [
          { transform: "none" },
          {
            transform: `translate(${to.x + to.w / 2 - (at.x + at.w / 2)}px, ${to.y + to.h / 2 - (at.y + at.h / 2)}px) rotate(${turn}deg) scale(${s})`,
          },
        ],
        {
          duration: KEEP_MS - paced(40),
          delay: 40 + i++ * 10,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "forwards",
        },
      );
    }
  }, [closing, winRef]);
  // A ghost is gone once its movement has ended (or long after, hurried or not).
  useEffect(() => {
    if (leaving.length === 0) return undefined;
    const longest = Math.max(...leaving.map((g) => g.delay + g.duration));
    const timer = window.setTimeout(() => setLeaving([]), longest + 4000);
    return () => window.clearTimeout(timer);
  }, [leaving]);
  return leaving;
}

/** Spec 0089 (Q2 A) -- one card of the window on its way out, as the window drew it. */
function OpeningGhost({ ghost, artUrl }: { ghost: Leaving; artUrl: (art: string) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLImageElement>(null);
  const [done, setDone] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") {
      setDone(true);
      return;
    }
    const a = el.animate(ghost.card0, {
      duration: ghost.duration,
      delay: ghost.delay,
      easing: "linear",
      fill: "both",
    });
    back.current?.animate(ghost.back0, {
      duration: ghost.duration,
      delay: ghost.delay,
      easing: "linear",
      fill: "both",
    });
    a.onfinish = () => setDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (done) return null;
  const card = ghost.card;
  return (
    <div
      ref={ref}
      className={`gs-opening-card gs-opening-leaving${ghost.dropped ? " gs-opening-dropped" : ""}`}
      data-ghost-of={card.id}
      style={{ left: ghost.left, top: ghost.top, width: ghost.w, height: ghost.h }}
      aria-hidden="true"
    >
      {card.art ? (
        <img src={artUrl(card.art)} alt="" draggable={false} />
      ) : (
        <span className="gs-opening-plain">
          <b>{card.name}</b>
          <span>{card.types}</span>
        </span>
      )}
      <img ref={back} className="gs-opening-cardback" src={cardBack} alt="" draggable={false} />
    </div>
  );
}
