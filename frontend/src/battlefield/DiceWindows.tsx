// Phase 9 W-17 (Amendment 19, owner 2026-11-05) -- dice, rolls and the
// Un-set choices, each a bubble beside the card asking (W-00):
//
//   - a roll question draws the rolled dice in 3D (Die3D) and you click a
//     die; it names the card that rolled and the card letting you change
//     the roll, with its price; "pass" says what it means ("Keep the 4");
//   - a sector or sprocket choice says what is in each one, counted from
//     the board, and pointing at one lights those cards on the table;
//     a sprocket says when it cranks;
//   - cranking shows the Contraption's picture: Crank / Don't crank;
//   - a two-way choice is "Call it" only when it is a coin call.
//
// The game's own facts come in `decision.arrange` (dice, crankNext,
// binary); the answers are always the game's own options.

import { useState, type ReactNode } from "react";
import type { Decision, DecisionOption, Snapshot, SnapshotCard, SnapshotRoll } from "../match";
import { Die3D } from "./Die3D";
import { Bubble } from "./GameWindow";
import { ManaText } from "./ManaCost";
import { BigCard, PassButton, Picture, beingCast, sourceOf, type Common } from "./QuestionWindows";

export const DICE_KINDS = new Set([
  "chooseDiceToReroll",
  "chooseRollToModify",
  "chooseRollToSwap",
  "chooseRollSwapValue",
  "chooseRollToIgnore",
]);

/** Forge's BinaryChoiceType, as a window title. Only a coin call says "Call it". */
const BINARY_TITLES: Record<string, string> = {
  HeadsOrTails: "Call it",
  TapOrUntap: "Tap or untap",
  PlayOrDraw: "Play or draw",
  OddsOrEvens: "Odd or even",
  UntapOrLeaveTapped: "Untap it?",
  LeftOrRight: "Left or right",
  AddOrRemove: "Add or remove",
  IncreaseOrDecrease: "Raise or lower the roll",
};

/** W-17 -- a two-way choice's title; null when the game didn't say which kind. */
export function binaryTitle(decision: Decision): string | null {
  if (decision.kind !== "chooseBinary") return null;
  const kind = decision.arrange?.binary;
  return kind ? (BINARY_TITLES[kind] ?? "Choose one") : null;
}

/** W-17 -- whether a two-way choice is a coin call (the coin words belong to it alone). */
export function isCoinCall(decision: Decision): boolean {
  const kind = decision.arrange?.binary;
  return decision.kind === "chooseBinary" && (kind == null || kind === "HeadsOrTails");
}

const cardOf = (board: Snapshot, id: string): SnapshotCard | null =>
  [...board.battlefield, ...board.hand, ...board.graveyard, ...board.exile].find(
    (c) => c.id === id,
  ) ?? null;

/** "4", "4 and 5", "1, 4 and 6". */
export function rollWords(rolls: readonly number[]): string {
  if (rolls.length <= 1) return String(rolls[0] ?? "");
  return `${rolls.slice(0, -1).join(", ")} and ${rolls[rolls.length - 1]}`;
}

/** W-17 -- the words of a roll window, by how the roll may change. */
export function diceWords(decision: Decision): {
  title: string;
  says: string | null;
  pass: string | null;
  main: string | null;
  dieWord: string;
} {
  const dice = decision.arrange!.dice!;
  const rolls = dice.rolls;
  const one = rolls.length === 1;
  const r = rolls[0] ?? 0;
  const by = dice.by[0]?.name ?? null;
  const price = dice.price;
  switch (dice.how) {
    case "reroll": {
      const chosen = /\(.* chosen\)/.test(decision.prompt ?? "");
      return {
        title: one ? `Reroll the ${r}${price ? ` for ${price}` : ""}?` : "Reroll which dice?",
        says: by ? `${by} lets you reroll${price ? ` for ${price}` : ""}.` : null,
        pass: chosen ? "Done" : one ? `Keep the ${r}` : "Keep them",
        main: one ? `Reroll${price ? ` · ${price}` : ""}` : null,
        dieWord: "reroll",
      };
    }
    case "nudge":
      return {
        title: one ? `Change the ${r} by one?` : "Change a roll by one?",
        says: by ? `${by} can raise or lower a roll by one.` : null,
        pass: one ? `Keep the ${r}` : "Keep them",
        main: one ? "Change it" : null,
        dieWord: "change",
      };
    case "swap":
      return {
        title: "Exchange a roll with a creature's power or toughness?",
        says: null,
        pass: "Don't swap",
        main: one ? "Exchange it" : null,
        dieWord: "exchange",
      };
    case "swapValue":
      return {
        title: `Exchange the ${r} with power or toughness?`,
        says: null,
        pass: "Don't swap",
        main: null,
        dieWord: "",
      };
    case "ignore":
      return {
        title: "Ignore which roll?",
        says: "Click the die to ignore. The other one counts.",
        pass: null,
        main: null,
        dieWord: "ignore",
      };
    default:
      return { title: "Choose a roll", says: null, pass: "Pass", main: null, dieWord: "" };
  }
}

/** W-17 -- a roll question: the dice in 3D, the card asking, plain words. */
export function DiceWindow(props: Common) {
  const { decision, board, busy, artUrl, onAnswer } = props;
  const dice = decision.arrange!.dice!;
  const words = diceWords(decision);
  const source = sourceOf(board, decision);
  const changer = dice.by[0] ? cardOf(board, dice.by[0].id) : null;
  const picture = changer ?? (source && !beingCast(board, decision, source) ? source : null);
  // The card rolling is the ability resolving: the top of the stack (the
  // game's question doesn't name it).
  const rolled = board.stack[0]?.name ?? decision.about?.name ?? source?.name ?? null;
  const from = rolled
    ? `${rolled} rolled ${rollWords(dice.rolls)}`
    : `You rolled ${rollWords(dice.rolls)}`;
  // The game's options are the dice, in the order offered ("Roll: 4").
  const pickable = dice.how !== "swapValue";
  const swapButtons =
    dice.how === "swapValue"
      ? decision.options.map((o) => {
          const which = /power/i.test(o.label ?? "")
            ? `Power (${dice.power ?? "?"})`
            : /toughness/i.test(o.label ?? "")
              ? `Toughness (${dice.toughness ?? "?"})`
              : (o.label ?? o.actionId);
          return (
            <button
              key={o.actionId}
              type="button"
              className="gs-win-btn gs-option"
              disabled={busy}
              onClick={() => onAnswer(o.actionId)}
            >
              {which}
            </button>
          );
        })
      : null;
  const first = decision.options[0];
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={words.title}
      from={from}
      title={words.title}
      titleClass="gs-question-title"
      kind={decision.kind}
      picture={picture ? <Picture card={picture} artUrl={artUrl} /> : null}
      actions={
        <>
          {swapButtons}
          {!decision.mandatory && (
            <PassButton word={words.pass} busy={busy} onPass={() => onAnswer(null)} />
          )}
          {words.main && first && (
            <button
              type="button"
              className="gs-win-btn gs-win-btn-main"
              disabled={busy}
              onClick={() => onAnswer(first.actionId)}
            >
              <ManaText text={words.main} />
            </button>
          )}
        </>
      }
    >
      <div className="gs-dice">
        {dice.rolls.map((value, i) => {
          const option = decision.options[i];
          const die = <Die3D value={value} sides={dice.sides} size={52} roll={1} />;
          return pickable && option ? (
            <button
              key={`${i}:${value}`}
              type="button"
              className="gs-dice-pick gs-option"
              disabled={busy}
              aria-label={`${words.dieWord ? `${words.dieWord} ` : ""}the ${value}`}
              onClick={() => onAnswer(option.actionId)}
            >
              {die}
              <span>{words.dieWord ? `${words.dieWord} ${value}` : value}</span>
            </button>
          ) : (
            <span key={`${i}:${value}`} className="gs-dice-pick">
              {die}
              <span>your {value}</span>
            </span>
          );
        })}
      </div>
      {words.says && (
        <p className="gs-win-prompt">
          <ManaText text={words.says} />
        </p>
      )}
    </Bubble>
  );
}

/** "your Savannah Lions", "their Hill Giant". */
function whose(board: Snapshot, card: SnapshotCard): string {
  return `${card.seat === board.seat ? "your" : "their"} ${card.name}`;
}

/** W-17 -- one choice of several places (a sector, a sprocket): what is there, lit when pointed at. */
function PlaceChoices({
  options,
  words,
  busy,
  onAnswer,
  onLight,
}: {
  options: readonly {
    option: DecisionOption;
    name: string;
    cards: SnapshotCard[];
    note: string | null;
  }[];
  words: (cards: SnapshotCard[]) => string;
  busy: boolean;
  onAnswer: (actionId: string) => void;
  onLight: (ids: readonly string[]) => void;
}) {
  return (
    <ul className="gs-win-list gs-places">
      {options.map(({ option, name, cards, note }) => (
        <li key={option.actionId}>
          <button
            type="button"
            className="gs-option gs-place"
            disabled={busy}
            onMouseEnter={() => onLight(cards.map((c) => c.id))}
            onMouseLeave={() => onLight([])}
            onFocus={() => onLight(cards.map((c) => c.id))}
            onBlur={() => onLight([])}
            onClick={() => {
              onLight([]);
              onAnswer(option.actionId);
            }}
          >
            <b>{name}</b>
            <span>{[note, words(cards)].filter(Boolean).join(" · ")}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** W-17 -- Space Beleren's sectors: each says who is in it. */
export function SectorWindow(props: Common & { onLight: (ids: readonly string[]) => void }) {
  const { decision, board, busy, artUrl, onAnswer, onLight } = props;
  const source = sourceOf(board, decision);
  const assign = /^Assign (.+) to a sector\.?$/.exec(decision.prompt ?? "");
  const title = assign ? `Put ${assign[1]} in a sector` : "Choose a sector";
  const options = decision.options.map((option) => ({
    option,
    name: option.label ?? option.actionId,
    cards: board.battlefield.filter((c) => c.sector === option.label),
    note: null,
  }));
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={title}
      from={source?.name ?? "Space sculptor"}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      picture={
        source && !beingCast(board, decision, source) ? (
          <Picture card={source} artUrl={artUrl} />
        ) : null
      }
      actions={
        !decision.mandatory ? (
          <PassButton word={props.passWord} busy={busy} onPass={() => onAnswer(null)} />
        ) : null
      }
    >
      {assign && (
        <p className="gs-win-prompt">A creature without a sector gets one as it enters.</p>
      )}
      <PlaceChoices
        options={options}
        words={(cards) => (cards.length ? cards.map((c) => whose(board, c)).join(", ") : "empty")}
        busy={busy}
        onAnswer={onAnswer}
        onLight={onLight}
      />
    </Bubble>
  );
}

/** W-17 -- a sprocket for a Contraption: when it cranks and what is on it. */
export function SprocketWindow(props: Common & { onLight: (ids: readonly string[]) => void }) {
  const { decision, board, busy, artUrl, onAnswer, onLight } = props;
  const source = sourceOf(board, decision);
  const next = decision.arrange?.crankNext ?? null;
  const mine = board.battlefield.filter((c) => c.seat === board.seat && c.sprocket !== null);
  const options = decision.options.map((option) => {
    const n = Number(/Sprocket (\d)/.exec(option.label ?? "")?.[1] ?? 0);
    const turns = next === null || n === 0 ? null : ((n - next + 3) % 3) + 1;
    return {
      option,
      name: `Sprocket ${n || "?"}`,
      cards: mine.filter((c) => c.sprocket === n),
      note: turns === null ? null : turns === 1 ? "cranks next turn" : `cranks in ${turns} turns`,
    };
  });
  const what = /^Assemble (.+) onto a sprocket/.exec(decision.prompt ?? "")?.[1] ?? "it";
  const title = `Put ${what} on a sprocket`;
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={title}
      from={source?.name ?? "Assemble a Contraption"}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      picture={source ? <Picture card={source} artUrl={artUrl} /> : null}
      actions={null}
    >
      <p className="gs-win-prompt">
        Each of your turns one sprocket cranks, in turn: 1, 2, 3, then 1 again.
      </p>
      <PlaceChoices
        options={options}
        words={(cards) => (cards.length ? cards.map((c) => c.name).join(", ") : "empty")}
        busy={busy}
        onAnswer={onAnswer}
        onLight={onLight}
      />
    </Bubble>
  );
}

/** W-17 -- crank this turn's Contraptions: their pictures, Crank / Don't crank. */
export function CrankWindow(props: Common) {
  const { decision, board, busy, artUrl, onAnswer } = props;
  const cards = decision.options
    .map((o) => ({ option: o, card: o.objectId ? cardOf(board, o.objectId) : null }))
    .filter((x): x is { option: DecisionOption; card: SnapshotCard } => x.card !== null);
  const one = cards.length === 1 ? cards[0]! : null;
  const sprocket = /sprocket (\d)/i.exec(decision.prompt ?? "")?.[1] ?? null;
  const title = one ? `Crank ${one.card.name}?` : "Crank which Contraptions?";
  const body: ReactNode = (
    <ul className="gs-win-list gs-crank-cards">
      {cards.map(({ option, card }) => (
        <li key={option.actionId}>
          <button
            type="button"
            className="gs-option gs-crank-card"
            disabled={busy}
            aria-label={`Crank ${card.name}`}
            onClick={() => onAnswer(option.actionId)}
          >
            <BigCard card={card} artUrl={artUrl} />
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={title}
      from={sprocket ? `Sprocket ${sprocket} cranks` : "Your sprocket cranks"}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      actions={
        <>
          <PassButton word="Don't crank" busy={busy} onPass={() => onAnswer(null)} />
          {one && (
            <button
              type="button"
              className="gs-win-btn gs-win-btn-main"
              disabled={busy}
              onClick={() => onAnswer(one.option.actionId)}
            >
              Crank
            </button>
          )}
        </>
      }
    >
      <p className="gs-win-prompt">
        {one
          ? "Cranked, it does its thing now."
          : "Click each one to crank, then Don't crank for the rest."}
      </p>
      {body}
    </Bubble>
  );
}

/** How long a die stays after its ability has left the stack. */
export const ROLL_LINGER_MS = 3000;
const ROLL_SIZE = 60;

/**
 * W-17 (owner's choice 2) -- a die tumbles out beside the card that rolled,
 * on the stack, on every screen, and stays until the ability resolves;
 * once it has resolved it lingers a moment, then fades. Only rolls made
 * since this page opened tumble (`since`).
 */
export function RollsOverlay({
  rolls,
  stack,
  since,
  arrived,
  now,
  at,
}: {
  rolls: readonly SnapshotRoll[];
  stack: readonly { id: string; source: string | null }[];
  /** Rolls numbered this or lower were made before the page opened. */
  since: number;
  /** When each roll (by its number) was first seen. */
  arrived: ReadonlyMap<number, number>;
  now: number;
  at: (objectId: string) => { x: number; y: number; w: number; h: number } | null;
}) {
  // The newest roll per card: a reroll replaces the die, it doesn't add one.
  const newest = new Map<string, (typeof rolls)[number]>();
  for (const roll of rolls) {
    if (roll.n <= since) continue;
    const key = roll.source ?? `roll:${roll.n}`;
    const before = newest.get(key);
    if (!before || before.n < roll.n) newest.set(key, roll);
  }
  return (
    <>
      {[...newest.values()].map((roll) => {
        const entry = roll.source ? stack.find((e) => e.source === roll.source) : undefined;
        const seen = arrived.get(roll.n) ?? now;
        if (!entry && now - seen > ROLL_LINGER_MS + 600) return null;
        const box = entry ? at(entry.id) : roll.source ? at(roll.source) : null;
        if (!box) return null;
        return (
          <div
            key={roll.n}
            className={`gs-roll gs-roll-toss${entry ? "" : " gs-roll-fading"}`}
            data-roll={roll.n}
            style={{
              left: box.x - ROLL_SIZE * 0.55,
              top: box.y + box.h - ROLL_SIZE * 0.9,
            }}
          >
            <span className="gs-roll-dice">
              {roll.results.map((value, i) => (
                <Die3D key={i} value={value} sides={roll.sides} size={ROLL_SIZE} roll={roll.n} />
              ))}
            </span>
            <span className="pa-visually-hidden">
              {`${roll.name ?? "A card"} rolled ${rollWords(roll.results)}`}
            </span>
          </div>
        );
      })}
    </>
  );
}

type Dungeon = NonNullable<NonNullable<Decision["arrange"]>["dungeons"]>[number];

/** Amendment 20 -- how many rooms deep a dungeon is, along its longest way through. */
export function dungeonDepth(dungeon: Dungeon): number {
  const byName = new Map(dungeon.rooms.map((r) => [r.name, r]));
  const deep = (name: string, seen: Set<string>): number => {
    const room = byName.get(name);
    if (!room || seen.has(name)) return 0;
    const next = new Set(seen).add(name);
    return 1 + Math.max(0, ...room.next.map((n) => deep(n, next)));
  };
  return dungeon.rooms[0] ? deep(dungeon.rooms[0].name, new Set()) : 0;
}

/** "Scry 1." -> "scry 1"; a long effect cut at its first sentence. */
const effectWords = (says: string) => {
  const first = says.split(/(?<=\.)\s/)[0] ?? says;
  const short = first.length > 70 ? `${first.slice(0, 67).trimEnd()}…` : first;
  return short.replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase());
};

/** Amendment 20 -- a dungeon in a few words: its rooms, how deep, first and last room. */
export function dungeonWords(dungeon: Dungeon): string {
  const first = dungeon.rooms[0];
  const last = dungeon.rooms[dungeon.rooms.length - 1];
  if (!first || !last) return "";
  return `${dungeon.rooms.length} rooms, ${dungeonDepth(dungeon)} deep: ${first.name} (${effectWords(first.says)}) → … → ${last.name} (${effectWords(last.says)})`;
}

/** Amendment 20 -- which dungeon to venture into: each with its rooms, in the game's words. */
export function DungeonWindow(props: Common) {
  const { decision, board, busy, artUrl, onAnswer } = props;
  const dungeons = decision.arrange?.dungeons ?? [];
  const source = sourceOf(board, decision);
  const asking = board.stack[0]?.name ?? decision.about?.name ?? source?.name ?? "Venture";
  const title = "Venture into which dungeon?";
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={title}
      from={asking}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      picture={
        source && !beingCast(board, decision, source) ? (
          <Picture card={source} artUrl={artUrl} />
        ) : null
      }
      actions={null}
    >
      <ul className="gs-win-list gs-places">
        {decision.options.map((option) => {
          const dungeon = dungeons.find((d) => d.name === option.label);
          return (
            <li key={option.actionId}>
              <button
                type="button"
                className="gs-option gs-place"
                disabled={busy}
                onClick={() => onAnswer(option.actionId)}
              >
                <b>{option.label}</b>
                {dungeon && <span>{dungeonWords(dungeon)}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </Bubble>
  );
}

const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight"];
const say = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** Amendment 21 -- the title of a modes window: what to choose, and how far along. */
export function modesTitle(
  modes: NonNullable<NonNullable<Decision["arrange"]>["modes"]>,
  count: number,
  used: number,
): string {
  if (modes.budget != null) return `Choose modes · ${used} of ${modes.budget} paw prints`;
  if (modes.min === modes.num) return `Choose ${say(modes.num)} · ${count} of ${modes.num}`;
  const from = modes.min <= 0 ? "up to" : `${say(modes.min)} to`;
  return `Choose ${from} ${say(modes.num)} · ${count} chosen`;
}

/**
 * Phase 9 Amendment 21 (owner: tick them, then Done) -- a card that
 * chooses several modes: every mode in one window, ticked (or counted,
 * when a mode may be taken again), "Choose two · 1 of 2"; modes that can't
 * be added any more dim; Done gives the screen the modes in order, which
 * answers the game's one-mode-at-a-time questions from them.
 */
export function ModesWindow(props: Common & { onDone: (labels: string[]) => void }) {
  const { decision, board, busy, artUrl, onDone } = props;
  const modes = decision.arrange!.modes!;
  const [ticked, setTicked] = useState<Record<string, number>>({});
  const source = sourceOf(board, decision);
  const name = decision.about?.name ?? source?.name ?? board.stack[0]?.name ?? "Modes";
  const paws = (i: number) => modes.paws[i] ?? 0;
  const already = modes.chosen.length;
  const count = already + Object.values(ticked).reduce((a, b) => a + b, 0);
  const used =
    (modes.spent ?? 0) +
    decision.options.reduce((sum, o, i) => sum + (ticked[o.label ?? ""] ?? 0) * paws(i), 0);
  const canAdd = (i: number) =>
    modes.budget != null ? used + paws(i) <= modes.budget : count < modes.num;
  const title = modesTitle(modes, count, used);
  const enough = count >= modes.min && count > 0;
  const plan = () =>
    decision.options.flatMap(
      (o) => Array(ticked[o.label ?? ""] ?? 0).fill(o.label ?? "") as string[],
    );
  return (
    <Bubble
      anchor={props.anchor}
      geometry={props.geometry}
      label={title}
      from={name}
      title={title}
      titleClass="gs-question-title"
      kind={decision.kind}
      picture={
        source && !beingCast(board, decision, source) ? (
          <Picture card={source} artUrl={artUrl} />
        ) : null
      }
      actions={
        <button
          type="button"
          className="gs-win-btn gs-win-btn-main gs-modes-done"
          disabled={busy || !enough}
          onClick={() => onDone(plan())}
        >
          {enough ? "Done" : `Pick ${Math.max(1, modes.min - count)} more`}
        </button>
      }
    >
      {modes.chosen.length > 0 && (
        <p className="gs-win-prompt">Chosen: {modes.chosen.join(" · ")}</p>
      )}
      {modes.escalate && (
        <p className="gs-win-prompt">
          Each mode after the first costs: <ManaText text={modes.escalate} />
        </p>
      )}
      <ul className="gs-win-list gs-modes">
        {decision.options.map((o, i) => {
          const label = o.label ?? o.actionId;
          const n = ticked[label] ?? 0;
          const open = canAdd(i);
          const set = (to: number) => setTicked((t) => ({ ...t, [label]: Math.max(0, to) }));
          return (
            <li key={o.actionId}>
              {modes.repeat ? (
                <div
                  className={`gs-mode${n ? " gs-mode-on" : ""}${!open && !n ? " gs-mode-off" : ""}`}
                >
                  <span className="gs-mode-words">
                    <ManaText text={label} />
                    {paws(i) > 0 && (
                      <small>
                        {" "}
                        · {paws(i)} paw {paws(i) === 1 ? "print" : "prints"}
                      </small>
                    )}
                  </span>
                  <span className="gs-win-stepper">
                    <button
                      type="button"
                      className="gs-win-chip-btn"
                      aria-label={`One less: ${label}`}
                      disabled={busy || n === 0}
                      onClick={() => set(n - 1)}
                    >
                      −
                    </button>
                    <b>{n}</b>
                    <button
                      type="button"
                      className="gs-win-chip-btn"
                      aria-label={`One more: ${label}`}
                      disabled={busy || !open}
                      onClick={() => set(n + 1)}
                    >
                      +
                    </button>
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  className={`gs-option gs-mode${n ? " gs-mode-on" : ""}${!open && !n ? " gs-mode-off" : ""}`}
                  aria-pressed={n > 0}
                  disabled={busy || (!open && !n)}
                  onClick={() => set(n ? 0 : 1)}
                >
                  <span className="gs-mode-tick" aria-hidden="true">
                    {n ? "✓" : ""}
                  </span>
                  <span className="gs-mode-words">
                    <ManaText text={label} />
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Bubble>
  );
}
