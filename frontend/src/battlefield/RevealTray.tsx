// Spec 0045 (owner 2026-10-31, report 3) -- the cards a player was shown.
//
// Goblin Ringleader reveals the top four: today that was a line of text
// that faded ("Looking at your library: …"). Now the cards themselves,
// face up, in a tray along the bottom -- "Goblin Ringleader revealed:" --
// each marked where it went once the effect has finished ("→ hand",
// "→ bottom"). It stays until closed, or until the next turn (the worker
// stops sending it then). Only what Forge revealed, to whom it revealed
// it: the worker fills this from the reveal Forge makes to each player.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ReportMark, SnapshotCard, SnapshotReveal } from "../match";
import { FOLD_MS, GATHERED_W, layoutOf, reportsOf } from "./reports";
import { lightOff, lightOn } from "./reportLight";
import type { Geometry } from "./layout";
import { BigCard } from "./QuestionWindows";
import { ManaText, symbolUrl } from "./ManaCost";
import { PeekFoot, usePeek } from "./GameWindow";
import { DungeonPicture } from "./playerMarks";

/** Where a revealed card went, as the tray says it. */
export function wentWords(to: string | null | undefined): string | null {
  switch (to) {
    case "hand":
      return "→ hand";
    case "bottom":
      return "→ bottom of library";
    case "top":
      return "→ top of library";
    case "library":
      return "→ library";
    // Spec 0075 -- bounced into a library that was then shuffled (Chaos Warp).
    case "shuffled":
      return "→ shuffled into library";
    case "graveyard":
      return "→ graveyard";
    case "battlefield":
      return "→ battlefield";
    case "exile":
      return "→ exile";
    case "stack":
      return "→ stack";
    // Spec 0124 -- an ante card taken out of the deck before the game.
    case "out":
      return "→ out of the game";
    default:
      return null;
  }
}

/**
 * Spec 0071, item 1 -- how far above the resting hand's top a report's
 * bottom edge stays: clear of the cards, so the hand (and the eye on a card
 * just seen) is never under it.
 */
export const REPORT_HAND_GAP = 10;

/**
 * Spec 0071, item 1 -- the report's distance from the board's bottom: its
 * bottom edge above the top of your resting hand (layout's handTop, the
 * highest point of the fan), at every board size.
 */
export function reportBottom(geometry: Geometry): number {
  return geometry.height - geometry.handTop + REPORT_HAND_GAP;
}

const COLOUR_WORDS = {
  white: ["W", "White"],
  blue: ["U", "Blue"],
  black: ["B", "Black"],
  red: ["R", "Red"],
  green: ["G", "Green"],
} as const;

/**
 * Spec 0075 -- a picture that is not a card, the size of the cards beside
 * it: the colour chosen (its mana symbol), a coin flipped (won: bright gold
 * with a tick; lost: dull bronze with a cross).
 */
export function ReportMarkPicture({ mark }: { mark: ReportMark }) {
  // Spec 0086 (8) -- a dungeon completed: its map.
  if (mark.kind === "dungeon") {
    return (
      <span
        className="gs-reveal-mark gs-reveal-mark-dungeon"
        role="img"
        aria-label={`${mark.dungeon}, completed`}
      >
        <DungeonPicture />
      </span>
    );
  }
  if (mark.kind === "color") {
    const [symbol, word] = COLOUR_WORDS[mark.color];
    const url = symbolUrl(symbol);
    return (
      <span
        className={`gs-reveal-mark gs-reveal-mark-color gs-reveal-mark-${mark.color}`}
        role="img"
        aria-label={`${word}, the color chosen`}
      >
        {url ? <img src={url} alt="" draggable={false} /> : <b>{symbol}</b>}
      </span>
    );
  }
  const won = mark.won;
  return (
    <span
      className={`gs-reveal-mark gs-reveal-mark-coin${won ? " gs-reveal-mark-won" : " gs-reveal-mark-lost"}`}
      role="img"
      aria-label={won ? "A coin flip, won" : "A coin flip, lost"}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <radialGradient id={won ? "gs-coin-won" : "gs-coin-lost"} cx="38%" cy="32%" r="75%">
            <stop offset="0" stopColor={won ? "#fff2b8" : "#d9b99a"} />
            <stop offset="0.55" stopColor={won ? "#e2b04a" : "#9c7656"} />
            <stop offset="1" stopColor={won ? "#9a6a18" : "#5b4232"} />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="46" fill={`url(#${won ? "gs-coin-won" : "gs-coin-lost"})`} />
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke={won ? "#7a5210" : "#3f2e22"}
          strokeWidth="3"
        />
        <circle
          cx="50"
          cy="50"
          r="37"
          fill="none"
          stroke={won ? "#fbe3a0" : "#c4a385"}
          strokeWidth="2"
          strokeDasharray="3 4"
          opacity="0.8"
        />
        {won ? (
          <path
            d="M31 52 L45 66 L71 37"
            fill="none"
            stroke="#5a3a08"
            strokeWidth="9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M35 35 L65 65 M65 35 L35 65"
            fill="none"
            stroke="#2e2119"
            strokeWidth="9"
            strokeLinecap="round"
          />
        )}
      </svg>
    </span>
  );
}

/**
 * Spec 0124 (owner Q3 "Report window") -- the game's own medallion, for a
 * report no player made (the ante cards taken out): the game's shield, gold
 * on the medallion's ground, the canvas's ("a4-a5", Option A).
 */
export function GameMedallion({ size = 44 }: { size?: number }) {
  return (
    <span
      className="gs-reveal-face gs-reveal-game"
      data-medallion="game"
      aria-hidden="true"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.53} height={size * 0.53}>
        <path
          d="M12 3l7 3v6c0 4-3 7-7 9c-4-2-7-5-7-9V6z"
          fill="none"
          stroke="#d9b26a"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}

/**
 * Who a report is by, as its line says it: "Bob, with Demonic Tutor"; the
 * game's own (spec 0124): "Your deck · Contract from Below", under its shield.
 */
export function reportWho(
  report: SnapshotReveal,
  who: { name: string; face: ReactNode } | null,
  size = 44,
): { line: string; face: ReactNode } {
  if (report.byWords)
    return {
      line: `${report.byWords} · ${report.source ?? ""}`,
      face: <GameMedallion size={size} />,
    };
  return { line: `${who?.name ?? "A player"}, with ${report.source ?? ""}`, face: who?.face };
}

/** Spec 0075 -- the words under a picture that is not a card. */
function markWords(mark: ReportMark): [string, string] {
  if (mark.kind === "color") return [COLOUR_WORDS[mark.color][1], "Chosen"];
  if (mark.kind === "dungeon") return [mark.dungeon, "Completed"];
  return ["Coin flip", mark.won ? "Won" : "Lost"];
}

/**
 * Spec 0088 (Q3 C) -- an older report folded into one line at the top of the
 * window: its player's medallion, "WHO, with CARD", the sentence, a small picture
 * of its first card. A click opens it in full.
 */
function ReportRow({
  report,
  who,
  artUrl,
  onOpen,
  n,
}: {
  report: SnapshotReveal;
  who: { name: string; face: ReactNode } | null;
  artUrl: (art: string) => string;
  onOpen: () => void;
  /** Spec 0103, item 2 -- its place in the window, 1 the oldest (the stack's order badge). */
  n: number;
}) {
  const first = report.cards[0];
  const pic = first && !(first.faceDown && !first.known) ? (first.crop ?? first.art) : null;
  const by = reportWho(report, who, 32);
  return (
    // Not a list item: the scripted games read a question's choices as
    // list items' buttons, and a row is no choice. Spec 0109, item 13: a
    // row no longer lights the table; a click opens it.
    <div className="gs-report-row" data-report={report.key}>
      <button
        type="button"
        className="gs-report-row-open"
        onClick={onOpen}
        aria-label={`Open: ${by.line}. ${report.said ?? ""}`}
      >
        <b className="gs-report-n" aria-hidden="true">
          {n}
        </b>
        <span className="gs-report-row-face" aria-hidden="true">
          {by.face}
        </span>
        <span className="gs-report-row-words">
          <span className="gs-reveal-by">{by.line}</span>
          <span className="gs-report-row-said">{report.said}</span>
        </span>
        {first && (
          <span
            className={`gs-report-row-pic${pic ? "" : " gs-report-row-back"}`}
            aria-hidden="true"
            style={pic ? { backgroundImage: `url(${artUrl(pic)})` } : undefined}
          />
        )}
      </button>
    </div>
  );
}

/**
 * Spec 0103, item 3 (Q3 A) -- a report's replay: which report it is for, and
 * whether it is offered now (only while the table is unchanged since it,
 * Decided 5) or playing.
 */
export interface ReportReplay {
  key: string;
  offered: boolean;
  playing: boolean;
  onReplay: () => void;
}

/** The medallion's ring (the canvas's: r 26 in a 56 box). */
export const REPLAY_RING_C = 2 * Math.PI * 26;

export function RevealTray({
  reveal,
  geometry,
  atTop,
  artUrl,
  onClose,
  who,
  whoOf,
  drainMs = null,
  replay = null,
  viewerSeat = 0,
}: {
  /** Spec 0103, items 1-2 -- whose side "viewer" is (which pile tile a card went to). */
  viewerSeat?: number;
  /** Spec 0103, item 3 -- the newest report's replay, or null. */
  replay?: ReportReplay | null;
  /**
   * Spec 0102, item 1 (round 2 Q6 B) -- the window holds the table (Karn's
   * restart) this long at most: a thin bar along its foot drains over it.
   */
  drainMs?: number | null;
  /** Phase 9 Amendment 12 -- a report's acting player: their picture and name. */
  who?: { name: string; face: ReactNode } | null;
  /** Spec 0088 (Q3 C) -- any report's acting player, by seat (the rows' smaller medallions). */
  whoOf?: (seat: number | null, size?: number) => { name: string; face: ReactNode } | null;
  reveal: SnapshotReveal;
  geometry: Geometry;
  /** A question's window holds the bottom: the tray waits at the top. */
  atTop: boolean;
  artUrl: (art: string) => string;
  onClose: () => void;
}) {
  // Amendment 18 -- Space or Peek fades this window too.
  const peek = usePeek(true);
  // Spec 0088 (Q3 C) -- the older reports gathered with this one fold into
  // rows at the top; the newest shows in full, unless a row was opened.
  // A newer report coming in shows in full again.
  const [opened, setOpened] = useState<{ at: string; key: string | null }>({ at: "", key: null });
  const { full, rows } = layoutOf(reveal, opened.at === reveal.key ? opened.key : null);
  // Spec 0103, items 1-2, as spec 0109 item 13 (owner 2026-11-20, canvas
  // "13" option A) left it -- the window points at the table only on a
  // click: a click on a picture dims the table to that card (where it lies
  // now); a second click on it, a click on the table outside any window, or
  // closing the window brings the table back; a click on another picture
  // moves the dim. Pointing does nothing, and the read-through is gone
  // (owner 2026-11-20, "Remove it"): nothing else lights the table.
  const trayRef = useRef<HTMLDivElement>(null);
  // The game screen, kept: a window going is unmounted after its ref is gone.
  const screenEl = useRef<HTMLElement | null>(null);
  const screenOf = () => {
    screenEl.current = trayRef.current?.closest<HTMLElement>(".gs-screen") ?? screenEl.current;
    return screenEl.current;
  };
  const all = reportsOf(reveal);
  const order = new Map(all.map((r, i) => [r.key, i + 1]));
  /** The picture clicked: its report and its card, while the table is dimmed to it. */
  const [lit, setLit] = useState<{ report: string; card: string } | null>(null);
  const point = (key: string, card: SnapshotCard | null) => {
    // Dimmed only when something could be kept bright (lightOn's count).
    if (card && lightOn(screenOf(), [card], viewerSeat) > 0) {
      setLit({ report: key, card: card.id });
    } else {
      lightOff(screenOf());
      setLit(null);
    }
  };
  const pick = (key: string, card: SnapshotCard) =>
    point(key, lit?.report === key && lit.card === card.id ? null : card);
  // The clicked card, while this window still shows it (a newer report can
  // replace the one it was in).
  const litCard = lit
    ? (all.find((r) => r.key === lit.report)?.cards.find((c) => c.id === lit.card) ?? null)
    : null;
  // Kept across redraws: a board redrawn under the dim (a new snapshot) may
  // rewrite a card's classes, so the dim is laid again after each render;
  // when the card is no longer anywhere to light, the table comes back.
  useLayoutEffect(() => {
    screenOf();
    if (!lit) return;
    if (!litCard || lightOn(screenOf(), [litCard], viewerSeat) === 0) lightOff(screenOf());
  });
  // A click on the table, outside any window, while dimmed: the table back.
  useEffect(() => {
    if (!lit) return undefined;
    const screen = screenOf();
    if (!screen) return undefined;
    const away = (event: MouseEvent) => {
      const at = event.target;
      if (at instanceof Element && at.closest(WINDOWS)) return;
      lightOff(screen);
      setLit(null);
    };
    screen.addEventListener("click", away);
    return () => screen.removeEventListener("click", away);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one listener while dimmed
  }, [lit !== null]);
  // The table back as it was when the window goes.
  useEffect(() => () => lightOff(screenOf()), []);
  const fullWho = full === reveal ? (who ?? null) : (whoOf?.(full.by ?? null) ?? null);
  // A report folding into its row, and the newest coming in under it
  // (the canvas's 0.3 s): once per new report, never on a redraw.
  const rowsRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const shownFull = useRef<string | null>(null);
  useLayoutEffect(() => {
    const was = shownFull.current;
    shownFull.current = full.key;
    if (was === null || was === full.key || reducedMotion()) return;
    const body = fullRef.current;
    if (body && typeof body.animate === "function")
      body.animate(
        [
          { opacity: 0, transform: "translateY(20px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: FOLD_MS, easing: "cubic-bezier(0, 0, 0.2, 1)" },
      );
    const row = rowsRef.current?.querySelector<HTMLElement>(`[data-report="${was}"]`);
    if (row && typeof row.animate === "function")
      row.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: FOLD_MS,
        easing: "cubic-bezier(0, 0, 0.2, 1)",
      });
  }, [full.key]);
  return (
    <div
      ref={trayRef}
      className={`gs-reveal${atTop ? " gs-reveal-top" : ""}${peek ? " gs-win-peek" : ""}`}
      role="region"
      aria-label={full.said ?? full.title.replace(/:$/, "")}
      data-by={full.by || undefined}
      data-gathered={rows.length || undefined}
      style={{
        left: geometry.play.x + geometry.play.w * 0.45,
        maxWidth: geometry.play.w * 0.82,
        // Spec 0088 (Q3 C) -- a window of gathered reports is the canvas's
        // 600 at 1080 wide at least, so its rows read across it.
        ...(rows.length > 0
          ? { minWidth: Math.min(GATHERED_W * (geometry.height / 1080), geometry.play.w * 0.82) }
          : {}),
        // Spec 0071, item 1 -- above your hand, not on it; at the top while
        // a question's window holds the bottom (.gs-reveal-top).
        ...(atTop ? {} : { bottom: reportBottom(geometry) }),
      }}
    >
      {rows.length > 0 && (
        <div ref={rowsRef} className="gs-report-rows" role="group" aria-label="Earlier reports">
          {rows.map((r) => (
            <ReportRow
              key={r.key}
              report={r}
              who={whoOf?.(r.by ?? null, 32) ?? null}
              artUrl={artUrl}
              onOpen={() => setOpened({ at: reveal.key, key: r === reveal ? null : r.key })}
              n={order.get(r.key) ?? 0}
            />
          ))}
        </div>
      )}
      <ReportBody
        report={full}
        who={fullWho}
        artUrl={artUrl}
        bodyRef={fullRef}
        onClose={onClose}
        replay={replay && replay.key === full.key ? replay : null}
        n={rows.length > 0 ? (order.get(full.key) ?? null) : null}
        litCard={litCard && lit?.report === full.key ? lit.card : null}
        onPick={(card) => pick(full.key, card)}
      />
      {drainMs !== null && (
        <span
          className="gs-reveal-drain"
          aria-hidden="true"
          style={{ animationDuration: `${drainMs}ms` }}
        />
      )}
    </div>
  );
}

/** One report in full: who, the sentence, the cards as pictures, then Peek and Close. */
function ReportBody({
  report: reveal,
  who,
  artUrl,
  bodyRef,
  onClose,
  replay,
  n,
  litCard,
  onPick,
}: {
  /** Spec 0103, item 2 -- its order number in a gathered window; null alone. */
  n: number | null;
  /** Spec 0109, item 13 -- the picture the table is dimmed to now, or null. */
  litCard: string | null;
  /** Spec 0109, item 13 -- a picture clicked (or Enter / Space on it). */
  onPick: (card: SnapshotCard) => void;
  replay: ReportReplay | null;
  report: SnapshotReveal;
  who: { name: string; face: ReactNode } | null;
  artUrl: (art: string) => string;
  bodyRef: { current: HTMLDivElement | null };
  onClose: () => void;
}) {
  return (
    <div className="gs-report-full" ref={bodyRef} data-report={reveal.key}>
      {/* Spec 0109, item 13 -- the top part points at nothing. */}
      <div className="gs-reveal-head">
        {n !== null && (
          <b className="gs-report-n gs-report-n-big" aria-hidden="true">
            {n}
          </b>
        )}
        {reveal.said ? (
          // Amendment 12 -- who did it, with which card, and the whole action.
          <div className="gs-reveal-who">
            {replay && (replay.offered || replay.playing) ? (
              // Spec 0103, item 3 (Q3 A) -- the medallion replays the move: a
              // replay sign on pointing; its ring fills as it plays.
              <button
                type="button"
                className={`gs-reveal-replay${replay.playing ? " gs-reveal-replaying" : ""}`}
                aria-label="Replay"
                title="Replay"
                data-replay-offered={replay.offered ? "true" : undefined}
                onClick={() => {
                  if (replay.offered) replay.onReplay();
                }}
              >
                {who?.face}
                <svg className="gs-reveal-ring" viewBox="0 0 56 56" aria-hidden="true">
                  <circle cx="28" cy="28" r="26" stroke="#0b0f0d" strokeWidth="5" />
                  <circle
                    className="gs-reveal-ring-pg"
                    cx="28"
                    cy="28"
                    r="26"
                    stroke="#ffd98a"
                    strokeWidth="3"
                    transform="rotate(-90 28 28)"
                    style={{
                      strokeDasharray: REPLAY_RING_C,
                      strokeDashoffset: REPLAY_RING_C,
                    }}
                  />
                </svg>
                <span className="gs-reveal-replay-sign" aria-hidden="true">
                  <svg viewBox="0 0 20 20" width="13" height="13">
                    <path
                      d="M15.5 10a5.5 5.5 0 1 1-1.8-4.1"
                      fill="none"
                      stroke="#f2d48a"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M14.6 2.6 L14.2 6.4 L10.5 5.9"
                      fill="none"
                      stroke="#f2d48a"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
            ) : (
              reportWho(reveal, who).face
            )}
            <div>
              <span className="gs-reveal-by">{reportWho(reveal, who).line}</span>
              <h2 className="gs-reveal-title gs-reveal-said">{reveal.said}</h2>
              {/* Spec 0057, item 7 -- why: a reveal paid as a cost. */}
              {reveal.why && (
                <p className="gs-reveal-why">
                  <ManaText text={reveal.why} />
                </p>
              )}
            </div>
          </div>
        ) : (
          <h2 className="gs-reveal-title">{reveal.title}</h2>
        )}
      </div>
      <ul className="gs-reveal-cards">
        {reveal.cards.map((card) => (
          <li
            key={card.id}
            className="gs-reveal-card"
            data-revealed-id={card.id}
            data-to={card.to ?? undefined}
            // Spec 0109, item 13 -- a click (Enter or Space) dims the table
            // to this card; again, the table comes back. Not a button: the
            // scripted games read list items' buttons as a question's choices.
            data-lit={litCard === card.id ? "true" : undefined}
            tabIndex={0}
            aria-pressed={litCard === card.id}
            aria-label={`Show ${card.faceDown && !card.known ? "the face-down card" : card.name} on the table`}
            onClick={() => onPick(card)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              // Space here is the picture's, not Peek's (usePeek skips a handled key).
              event.preventDefault();
              onPick(card);
            }}
          >
            <BigCard card={card} artUrl={artUrl} small />
            <span className="gs-reveal-name">
              {card.faceDown && !card.known ? "Face-down card" : card.name}
            </span>
            {/* Spec 0079 -- a fizzle's card that left: where it is now ("in Bob's hand"). */}
            {(card.toSaid ?? wentWords(card.to)) && (
              <span className="gs-reveal-to">{card.toSaid ?? wentWords(card.to)}</span>
            )}
          </li>
        ))}
        {/* Spec 0075 -- the colour chosen, the coin flipped: pictures too. */}
        {(reveal.marks ?? []).map((mark, i) => (
          <li key={`mark:${i}`} className="gs-reveal-card" data-mark={mark.kind}>
            <ReportMarkPicture mark={mark} />
            <span className="gs-reveal-name">{markWords(mark)[0]}</span>
            <span className="gs-reveal-to">{markWords(mark)[1]}</span>
          </li>
        ))}
      </ul>
      {/* Spec 0057, item 2 -- the question windows' footer: Peek and "or hold
        Space" on the left, Close on the right. */}
      <PeekFoot
        className="gs-reveal-foot"
        after={
          replay?.offered ? (
            // Spec 0103, item 3 -- the foot names the key.
            <span className="gs-reveal-replay-key">
              {/* Spec 0113 (W1-096): a sentence of its own, no " · ". */}
              {". Press "}
              <kbd className="gs-key">R</kbd> to replay
            </span>
          ) : null
        }
      >
        <button
          type="button"
          className="pa-button pa-button-quiet gs-reveal-close"
          onClick={onClose}
        >
          Close
        </button>
      </PeekFoot>
    </div>
  );
}

/** Spec 0109, item 13 -- a click inside one of these is not a click on the table. */
const WINDOWS = ".gs-reveal, .gs-win, [role='dialog'], [role='menu']";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : true;
}
