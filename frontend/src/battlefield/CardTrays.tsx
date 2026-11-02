// PHASE_09 group 3 (owner 2026-11-01, canvas
// https://claude.ai/artifact/YYJjyLHDPYwmv5cRyxCDSR) -- the trays where you
// handle cards nobody else sees, all in the W-00 tray from the bottom, the
// cards as pictures:
//
// W-07  putting cards back in order (Ponder, Sensei's Divining Top,
//       Impulse's rest): click them in the order they go -- a gold number
//       each; a numbered card clicked again is taken back, with the ones
//       after it. Ponder: "Shuffle instead". The bottom: "Any order".
// W-08  scry and surveil: two rows, top and bottom (or graveyard); a click
//       moves a card across; two or more on top are numbered in draw
//       order, "Sooner" moves one up. One window for the cards and their
//       order.
// W-09  choosing from a hidden zone (a search, the top few, another
//       player's hand): one picture per card with a count, lands last,
//       search and filters for a library; cards that can't be chosen
//       dimmed, with why.
// W-10  Fact or Fiction: the split (click a card to move it between the
//       piles) and the choice (the two piles, "Take this pile").
//
// Where the game asks one card at a time, the tray asks once and hands
// the page a plan (cardPlans.ts) that answers the rest.

import { useMemo, useState } from "react";
import type { Decision, Snapshot, SnapshotCard } from "../match";
import { Tray } from "./GameWindow";
import type { Geometry } from "./layout";
import { BigCard } from "./QuestionWindows";
import {
  DAMAGE_TO_PLAYER,
  askingName,
  cardGroups,
  damageSteps,
  usualSplit,
  notOffered,
  orderSteps,
  placeWords,
  plainPrompt,
  rowSteps,
  splitSteps,
  type PlanStep,
} from "./cardPlans";

interface TrayProps {
  decision: Decision;
  board: Snapshot;
  geometry: Geometry;
  busy: boolean;
  artUrl: (art: string) => string;
  onAnswer: (actionId: string | null) => void;
  /** Answers for this question and the ones that follow from it. */
  onPlan: (steps: PlanStep[]) => void;
}

/** The cards a question shows, in its order, and which of them are still open. */
function cardsOf(decision: Decision) {
  const open = new Set(decision.options.map((o) => o.objectId).filter((id): id is string => !!id));
  return { cards: decision.looking, open };
}

function Tile({
  card,
  artUrl,
  num,
  many,
  caption,
  small,
  disabled,
  pressed,
  label,
  onClick,
}: {
  card: SnapshotCard;
  artUrl: (art: string) => string;
  num?: number | null;
  many?: number;
  caption?: string | null;
  small?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`gs-win-tile${small ? " gs-win-tile-small" : ""}`}
      disabled={disabled}
      aria-pressed={pressed}
      aria-label={label ?? card.name}
      data-object-id={card.id}
      onClick={onClick}
    >
      {num != null && <span className="gs-win-tile-num">{num}</span>}
      {many != null && many > 1 && <span className="gs-win-tile-many">×{many}</span>}
      <BigCard card={card} artUrl={artUrl} small={small ?? false} />
      <span className="gs-win-tile-name">{card.name}</span>
      {caption && <span className="gs-win-tile-caption">{caption}</span>}
    </button>
  );
}

function MainButton({
  busy,
  disabled,
  onClick,
  children,
}: {
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className="gs-win-btn gs-win-btn-main"
      disabled={busy || disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function QuietButton({
  busy,
  onClick,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button type="button" className="gs-win-btn gs-win-btn-quiet" disabled={busy} onClick={onClick}>
      {children}
    </button>
  );
}

/** W-07 -- put cards in order: click them in the order they go. */
export function OrderCardsTray(props: TrayProps) {
  const { decision, board, busy, artUrl } = props;
  const { cards, open } = cardsOf(decision);
  const choosable = cards.filter((c) => open.has(c.id));
  const [numbered, setNumbered] = useState<string[]>([]);
  // Scry's and surveil's second half ("which goes on top?") is to the top.
  const ordering = decision.kind === "orderMoveToZoneList";
  const to = ordering ? (decision.arrange?.to ?? null) : "top";
  const first = ordering ? (decision.arrange?.first ?? "top") : "top";
  const shuffle = decision.arrange?.shuffle === true;
  const name = askingName(board, decision);
  const click = (id: string) =>
    setNumbered((list) => {
      const at = list.indexOf(id);
      if (at >= 0) return list.slice(0, at);
      const next = [...list, id];
      // The last one has only one place left.
      const rest = choosable.filter((c) => !next.includes(c.id));
      return rest.length === 1 ? [...next, rest[0]!.id] : next;
    });
  const done = numbered.length === choosable.length;
  const thenNo: PlanStep[] = shuffle ? [{ kind: "confirmAction", yes: false }] : [];
  const title =
    to === "top"
      ? "Put them back in order"
      : to === "bottom"
        ? "Put them on the bottom"
        : to === "graveyard"
          ? "The order they go to your graveyard"
          : "Put them in order";
  const prompt =
    to === "top"
      ? "Click them in the order you'll draw them: 1 is the top card. Click a numbered card to take it back."
      : to === "bottom" && first === "bottom"
        ? "Click them in order: 1 goes to the very bottom. Or Any order. Click a numbered card to take it back."
        : to === "bottom"
          ? "Click them in order: 1 goes highest of them. Or Any order. Click a numbered card to take it back."
          : "Click them in the order they go: 1 goes first. Click a numbered card to take it back.";
  return (
    <Tray
      geometry={props.geometry}
      label={title}
      from={name ? `${name} · only you see these` : "Only you see these"}
      title={title}
      kind={decision.kind}
      prompt={prompt}
      actions={
        <>
          {shuffle && (
            <QuietButton
              busy={busy}
              onClick={() =>
                props.onPlan([
                  ...orderSteps(
                    decision.kind,
                    choosable.map((c) => c.id),
                  ),
                  { kind: "confirmAction", yes: true },
                ])
              }
            >
              Shuffle instead
            </QuietButton>
          )}
          {to === "bottom" && (
            <QuietButton
              busy={busy}
              onClick={() =>
                props.onPlan(
                  orderSteps(
                    decision.kind,
                    choosable.map((c) => c.id),
                  ),
                )
              }
            >
              Any order
            </QuietButton>
          )}
          <MainButton
            busy={busy}
            disabled={!done}
            onClick={() => props.onPlan([...orderSteps(decision.kind, numbered), ...thenNo])}
          >
            Done
          </MainButton>
        </>
      }
    >
      <div className="gs-win-tiles">
        {choosable.map((card) => {
          const at = numbered.indexOf(card.id);
          return (
            <Tile
              key={card.id}
              card={card}
              artUrl={artUrl}
              num={at >= 0 ? at + 1 : null}
              caption={at >= 0 ? placeWords(at, to, first) : null}
              pressed={at >= 0}
              disabled={busy}
              label={`${card.name}${at >= 0 ? `, number ${at + 1}` : ""}`}
              onClick={() => click(card.id)}
            />
          );
        })}
      </div>
    </Tray>
  );
}

/** W-08 -- scry and surveil: two rows, top and the other. */
export function RowsTray(props: TrayProps) {
  const { decision, board, busy, artUrl } = props;
  const { cards, open } = cardsOf(decision);
  const single = decision.options.every((o) => !o.objectId);
  // Cards already sent away (a scry asked again part way) stay there.
  const gone = single ? [] : cards.filter((c) => !open.has(c.id)).map((c) => c.id);
  const [top, setTop] = useState<string[]>(() =>
    cards.filter((c) => !gone.includes(c.id)).map((c) => c.id),
  );
  const [away, setAway] = useState<string[]>([]);
  const surveil = decision.kind === "arrangeForSurveil" || decision.arrange?.to === "graveyard";
  const other = surveil ? "Graveyard" : "Bottom of library";
  const name = askingName(board, decision);
  const count = cards.length;
  const title = `${surveil ? "Surveil" : "Scry"} ${count}`;
  const byId = (id: string) => cards.find((c) => c.id === id)!;
  const move = (id: string) => {
    if (top.includes(id)) {
      setTop((list) => list.filter((x) => x !== id));
      setAway((list) => [...list, id]);
    } else {
      setAway((list) => list.filter((x) => x !== id));
      setTop((list) => [...list, id]);
    }
  };
  const sooner = (i: number) =>
    setTop((list) => {
      const next = [...list];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return next;
    });
  const finish = () => {
    if (single) {
      // One card: the game's own two answers, top first.
      const o = decision.options[top.length > 0 ? 0 : 1];
      if (o) props.onAnswer(o.actionId);
      return;
    }
    const still = cards.filter((c) => open.has(c.id)).map((c) => c.id);
    props.onPlan(rowSteps(decision.kind, still, away, top));
  };
  return (
    <Tray
      geometry={props.geometry}
      label={title}
      from={name ? `${name} · only you see these` : "Only you see these"}
      title={title}
      kind={decision.kind}
      prompt={`Click a card to move it to the other row.${top.length > 1 ? " On top, 1 is drawn first: Sooner moves a card up." : ""}`}
      actions={
        <MainButton busy={busy} onClick={finish}>
          Done
        </MainButton>
      }
    >
      <div className="gs-win-rows">
        <div className="gs-win-row" aria-label="Top of library">
          <span className="gs-win-row-name">
            Top of library{top.length > 1 ? " · in draw order" : ""}
          </span>
          <div className="gs-win-tiles">
            {top.map((id, i) => (
              <div key={id} className="gs-win-row-slot">
                <Tile
                  card={byId(id)}
                  artUrl={artUrl}
                  small
                  num={top.length > 1 ? i + 1 : null}
                  disabled={busy}
                  label={`${byId(id).name}, on top${top.length > 1 ? `, number ${i + 1}` : ""}`}
                  onClick={() => move(id)}
                />
                {top.length > 1 && i > 0 && (
                  <button
                    type="button"
                    className="gs-win-chip-btn"
                    disabled={busy}
                    onClick={() => sooner(i)}
                  >
                    ◀ Sooner
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className={`gs-win-row${surveil ? " gs-win-row-grave" : ""}`} aria-label={other}>
          <span className="gs-win-row-name">{other}</span>
          <div className="gs-win-tiles">
            {[...gone, ...away].map((id) => (
              <Tile
                key={id}
                card={byId(id)}
                artUrl={artUrl}
                small
                disabled={busy || gone.includes(id)}
                label={`${byId(id).name}, ${surveil ? "to the graveyard" : "to the bottom"}`}
                onClick={() => move(id)}
              />
            ))}
          </div>
        </div>
      </div>
    </Tray>
  );
}

/** W-09 -- choosing from a hidden zone: one picture per card, with a count. */
export function HiddenZoneTray(props: TrayProps) {
  const { decision, board, busy, artUrl } = props;
  const { cards, open } = cardsOf(decision);
  const offered = cards.filter((c) => open.has(c.id));
  const zone = decision.arrange?.zone ?? "library";
  // Another player's hand: the cards it showed that are not offered, dimmed.
  const shownOnly = useMemo(() => {
    if (zone !== "hand" || !board.reveal) return [];
    const left = new Map<string, number>();
    for (const c of offered) left.set(c.name, (left.get(c.name) ?? 0) + 1);
    return board.reveal.cards.filter((c) => {
      const n = left.get(c.name) ?? 0;
      if (n > 0) {
        left.set(c.name, n - 1);
        return false;
      }
      return true;
    });
  }, [zone, board.reveal, offered]);
  const few = zone === "hand" || cards.length <= 7;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "spells" | "lands">("all");
  const groups = few
    ? [
        ...offered.map((card) => ({ card, ids: [card.id], why: null as string | null })),
        ...shownOnly.map((card) => ({ card, ids: [] as string[], why: notOffered(card, offered) })),
      ]
    : cardGroups(offered);
  const q = query.trim().toLowerCase();
  const shown = groups.filter(
    (g) =>
      (!q || g.card.name.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "lands") === /\bLand\b/.test(g.card.types)),
  );
  const name = askingName(board, decision);
  const several = decision.kind === "chooseEntitiesForEffect";
  const title =
    zone === "hand"
      ? "Choose a card from their hand"
      : few
        ? "Choose from these"
        : "Search your library";
  // Search and filters for a library; Spells / Lands only when there are both.
  const mixed =
    groups.some((g) => /\bLand\b/.test(g.card.types)) &&
    groups.some((g) => !/\bLand\b/.test(g.card.types));
  // The game's own word for declining ("up to 1, or pass"); Done once
  // something is chosen.
  const chosenAny = cards.some((c) => !open.has(c.id));
  const passWord =
    several && chosenAny
      ? "Done"
      : zone === "library" && !few && !several
        ? "Find nothing"
        : "Pass";
  return (
    <Tray
      geometry={props.geometry}
      label={title}
      from={name ? `${name} · only you see these` : "Only you see these"}
      title={title}
      kind={decision.kind}
      prompt={plainPrompt(decision.prompt, name)}
      actions={
        !decision.mandatory ? (
          <button
            type="button"
            className="gs-win-btn gs-win-btn-quiet"
            disabled={busy}
            onClick={() => props.onAnswer(null)}
          >
            {passWord}
          </button>
        ) : null
      }
    >
      {!few && (
        <div className="gs-win-filters">
          <input
            className="gs-win-search"
            type="search"
            placeholder={`Search ${offered.length} cards…`}
            aria-label="Search the cards"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {(mixed ? (["all", "spells", "lands"] as const) : []).map((f) => (
            <button
              key={f}
              type="button"
              className="gs-win-chip-btn"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "All" : f === "spells" ? "Spells" : "Lands"}
            </button>
          ))}
        </div>
      )}
      <div className={`gs-win-tiles${few ? "" : " gs-win-tiles-scroll"}`}>
        {shown.map((g) => {
          const option = decision.options.find((o) => o.objectId && g.ids.includes(o.objectId));
          return (
            <Tile
              key={g.ids[0] ?? `${g.card.id}-${g.card.name}`}
              card={g.card}
              artUrl={artUrl}
              small={!few || groups.length > 4}
              many={g.ids.length}
              caption={g.why}
              disabled={busy || !option}
              label={`${g.card.name}${g.ids.length > 1 ? ` ×${g.ids.length}` : ""}${g.why ? `, ${g.why}` : ""}`}
              onClick={() => option && props.onAnswer(option.actionId)}
            />
          );
        })}
      </div>
    </Tray>
  );
}

/** W-10 -- Fact or Fiction's split: click a card to move it between the piles. */
export function SplitTray(props: TrayProps) {
  const { decision, board, busy, artUrl } = props;
  const { cards, open } = cardsOf(decision);
  // Picked already (asked again part way): in pile 1 for good.
  const locked = cards.filter((c) => !open.has(c.id)).map((c) => c.id);
  const [two, setTwo] = useState<string[]>([]);
  const one = cards.filter((c) => !two.includes(c.id)).map((c) => c.id);
  const byId = (id: string) => cards.find((c) => c.id === id)!;
  const name = askingName(board, decision) ?? "The spell";
  const caster = board.players.find((p) => p.seat === board.stack[0]?.controller)?.name;
  const pile = (label: string, ids: string[]) => (
    <div className="gs-win-pile" aria-label={label}>
      <span className="gs-win-row-name">
        {label} · {ids.length} card{ids.length === 1 ? "" : "s"}
      </span>
      <div className="gs-win-tiles">
        {ids.length === 0 && <span className="gs-win-pile-empty">empty</span>}
        {ids.map((id) => (
          <Tile
            key={id}
            card={byId(id)}
            artUrl={artUrl}
            small
            disabled={busy || locked.includes(id)}
            label={`${byId(id).name}, in ${label.toLowerCase()}`}
            onClick={() =>
              setTwo((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))
            }
          />
        ))}
      </div>
    </div>
  );
  return (
    <Tray
      geometry={props.geometry}
      label="Split these into two piles"
      from={caster ? `${name} · ${caster}'s spell` : name}
      title="Split these into two piles"
      kind={decision.kind}
      prompt={`Click a card to move it to the other pile. ${caster ?? "The caster"} takes one pile; the other goes to their graveyard.`}
      actions={
        <MainButton
          busy={busy}
          onClick={() =>
            props.onPlan(
              splitSteps(
                decision.kind,
                cards.filter((c) => open.has(c.id)).map((c) => c.id),
                one,
              ),
            )
          }
        >
          Done
        </MainButton>
      }
    >
      <div className="gs-win-piles">
        {pile("Pile 1", one)}
        {pile("Pile 2", two)}
      </div>
    </Tray>
  );
}

/** W-10 -- choose a pile: both as pictures, "Take this pile" under each. */
export function PilesTray(props: TrayProps) {
  const { decision, board, busy, artUrl } = props;
  const piles = decision.arrange?.piles ?? [];
  const byId = (id: string) => decision.looking.find((c) => c.id === id);
  const name = askingName(board, decision) ?? "Choose a pile";
  return (
    <Tray
      geometry={props.geometry}
      label="Choose a pile"
      from={name}
      title="Choose a pile"
      kind={decision.kind}
      prompt="You put that pile into your hand; the other goes to your graveyard."
      actions={null}
    >
      <div className="gs-win-piles">
        {piles.map((pile, i) => {
          const option = decision.options[i];
          const label = `Pile ${i + 1}`;
          const hidden = pile.count - pile.cards.length;
          return (
            <div key={label} className="gs-win-pile" aria-label={label}>
              <span className="gs-win-row-name">
                {label} · {pile.count} card{pile.count === 1 ? "" : "s"}
                {hidden > 0 ? ` (${hidden} face down)` : ""}
              </span>
              <div className="gs-win-tiles">
                {pile.count === 0 && <span className="gs-win-pile-empty">empty</span>}
                {pile.cards.map((id) => {
                  const card = byId(id);
                  return card ? (
                    <div key={id} className="gs-win-tile gs-win-tile-small">
                      <BigCard card={card} artUrl={artUrl} small />
                      <span className="gs-win-tile-name">{card.name}</span>
                    </div>
                  ) : null;
                })}
              </div>
              {option && (
                <MainButton busy={busy} onClick={() => props.onAnswer(option.actionId)}>
                  Take this pile
                </MainButton>
              )}
            </div>
          );
        })}
      </div>
    </Tray>
  );
}

/** "Grizzly Bears — 2/2 — 1 so far": the points a blocker already has. */
function soFar(label: string | null): number {
  const m = /(\d+) so far/.exec(label ?? "");
  return m ? Number(m[1]) : 0;
}

/**
 * Item 5 (owner 2026-11-01) -- combat damage among two or more blockers,
 * in one tray: the attacker and its blockers as pictures, each with what it
 * needs to die; filled in the usual way (lethal to each in order, the rest
 * to the last, or to the player with trample); + and - move points; Done
 * when none is left. Trample reaches the player only once every blocker
 * has lethal (CR 702.19c). The game's one-point questions are answered
 * from the split.
 */
export function DamageTray(props: TrayProps) {
  const { decision, board, busy, artUrl } = props;
  const fight = decision.arrange!.damage!;
  // Asked again part way (a plan stopped): only what is left to give.
  const given = fight.blockers.map((b) =>
    soFar(decision.options.find((o) => o.objectId === b.card)?.label ?? null),
  );
  const givenPlayer = soFar(
    decision.options.find((o) => o.actionId === DAMAGE_TO_PLAYER)?.label ?? null,
  );
  const total = fight.damage - given.reduce((a, b) => a + b, 0) - givenPlayer;
  const needs = fight.blockers.map((b, i) => Math.max(0, b.lethal - given[i]!));
  const toPlayer = fight.trample || fight.divides;
  const [split, setSplit] = useState(() =>
    usualSplit({
      ...fight,
      damage: total,
      blockers: fight.blockers.map((b, i) => ({ ...b, lethal: needs[i]! })),
    }),
  );
  const left = total - split.blockers.reduce((a, b) => a + b, 0) - split.player;
  const allLethal = split.blockers.every((n, i) => n >= needs[i]!);
  const valid = left === 0 && (split.player === 0 || fight.divides || allLethal);
  const cardOf = (id: string | null) => board.battlefield.find((c) => c.id === id) ?? null;
  const attacker = cardOf(fight.attacker);
  const defender = board.players.find((p) => p.seat !== board.seat);
  const move = (i: number | "player", by: number) =>
    setSplit((now) => {
      const next = { blockers: [...now.blockers], player: now.player };
      if (i === "player") next.player = Math.max(0, next.player + by);
      else next.blockers[i] = Math.max(0, next.blockers[i]! + by);
      return next;
    });
  const stepper = (i: number | "player", value: number, canAdd: boolean) => (
    <span className="gs-win-stepper">
      <button
        type="button"
        className="gs-win-chip-btn"
        aria-label="One less"
        disabled={busy || value === 0}
        onClick={() => move(i, -1)}
      >
        −
      </button>
      <b aria-live="polite">{value}</b>
      <button
        type="button"
        className="gs-win-chip-btn"
        aria-label="One more"
        disabled={busy || left <= 0 || !canAdd}
        onClick={() => move(i, 1)}
      >
        +
      </button>
    </span>
  );
  const name = attacker?.name ?? askingName(board, decision) ?? "Your attacker";
  return (
    <Tray
      geometry={props.geometry}
      label="Assign combat damage"
      from={`${name} · ${total} damage`}
      title="Assign combat damage"
      kind={decision.kind}
      prompt={
        fight.trample
          ? "Filled in: lethal to each blocker, the rest to the player (trample). + and − to change it."
          : "Filled in: lethal to each blocker in order, the rest to the last. + and − to change it."
      }
      actions={
        <>
          <span className={`gs-win-left${left === 0 ? " gs-win-left-done" : ""}`}>
            Damage left: {left}
          </span>
          <MainButton
            busy={busy}
            disabled={!valid}
            onClick={() =>
              props.onPlan(
                damageSteps(
                  decision.kind,
                  fight.blockers.map((b) => b.card),
                  split,
                ),
              )
            }
          >
            Done
          </MainButton>
        </>
      }
    >
      <div className="gs-win-tiles gs-win-damage">
        {fight.blockers.map((b, i) => {
          const card = cardOf(b.card);
          const n = split.blockers[i]!;
          return (
            <div key={b.card} className="gs-win-damage-one" data-object-id={b.card}>
              {card ? (
                <div
                  className="gs-win-tile gs-win-tile-small"
                  aria-label={`${card.name}, needs ${needs[i]}`}
                >
                  <BigCard card={card} artUrl={artUrl} small />
                  <span className="gs-win-tile-name">{card.name}</span>
                </div>
              ) : null}
              <span className={`gs-win-tile-caption${n >= needs[i]! ? " gs-win-lethal" : ""}`}>
                needs {needs[i]}
                {n >= needs[i]! ? " ✓" : ""}
              </span>
              {stepper(i, n, true)}
            </div>
          );
        })}
        {toPlayer && (
          <div className="gs-win-damage-one" data-object-id="player">
            <div className="gs-win-damage-player">
              <b>{defender?.name ?? "Defending player"}</b>
              <span>{defender ? `${defender.life} life` : ""}</span>
            </div>
            <span className="gs-win-tile-caption">
              {fight.divides || allLethal
                ? fight.trample
                  ? "trample: the rest"
                  : "any of it"
                : "after lethal to each blocker"}
            </span>
            {stepper("player", split.player, fight.divides || allLethal)}
          </div>
        )}
      </div>
    </Tray>
  );
}
