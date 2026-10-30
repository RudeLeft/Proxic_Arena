// The yes/no question, a trigger's target for many copies, and putting
// different triggers in order — PHASE_09 group 1 (W-04, W-05, W-06; owner
// 2026-10-30), in the W-00 frame (GameWindow.tsx).

import { useState } from "react";
import type { Decision, DecisionOption, Snapshot, SnapshotCard, TargetRef } from "../match";
import { CardFace, figure, lookOf, shortType } from "./Board";
import { SharpCard, closeUpOf } from "../closeUp";
import { Bubble, Tray } from "./GameWindow";
import type { Box, Geometry } from "./layout";
import { ManaText } from "./ManaCost";
import { abilityWords, confirmTitle, copiesOnStack, orderGroups, orderOf, yesNo } from "./triggers";

/** A card's picture, small, as the board draws it. */
function Picture({
  card,
  name,
  art,
  artUrl,
}: {
  card: SnapshotCard | null;
  name: string;
  art: string | null;
  artUrl: (art: string) => string;
}) {
  const look = lookOf(card?.kind ?? "other", card?.types ?? "");
  return (
    <div className={`bf-card bf-look-${look}`} aria-hidden="true">
      <CardFace
        name={card?.name ?? name}
        look={look}
        type={card ? shortType(card.types) : ""}
        pt={card ? figure(card) : ""}
        art={art ? artUrl(art) : null}
        faceDown={card?.faceDown ?? false}
        known={card?.known ?? true}
      />
    </div>
  );
}

/** Who or what a target is, in words. */
function targetName(board: Snapshot, ref: TargetRef): string {
  if ("player" in ref) {
    const player = board.players.find((p) => p.seat === ref.player);
    return ref.player === board.seat ? "you" : (player?.name ?? `seat ${ref.player}`);
  }
  return (
    [...board.battlefield, ...board.graveyard, ...board.exile].find((c) => c.id === ref.object)
      ?.name ?? "a card"
  );
}

/** The card a question is about: on the stack, else on the battlefield, by name. */
function sourceOf(
  board: Snapshot,
  name: string,
): { card: SnapshotCard | null; art: string | null } {
  const entry = board.stack.find((s) => s.name === name);
  const card =
    (entry?.source ? board.battlefield.find((c) => c.id === entry.source) : undefined) ??
    board.battlefield.find((c) => c.name === name) ??
    null;
  return { card, art: entry?.art ?? card?.art ?? null };
}

/**
 * W-04 — a yes/no question, beside the stack: the card asking, its
 * question as a title, what it would hit; "Yes to all N" when it is one of
 * N copies of one trigger on the stack.
 */
export function ConfirmWindow({
  decision,
  board,
  anchor,
  geometry,
  busy,
  artUrl,
  onAnswer,
  onYesToAll,
}: {
  decision: Decision;
  board: Snapshot;
  anchor: Box;
  geometry: Geometry;
  busy: boolean;
  artUrl: (art: string) => string;
  onAnswer: (actionId: string) => void;
  onYesToAll: (count: number, actionId: string) => void;
}) {
  const pair = yesNo(decision)!;
  const name = decision.about?.name ?? "";
  const copies = decision.kind === "confirmTrigger" && name ? copiesOnStack(board.stack, name) : 0;
  const top = name ? board.stack.find((s) => s.kind === "trigger" && s.name === name) : undefined;
  const source = name ? sourceOf(board, name) : null;
  const title = confirmTitle(pair.yes.label ?? "Yes");
  return (
    <Bubble
      anchor={anchor}
      geometry={geometry}
      label={title}
      from={copies > 1 ? `${name} · ${copies} on the stack` : name || "Confirm"}
      title={title}
      picture={
        source ? <Picture card={source.card} name={name} art={source.art} artUrl={artUrl} /> : null
      }
      actions={
        <>
          <button
            type="button"
            className="gs-win-btn gs-win-btn-quiet"
            disabled={busy}
            onClick={() => onAnswer(pair.no.actionId)}
          >
            No
          </button>
          {copies > 1 ? (
            <>
              <button
                type="button"
                className="gs-win-btn"
                disabled={busy}
                onClick={() => onAnswer(pair.yes.actionId)}
              >
                Just this one
              </button>
              <button
                type="button"
                className="gs-win-btn gs-win-btn-main"
                disabled={busy}
                onClick={() => onYesToAll(copies, pair.yes.actionId)}
              >
                Yes to all {copies}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="gs-win-btn gs-win-btn-main"
              disabled={busy}
              onClick={() => onAnswer(pair.yes.actionId)}
            >
              Yes
            </button>
          )}
        </>
      }
    >
      {top && top.targets.length > 0 && (
        <span className="gs-win-target">
          At {top.targets.map((t) => targetName(board, t)).join(" and ")}
        </span>
      )}
      {decision.prompt && (
        <p className="gs-win-prompt">
          <ManaText text={decision.prompt} />
        </p>
      )}
    </Bubble>
  );
}

/**
 * W-06 — the target of one of several copies of a trigger, beside the
 * stack, with "Same target for all N" (ticked to start, owner 2026-10-30).
 * The board can still be clicked instead.
 */
export function CopyTargetWindow({
  decision,
  board,
  anchor,
  geometry,
  busy,
  same,
  artUrl,
  onSame,
  onAnswer,
}: {
  decision: Decision;
  board: Snapshot;
  anchor: Box;
  geometry: Geometry;
  busy: boolean;
  same: boolean;
  artUrl: (art: string) => string;
  onSame: (same: boolean) => void;
  onAnswer: (actionId: string) => void;
}) {
  const about = decision.about!;
  const source = sourceOf(board, about.name);
  const first = (about.copy ?? 1) === 1;
  return (
    <Bubble
      anchor={anchor}
      geometry={geometry}
      label={`${about.name}: choose a target`}
      from={`${about.name} · trigger ${about.copy} of ${about.copies}`}
      title="Choose a target"
      picture={<Picture card={source.card} name={about.name} art={source.art} artUrl={artUrl} />}
      actions={null}
    >
      {decision.prompt && (
        <p className="gs-win-prompt">
          <ManaText text={decision.prompt} />
        </p>
      )}
      <div className="gs-win-chips">
        {decision.options.map((o) => (
          <button
            key={o.actionId}
            type="button"
            className="gs-win-chip"
            disabled={busy}
            onClick={() => onAnswer(o.actionId)}
          >
            <ManaText
              text={
                o.objectId === `player:${board.seat}`
                  ? `${o.label ?? "You"} (you)`
                  : (o.label ?? o.actionId)
              }
            />
          </button>
        ))}
      </div>
      {first && (
        <label className="gs-win-check">
          <input type="checkbox" checked={same} onChange={(e) => onSame(e.target.checked)} />
          Same target for all {about.copies}
        </label>
      )}
    </Bubble>
  );
}

/**
 * W-05 — different triggers at once: their cards in the tray, clicked in
 * the order they should resolve (the first clicked resolves first), then
 * Done. Forge then asks "which first" once per pick; the page answers each
 * from the order clicked.
 */
export function OrderTray({
  decision,
  board,
  geometry,
  busy,
  artUrl,
  onDone,
}: {
  decision: Decision;
  board: Snapshot;
  geometry: Geometry;
  busy: boolean;
  artUrl: (art: string) => string;
  onDone: (order: DecisionOption[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const options = decision.options;
  const groups = orderGroups(options);
  const done = picked.length >= groups.length - 1;
  return (
    <Tray
      geometry={geometry}
      label="Choose the order your triggers resolve in"
      from={`${options.length} triggers at once`}
      title="Which resolves first?"
      prompt="Click them in the order they should resolve: the first one you click resolves first."
      actions={
        <>
          <button
            type="button"
            className="gs-win-btn gs-win-btn-quiet"
            disabled={busy || picked.length === 0}
            onClick={() => setPicked([])}
          >
            Start over
          </button>
          <button
            type="button"
            className="gs-win-btn gs-win-btn-main"
            disabled={busy || !done}
            onClick={() => onDone(orderOf(groups, picked))}
          >
            Done
          </button>
        </>
      }
    >
      <div className="gs-win-tiles">
        {groups.map((group) => {
          const o = group.options[0]!;
          const card = o.objectId ? cardOfAny(board, o.objectId) : null;
          const name = card?.name ?? (o.label ?? "").split(" — ")[0] ?? "";
          const at = picked.indexOf(group.key);
          const many = group.options.length > 1 ? ` ×${group.options.length}` : "";
          return (
            <button
              key={group.key}
              type="button"
              className="gs-win-tile"
              disabled={busy || at >= 0}
              aria-label={`${name}${many}${at >= 0 ? `, number ${at + 1}` : ""}`}
              onClick={() => setPicked((list) => [...list, group.key])}
            >
              {at >= 0 && <span className="gs-win-tile-num">{at + 1}</span>}
              {many && <span className="gs-win-tile-many">{many.trim()}</span>}
              <BigCard
                card={card}
                name={name}
                words={abilityWords(o.label ?? "", name)}
                artUrl={artUrl}
              />
            </button>
          );
        })}
      </div>
    </Tray>
  );
}

/**
 * The card itself, large enough to read (owner 2026-10-30): its picture,
 * sharp; or, with no picture (a token, a deck imported without art), its
 * name, type and the ability's words on a plain card.
 */
function BigCard({
  card,
  name,
  words,
  artUrl,
}: {
  card: SnapshotCard | null;
  name: string;
  words: string;
  artUrl: (art: string) => string;
}) {
  if (card?.art) {
    return (
      <SharpCard
        className="gs-win-bigcard"
        low={artUrl(card.art)}
        high={closeUpOf(artUrl(card.art))}
        alt=""
      />
    );
  }
  return (
    <span className="gs-win-bigcard gs-win-bigcard-words">
      <b>{name}</b>
      {card && <i>{card.types}</i>}
      <span>
        <ManaText text={words} />
      </span>
    </span>
  );
}

function cardOfAny(board: Snapshot, id: string): SnapshotCard | null {
  return (
    [...board.battlefield, ...board.graveyard, ...board.exile, ...board.hand].find(
      (c) => c.id === id,
    ) ?? null
  );
}
