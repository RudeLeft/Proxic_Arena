// The everyday questions — PHASE_09 group 2 (W-01, W-02, W-03; owner
// 2026-10-30), in the W-00 frame (GameWindow.tsx).
//
// W-01  the answer is a click on the table (a target, paying mana, a
//       sacrifice): a bubble beside the card asking -- what to click, what
//       is still owed, Cancel.
// W-02  choices the table cannot show: a bubble for up to six short ones;
//       the tray for more, or when they are cards, with a search box when
//       the list is long; colours as the mana symbols.
// W-03  "List choices": every option in the tray, grouped by its card.
//
// The class names the scripted games read (`gs-question-title`, list
// buttons `gs-option`, a "Pass" button) are kept on purpose.

import { useMemo, useState } from "react";
import type { Decision, DecisionOption, Snapshot, SnapshotCard } from "../match";
import { hintFor } from "../matchText";
import { SharpCard, closeUpOf } from "../closeUp";
import { CardFace, figure, lookOf, shortType } from "./Board";
import { Bubble, Tray } from "./GameWindow";
import type { Question } from "./interaction";
import type { Box, Geometry } from "./layout";
import { ManaText, symbolUrl } from "./ManaCost";

/** At most this many short choices in a bubble; more go to the tray. */
export const BUBBLE_MOST = 6;
/** A choice longer than this is not "short". */
const SHORT = 60;
/** More choices than this get a search box. */
const SEARCH_FROM = 12;

/** The hint without "Cancel (or Esc) backs out": Cancel is a button here. */
export function plainHint(kind: string, count: number): string {
  return hintFor(kind, count)
    .replace(/\s*Cancel \(or Esc\)[^.]*\./, "")
    .trim();
}

/** An option's words without its card's name in front ("Faithless Looting — "). */
export function optionWords(option: DecisionOption, name: string | null): string {
  const label = option.label ?? option.actionId;
  return name && label.startsWith(`${name} — `) ? label.slice(name.length + 3) : label;
}

/** The mana symbol a colour choice stands for, or null. */
export function colourSymbol(label: string | null): string | null {
  const colours: Record<string, string> = {
    white: "W",
    blue: "U",
    black: "B",
    red: "R",
    green: "G",
    colorless: "C",
    colourless: "C",
  };
  return colours[(label ?? "").trim().toLowerCase()] ?? null;
}

/** Whether W-02 puts these choices in a bubble (else the tray). */
export function fitsBubble(options: readonly DecisionOption[], board: Snapshot): boolean {
  return (
    options.length <= BUBBLE_MOST &&
    options.every((o) => (o.label ?? "").length <= SHORT && !cardOf(board, o.objectId))
  );
}

function cardOf(board: Snapshot, id: string | null): SnapshotCard | null {
  if (!id || !id.startsWith("card:")) return null;
  return (
    [...board.battlefield, ...board.hand, ...board.graveyard, ...board.exile].find(
      (c) => c.id === id,
    ) ?? null
  );
}

/**
 * The card a question is about: by the name the game gives (on the stack,
 * in hand, on the battlefield), or, when it gives none ("Choose a mode for
 * Fiery Confluence."), the card its words name.
 */
export function sourceOf(board: Snapshot, decision: Decision): SnapshotCard | null {
  const cards = [...board.hand, ...board.battlefield];
  const name = decision.about?.name ?? null;
  if (name) {
    const entry = board.stack.find((s) => s.name === name);
    return (
      (entry?.source ? cardOf(board, entry.source) : null) ??
      cards.find((c) => c.name === name) ??
      null
    );
  }
  const prompt = decision.prompt ?? "";
  return (
    cards
      .filter((c) => c.name && prompt.includes(c.name))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  );
}

/** At most this long, every choice is a chip in a row ("X = 3"). */
const CHIP = 12;

/** Plain choices in columns, no more than three, about six to a column. */
function gridColumns(count: number): string {
  return `repeat(${Math.min(3, Math.ceil(count / 6))}, 260px)`;
}

/**
 * "List choices" by card. Copies of one card offering the same choices
 * (five untapped Mountains) are one picture, "x5", answered with the first.
 */
export function listGroups(
  options: readonly DecisionOption[],
  board: Snapshot,
): { card: SnapshotCard | null; count: number; options: DecisionOption[] }[] {
  const byCard = new Map<string, { card: SnapshotCard | null; options: DecisionOption[] }>();
  for (const o of options) {
    const card = cardOf(board, o.objectId);
    const key = card ? card.id : "other";
    const group = byCard.get(key) ?? { card, options: [] };
    group.options.push(o);
    byCard.set(key, group);
  }
  const merged = new Map<
    string,
    { card: SnapshotCard | null; count: number; options: DecisionOption[] }
  >();
  for (const [id, group] of byCard) {
    const card = group.card;
    const key = card
      ? JSON.stringify([card.name, ...group.options.map((o) => optionWords(o, card.name))])
      : id;
    const same = merged.get(key);
    if (same) same.count += 1;
    else merged.set(key, { ...group, count: 1 });
  }
  return [...merged.values()];
}

function Picture({ card, artUrl }: { card: SnapshotCard; artUrl: (art: string) => string }) {
  const look = lookOf(card.kind, card.types);
  return (
    <div className={`bf-card bf-look-${look}`} aria-hidden="true">
      <CardFace
        name={card.name}
        look={look}
        type={shortType(card.types)}
        pt={figure(card)}
        art={card.art ? artUrl(card.art) : null}
        faceDown={card.faceDown}
        known={card.known}
      />
    </div>
  );
}

/** A card large enough to read: its sharp picture, or its words on a plain card. */
function BigCard({
  card,
  artUrl,
  small,
}: {
  card: SnapshotCard;
  artUrl: (art: string) => string;
  small?: boolean;
}) {
  const cls = `gs-win-bigcard${small ? " gs-win-bigcard-small" : ""}`;
  if (card.art) {
    return (
      <SharpCard className={cls} low={artUrl(card.art)} high={closeUpOf(artUrl(card.art))} alt="" />
    );
  }
  return (
    <span className={`${cls} gs-win-bigcard-words`}>
      <b>{card.name}</b>
      <i>{card.types}</i>
    </span>
  );
}

function OptionButton({
  option,
  name,
  busy,
  onAnswer,
}: {
  option: DecisionOption;
  name: string | null;
  busy: boolean;
  onAnswer: (actionId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`gs-option gs-win-option${option.payable ? "" : " gs-option-unpayable"}`}
        disabled={busy}
        onClick={() => onAnswer(option.actionId)}
      >
        {/* The card's name stays in the text (the scripted games read the
            whole label); beside its picture it is only hidden from sight. */}
        {name && optionWords(option, name) !== (option.label ?? option.actionId) && (
          <span className="gs-win-option-card">{name} — </span>
        )}
        <ManaText text={optionWords(option, name)} />
        {!option.payable && <span className="gs-option-note"> — not enough mana right now</span>}
      </button>
    </li>
  );
}

/** "Pass", or what backing out undoes ("Cancel Lightning Bolt"). */
function PassButton({
  word,
  busy,
  onPass,
}: {
  word: string | null;
  busy: boolean;
  onPass: () => void;
}) {
  if (!word) return null;
  return (
    <button type="button" className="gs-win-btn gs-win-btn-quiet" disabled={busy} onClick={onPass}>
      {word}
    </button>
  );
}

interface Common {
  decision: Decision;
  question: Question;
  board: Snapshot;
  geometry: Geometry;
  anchor: Box;
  busy: boolean;
  notice: string | null;
  /** The question's heading ("Choose a target", "Playing for seat 2"). */
  heading: string;
  /** The pass button's words, or null when there is no "no". */
  passWord: string | null;
  artUrl: (art: string) => string;
  onAnswer: (actionId: string | null) => void;
}

function Notice({ notice }: { notice: string | null }) {
  return notice ? (
    <p className="gs-win-prompt gs-win-notice" role="alert">
      <ManaText text={notice} />
    </p>
  ) : null;
}

/**
 * W-01 — the answer is a click on the table: a bubble beside the card
 * asking, saying what to click; the few choices the table cannot show
 * ("All attack", "Use floating {R}") as buttons in it.
 */
export function TableQuestionWindow(props: Common) {
  const { decision, question, board, busy, artUrl, onAnswer } = props;
  const source = sourceOf(board, decision);
  const name = decision.about?.name ?? source?.name ?? null;
  const title = props.heading;
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={title}
      from={name ?? "Your answer"}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      picture={source ? <Picture card={source} artUrl={artUrl} /> : null}
      actions={<PassButton word={props.passWord} busy={busy} onPass={() => onAnswer(null)} />}
    >
      {decision.prompt && (
        <p className="gs-win-prompt gs-question-prompt decision-prompt">
          <ManaText text={decision.prompt} />
        </p>
      )}
      <p className="gs-win-prompt">
        <ManaText text={plainHint(decision.kind, decision.options.length)} />
      </p>
      {question.listed.length > 0 && (
        <ul className="gs-win-list">
          {question.listed.map((o) => (
            <OptionButton key={o.actionId} option={o} name={name} busy={busy} onAnswer={onAnswer} />
          ))}
        </ul>
      )}
      <Notice notice={props.notice} />
    </Bubble>
  );
}

/**
 * W-02 — choices the table cannot show: the bubble for a few short ones
 * (colours as mana symbols), the tray for more or for cards, with a search
 * box when there are many.
 */
export function ChoiceWindow(props: Common) {
  const { decision, question, board, busy, artUrl, onAnswer } = props;
  const [query, setQuery] = useState("");
  const source = sourceOf(board, decision);
  const name = decision.about?.name ?? source?.name ?? null;
  const title = props.heading;
  const choices = question.listed;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? choices.filter((o) => (o.label ?? "").toLowerCase().includes(q)) : choices;
  }, [choices, query]);
  // The game's hint ("not cast, nothing paid"), and the table as the
  // other way to answer when it can.
  const hint = [
    plainHint(decision.kind, decision.options.length),
    question.onBoard.size > 0 ? "Or click a highlighted card or player on the table." : "",
  ]
    .filter(Boolean)
    .join(" ");
  const pass = <PassButton word={props.passWord} busy={busy} onPass={() => onAnswer(null)} />;
  const colours = choices.length > 0 && choices.every((o) => colourSymbol(o.label) !== null);
  const chips = choices.every((o) => (o.label ?? o.actionId).length <= CHIP);
  const chipList = (list: readonly DecisionOption[]) => (
    <ul className="gs-win-list gs-win-chips">
      {list.map((o) => (
        <li key={o.actionId}>
          <button
            type="button"
            className="gs-option gs-win-chip"
            disabled={busy}
            onClick={() => onAnswer(o.actionId)}
          >
            <ManaText text={o.label ?? o.actionId} />
          </button>
        </li>
      ))}
    </ul>
  );

  if (fitsBubble(choices, board)) {
    return (
      <Bubble
        anchor={props.anchor}
        geometry={props.geometry}
        label={title}
        from={name ?? "Choose"}
        title={title}
        titleClass="gs-question-title"
        kind={decision.kind}
        picture={source ? <Picture card={source} artUrl={artUrl} /> : null}
        actions={pass}
      >
        {decision.prompt && (
          <p className="gs-win-prompt gs-question-prompt decision-prompt">
            <ManaText text={decision.prompt} />
          </p>
        )}
        {colours ? (
          <ul className="gs-win-list gs-win-colours">
            {choices.map((o) => {
              const symbol = colourSymbol(o.label)!;
              return (
                <li key={o.actionId}>
                  <button
                    type="button"
                    className="gs-option gs-win-colour"
                    disabled={busy}
                    aria-label={o.label ?? symbol}
                    title={o.label ?? symbol}
                    onClick={() => onAnswer(o.actionId)}
                  >
                    <img src={symbolUrl(symbol)} alt="" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : chips ? (
          chipList(choices)
        ) : (
          <ul className="gs-win-list">
            {choices.map((o) => (
              <OptionButton
                key={o.actionId}
                option={o}
                name={name}
                busy={busy}
                onAnswer={onAnswer}
              />
            ))}
          </ul>
        )}
        {hint && (
          <p className="gs-win-prompt">
            <ManaText text={hint} />
          </p>
        )}
        <Notice notice={props.notice} />
      </Bubble>
    );
  }

  const cards = choices.every((o) => cardOf(board, o.objectId));
  return (
    <Tray
      geometry={props.geometry}
      label={title}
      from={name ?? `${choices.length} choices`}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      prompt={decision.prompt}
      actions={pass}
    >
      {choices.length > SEARCH_FROM && (
        <input
          className="gs-win-search"
          type="search"
          placeholder={`Search ${choices.length} choices…`}
          aria-label="Search the choices"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {cards ? (
        <ul className="gs-win-tiles gs-win-list">
          {shown.map((o) => (
            <li key={o.actionId}>
              <button
                type="button"
                className="gs-option gs-win-tile"
                disabled={busy}
                aria-label={o.label ?? o.actionId}
                onClick={() => onAnswer(o.actionId)}
              >
                <BigCard card={cardOf(board, o.objectId)!} artUrl={artUrl} />
              </button>
            </li>
          ))}
        </ul>
      ) : chips ? (
        chipList(shown)
      ) : (
        <ul
          className="gs-win-list gs-win-grid"
          style={{ gridTemplateColumns: gridColumns(shown.length) }}
        >
          {shown.map((o) => (
            <OptionButton key={o.actionId} option={o} name={name} busy={busy} onAnswer={onAnswer} />
          ))}
        </ul>
      )}
      {hint && (
        <p className="gs-win-prompt">
          <ManaText text={hint} />
        </p>
      )}
      <Notice notice={props.notice} />
    </Tray>
  );
}

/**
 * W-03 — "List choices": every option of the question, grouped by its card
 * with the card's picture, in plain words; those that cannot be paid now
 * dimmed with the reason.
 */
export function ListTray(props: Common & { onClose: () => void }) {
  const { decision, board, busy, artUrl, onAnswer } = props;
  const groups = useMemo(() => listGroups(decision.options, board), [decision, board]);
  const title =
    decision.kind === "chooseSpellAbilityToPlay" ? "Everything you can do" : props.heading;
  return (
    <Tray
      geometry={props.geometry}
      label="Every choice"
      from={`${decision.options.length} choices`}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      prompt={decision.prompt}
      actions={
        <>
          <PassButton word={props.passWord} busy={busy} onPass={() => onAnswer(null)} />
          <button type="button" className="gs-win-btn gs-win-btn-quiet" onClick={props.onClose}>
            Hide the list
          </button>
        </>
      }
    >
      {!decision.prompt && decision.kind === "chooseSpellAbilityToPlay" && (
        <p className="gs-win-prompt">Click one to do it. Dimmed: it can't be paid for right now.</p>
      )}
      {decision.kind !== "chooseSpellAbilityToPlay" && (
        <p className="gs-win-prompt">
          <ManaText text={plainHint(decision.kind, decision.options.length)} />
        </p>
      )}
      <div className="gs-win-groups">
        {groups.map(({ card, count, options }) => (
          <div className="gs-win-group" key={card?.id ?? "other"}>
            {card && (
              <span className="gs-win-group-card">
                <BigCard card={card} artUrl={artUrl} small />
                {count > 1 && <span className="gs-win-tile-many">×{count}</span>}
              </span>
            )}
            <ul className="gs-win-list">
              {options.map((o) => (
                <OptionButton
                  key={o.actionId}
                  option={o}
                  name={card?.name ?? null}
                  busy={busy}
                  onAnswer={onAnswer}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <Notice notice={props.notice} />
    </Tray>
  );
}
