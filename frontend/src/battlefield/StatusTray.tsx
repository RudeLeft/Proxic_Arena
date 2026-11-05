// Spec 0038 -- each player's status tray: floating mana, counters, held
// markers and the command zone, in one row beside the player's plate.
// Phase 9 W-21 (Amendment 18, owner 2026-11-05) -- its list:
//
//   - the row uses SHORT names ("Liliana emblem", "Undercity · Secret
//     Entrance", "The Ring ×2"), and always shows at least one thing --
//     never a lone "+N";
//   - a click on a marker, a command-zone chip or "+N" opens ONE list,
//     beside the tray (left of the right-hand column, pointing at it), so
//     it never covers the turn steps, the action button or a plate;
//   - the list says names AND what they do: a held marker's rule in plain
//     words, an emblem's and a dungeon room's words from the game, the
//     Ring's four abilities with the ones earned lit;
//   - Esc, a click anywhere else or the chip again closes it; opening one
//     player's list closes the other's; Space or Peek fades it.

import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import type { CommandWords, Snapshot } from "../match";
import { PeekButton, usePeek } from "./GameWindow";
import { ManaText, symbolUrl } from "./ManaCost";

type Player = Snapshot["players"][number];

/** Spec 0038 — floating mana in WUBRG order, then colourless. */
const MANA_ORDER = ["W", "U", "B", "R", "G", "C"] as const;
/** Spec 0038 — a counter's dot, by Forge's name; any other counter is grey. */
const COUNTER_DOT: Record<string, string> = {
  poison: "#6fbf4a",
  energy: "#e8c547",
  experience: "#8fb3e8",
  rad: "#9fe05a",
  ticket: "#e0905a",
  tickets: "#e0905a",
};
/** Spec 0038 — a tray's one row, in the rail's units: 216 less padding. */
const TRAY_ROOM = 198;
const TRAY_GAP = 6;
/** About how wide an item is drawn, from its words: a chip's padding,
 * border and dot, then ~6.6 per letter at the chips' size. */
const itemWidth = (text: string, dot: boolean) => 16 + (dot ? 12 : 0) + text.length * 6.6;
/** "monarch" → "Monarch": Forge names a designation in lower case. */
const titled = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * W-21 -- a held marker's rule, in plain words. The rules' own, not a
 * card's: they never change.
 */
export const HELD_WORDS: Record<string, string> = {
  monarch: "You draw a card at the end of your turn. Combat damage to you takes it.",
  initiative: "Venture into the Undercity each upkeep. Combat damage to you takes it.",
  "city's blessing": "Yours for the rest of the game: cards with ascend count it.",
};

/** W-21 -- the Ring's four abilities (rule 701.54c), earned one per temptation. */
export const RING_WORDS = [
  "Your Ring-bearer is legendary and can't be blocked by creatures with greater power.",
  "Whenever your Ring-bearer attacks, draw a card, then discard a card.",
  "Whenever your Ring-bearer becomes blocked by a creature, that creature's controller sacrifices it at end of combat.",
  "Whenever your Ring-bearer deals combat damage to a player, each opponent loses 3 life.",
];

/** "Emblem — Liliana, Defiant Necromancer" → "Liliana emblem"; "Undercity (room: Lost Well)" → "Undercity · Lost Well". */
export function shortName(thing: string): string {
  const emblem = /^Emblem\s*[—–-]\s*(.+)$/.exec(thing);
  if (emblem) return `${emblem[1]!.split(",")[0]!.trim()} emblem`;
  const room = /^(.+?) \(room: (.+)\)$/.exec(thing);
  if (room) return `${room[1]} · ${room[2]}`;
  return thing;
}

/** "Emblem — Liliana, Defiant Necromancer" → "Liliana, Defiant Necromancer's emblem". */
function fullName(thing: string): string {
  const emblem = /^Emblem\s*[—–-]\s*(.+)$/.exec(thing);
  if (emblem) return `${emblem[1]!.trim()}'s emblem`;
  const room = /^(.+?) \(room: (.+)\)$/.exec(thing);
  if (room) return room[1]!;
  return thing;
}

function manaText(pool: Record<string, number>): string {
  return Object.entries(pool)
    .map(([colour, n]) => `${n} ${colour}`)
    .join(" · ");
}

// One list open on the whole page: opening one player's closes the other's.
let openSeat: number | null = null;
const openWatchers = new Set<() => void>();
function setOpenSeat(seat: number | null) {
  if (seat === openSeat) return;
  openSeat = seat;
  for (const watcher of openWatchers) watcher();
}
const watchOpen = (watcher: () => void) => {
  openWatchers.add(watcher);
  return () => openWatchers.delete(watcher);
};

/** Spec 0038 + W-21 -- a player's status tray and its list. */
export function StatusTray({ player, side }: { player: Player; side: "opponent" | "viewer" }) {
  const open =
    useSyncExternalStore(
      watchOpen,
      () => openSeat,
      () => null,
    ) === player.seat;
  const toggle = () => setOpenSeat(open ? null : player.seat);
  const peek = usePeek(open);
  const tray = useRef<HTMLDivElement | null>(null);

  // Esc, or a click anywhere outside this tray and its list, closes it.
  useEffect(() => {
    if (!open) return undefined;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenSeat(null);
    };
    const away = (event: PointerEvent) => {
      if (!tray.current?.contains(event.target as Node)) setOpenSeat(null);
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", away, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", away, true);
    };
  }, [open]);
  // A list left open when the tray goes (the game ends) does not linger.
  useEffect(() => () => setOpenSeat(null), []);

  const mana = MANA_ORDER.filter((c) => (player.manaPool[c] ?? 0) > 0);
  const counters = player.counters.map((c) => `${c.count} ${c.name.toLowerCase()}`);
  const ringHeld = player.command.some((thing) => thing === "The Ring");
  const chip = (key: string, className: string, text: string, label?: string) => (
    <button
      type="button"
      className={`gs-chip ${className}`}
      key={key}
      aria-expanded={open}
      aria-label={label}
      onClick={toggle}
    >
      {text}
    </button>
  );
  const items: { key: string; width: number; node: ReactNode }[] = [
    ...mana.map((c) => ({
      key: `mana:${c}`,
      width: 26 + 9 * String(player.manaPool[c]).length,
      node: (
        <span className="gs-mana" key={`mana:${c}`}>
          <img src={symbolUrl(c)} alt={c} draggable={false} />
          {player.manaPool[c]}
        </span>
      ),
    })),
    ...player.counters.map((c) => ({
      key: `counter:${c.name}`,
      width: itemWidth(`${c.count} ${c.name}`, true),
      node: (
        <span
          className="gs-chip"
          key={`counter:${c.name}`}
          style={{ "--dot": COUNTER_DOT[c.name.toLowerCase()] } as CSSProperties}
        >
          <span className="gs-chip-dot" aria-hidden="true" />
          {c.count} {c.name.toLowerCase()}
        </span>
      ),
    })),
    ...[
      ...player.designations,
      // The Ring held shows once, as the command-zone chip with its count.
      ...(player.ringTempted > 0 && !ringHeld ? [`Ring ×${player.ringTempted}`] : []),
    ].map((d) => ({
      key: `marker:${d}`,
      width: itemWidth(d, false),
      node: chip(`marker:${d}`, "gs-chip-marker", titled(d)),
    })),
    ...player.command.map((thing, i) => {
      const text =
        thing === "The Ring" && player.ringTempted > 0
          ? `The Ring ×${player.ringTempted}`
          : shortName(thing);
      return {
        key: `command:${i}`,
        width: itemWidth(text, false),
        node: chip(`command:${i}`, "gs-chip-zone", text),
      };
    }),
  ];
  // As many as fit in the row; the rest behind "+N" (room kept for it).
  // Never a lone "+N": the first thing always shows, cut short if it must be.
  const total = items.reduce((sum, item, i) => sum + item.width + (i ? TRAY_GAP : 0), 0);
  const fits = total <= TRAY_ROOM;
  const shown: typeof items = [];
  let used = itemWidth("+9", false) + TRAY_GAP;
  for (const item of fits ? [] : items) {
    if (shown.length > 0 && used + item.width > TRAY_ROOM) break;
    shown.push(item);
    used += item.width + TRAY_GAP;
  }
  if (fits) shown.push(...items);
  // The plates' old line, word for word, for a screen reader.
  const said = [
    [
      ...counters,
      ...player.designations.map((d) => `· ${d.toLowerCase()}`),
      ...(mana.length > 0 ? [`mana ${manaText(player.manaPool)}`] : []),
    ].join("  "),
    player.command.length > 0
      ? `command zone: ${player.command.join(", ")}${player.ringTempted > 0 ? ` · the Ring has tempted ${player.ringTempted}×` : ""}`
      : "",
  ]
    .filter(Boolean)
    .join(". ");
  return (
    <div
      ref={tray}
      className={`gs-status gs-status-${side}${items.length > 0 ? " gs-status-on" : ""}`}
      data-seat={player.seat}
    >
      {said && <span className="pa-visually-hidden">{`${player.name}: ${said}`}</span>}
      {shown.map((item) => item.node)}
      {!fits && items.length > shown.length && (
        <button
          type="button"
          className="gs-chip gs-chip-more"
          aria-expanded={open}
          aria-label={`${items.length - shown.length} more: list everything`}
          onClick={toggle}
        >
          +{items.length - shown.length}
        </button>
      )}
      {open && (
        <StatusList
          player={player}
          side={side}
          peek={peek}
          mana={mana}
          onClose={() => setOpenSeat(null)}
        />
      )}
    </div>
  );
}

/** W-21 -- the list: grouped, each thing once, with what it does. */
function StatusList({
  player,
  side,
  peek,
  mana,
  onClose,
}: {
  player: Player;
  side: "opponent" | "viewer";
  peek: boolean;
  mana: readonly string[];
  onClose: () => void;
}) {
  const yours = side === "viewer";
  const words = player.commandWords ?? [];
  const held = player.designations;
  return (
    <div
      className={`gs-status-list${peek ? " gs-win-peek" : ""}`}
      role="dialog"
      aria-label={`${player.name}: everything in play for ${yours ? "you" : "them"}`}
    >
      <span className="gs-status-pointer" aria-hidden="true" />
      <div className="gs-status-body">
        <p className="gs-status-from">
          {player.name} · in play for {yours ? "you" : "them"}
        </p>
        {mana.length > 0 && (
          <section>
            <h3 className="gs-status-sec">Mana</h3>
            <p className="gs-status-line">
              {mana.map((c) => (
                <span className="gs-mana" key={c}>
                  <img src={symbolUrl(c)} alt={c} draggable={false} />
                  {player.manaPool[c]}
                </span>
              ))}
              <span className="gs-status-note">empties at the end of the step</span>
            </p>
          </section>
        )}
        {player.counters.length > 0 && (
          <section>
            <h3 className="gs-status-sec">Counters</h3>
            <p className="gs-status-line">
              {player.counters.map((c) => `${c.count} ${c.name.toLowerCase()}`).join(" · ")}
            </p>
          </section>
        )}
        {held.length > 0 && (
          <section>
            <h3 className="gs-status-sec">Held</h3>
            {held.map((d) => (
              <div key={d} className="gs-status-thing">
                <b>{titled(d)}</b>
                {HELD_WORDS[d.toLowerCase()] && (
                  <p className="gs-status-says">{HELD_WORDS[d.toLowerCase()]}</p>
                )}
              </div>
            ))}
          </section>
        )}
        {player.command.length > 0 && (
          <section>
            <h3 className="gs-status-sec">Command zone</h3>
            {player.command.map((thing, i) => (
              <CommandThing
                key={`${i}:${thing}`}
                thing={thing}
                words={words[i]?.name && thing.startsWith(words[i].name) ? words[i] : undefined}
                tempted={player.ringTempted}
              />
            ))}
          </section>
        )}
      </div>
      <div className="gs-status-foot">
        <PeekButton />
        <button type="button" className="gs-win-btn gs-win-btn-quiet" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

/** One command-zone piece: its full name and, from the game, what it does. */
function CommandThing({
  thing,
  words,
  tempted,
}: {
  thing: string;
  words: CommandWords | undefined;
  tempted: number;
}) {
  if (thing === "The Ring") {
    return (
      <div className="gs-status-thing">
        <b>The Ring</b>
        {tempted > 0 && ` · tempted ${tempted === 1 ? "once" : `${tempted} times`}`}
        <ul className="gs-status-ring">
          {RING_WORDS.map((line, i) => (
            <li key={line} className={i < tempted ? "gs-status-lit" : "gs-status-off"}>
              <span aria-hidden="true">{i < tempted ? "✓ " : "○ "}</span>
              <span className="pa-visually-hidden">{i < tempted ? "Earned: " : "Not yet: "}</span>
              {line}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const rooms = words?.rooms;
  if (rooms && rooms.length > 0) {
    const here = rooms.find((r) => r.here);
    const next = here ? rooms.filter((r) => here.next.includes(r.name)) : [];
    return (
      <div className="gs-status-thing">
        <b>{fullName(thing)}</b>
        {here && ` · in ${here.name}`}
        {here && (
          <p className="gs-status-says">
            {next.length === 0 ? (
              "The last room: the next venture completes it."
            ) : (
              <>
                Next:{" "}
                {next.map((r, i) => (
                  <span key={r.name}>
                    {i > 0 && " or "}
                    <b>{r.name}</b> (<ManaText text={r.says.replace(/\.$/, "")} />)
                  </span>
                ))}
              </>
            )}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="gs-status-thing">
      <b>{fullName(thing)}</b>
      {words?.says && (
        <p className="gs-status-says">
          <ManaText text={words.says} />
        </p>
      )}
    </div>
  );
}
