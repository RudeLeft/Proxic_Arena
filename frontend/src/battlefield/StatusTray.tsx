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

//
// Spec 0086 (owner 2026-11-13, canvas gaps-players-1113) -- the row as
// pictures: energy, experience, rad and tickets are round badges whose
// numbers step with a rising +N/-N (7 B); the city's blessing and the Ring's
// count are badges too (Amendment 1); a dungeon is a small map card whose
// marker steps room to room; an emblem is a square tile with its
// planeswalker's picture (8). The monarch and the initiative are on the face
// picture now (playerMarks.tsx FaceMarks), and still in the list. A mana
// chip's count steps up as each ball lands (11 A, poolHeld.ts).

import { sameProps } from "./sameProps";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { CommandWords, Snapshot, SnapshotEmblem } from "../match";
import { PeekFoot, usePeek } from "./GameWindow";
import { ManaText, symbolUrl } from "./ManaCost";
import {
  CountBadge,
  COUNT_LOOK,
  countKind,
  DungeonMap,
  EmblemTile,
  reducedMotion,
} from "./playerMarks";
import { heldPool, poolKey, usePoolHeld } from "./poolHeld";
import { paced } from "./motion";

type Player = Snapshot["players"][number];

/** Spec 0038 — floating mana in WUBRG order, then colourless. */
const MANA_ORDER = ["W", "U", "B", "R", "G", "C"] as const;
/** Spec 0038 — a tray's one row, in the rail's units: 216 less padding. */
const TRAY_ROOM = 198;
const TRAY_GAP = 6;
/** About how wide an item is drawn, from its words: a chip's padding,
 * border and dot, then ~6.6 per letter at the chips' size. */
const itemWidth = (text: string, dot: boolean) => 16 + (dot ? 12 : 0) + text.length * 6.6;
/** Spec 0086 -- a badge, a map card and an emblem tile, as game.css draws them. */
const BADGE_W = 26;
const MAP_CARD_W = 53;
const EMBLEM_W = 24;
/** "3 energy", "1 experience counter", "2 tickets": a badge's words. */
function countWords(name: string, count: number): string {
  const kind = countKind(name);
  const look = COUNT_LOOK[kind];
  if (!look || kind === "other") return `${count} ${name.toLowerCase()}`;
  return `${count} ${count === 1 ? look.one : look.many}`;
}
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
function StatusTrayView({
  player,
  side,
  spectating = false,
  emblems = [],
  artUrl,
}: {
  player: Player;
  side: "opponent" | "viewer";
  /** Spec 0067 -- a spectator's tray: nobody's "you". */
  spectating?: boolean;
  /** Spec 0086 -- the board's emblems, each with the card that made it (its picture). */
  emblems?: readonly SnapshotEmblem[];
  artUrl?: (art: string) => string;
}) {
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
  // Spec 0077 (A) -- poison is the badge by the life shield (PoisonBadge),
  // not a chip here; the tray keeps energy, experience and the rest.
  const kept = player.counters.filter((c) => c.name.toUpperCase() !== "POISON");
  const counters = kept.map((c) => `${c.count} ${c.name.toLowerCase()}`);
  // Spec 0086 (11 A) -- each chip less what is still flying in.
  usePoolHeld();
  const shownMana = (c: string) => (player.manaPool[c] ?? 0) - heldPool(poolKey(player.seat, c));
  // Spec 0086 -- what is new in the tray since the last board grows in.
  const seenKeys = useRef<Set<string> | null>(null);
  const fresh = (key: string) => seenKeys.current !== null && !seenKeys.current.has(key);
  const blessed = player.designations.some((d) => d.toLowerCase() === "city's blessing");
  const words = player.commandWords ?? [];
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
        // Spec 0062 -- spent, a ball leaves from here (data-pool). Spec 0086
        // -- its mana flies in: the count steps up as each ball lands (the
        // chip holds its place and shows from the first).
        <span
          className="gs-mana"
          key={`mana:${c}`}
          data-pool={`${player.seat}:${c}`}
          data-shown={shownMana(c)}
          style={shownMana(c) <= 0 ? { visibility: "hidden" } : undefined}
        >
          <img src={symbolUrl(c)} alt={c} draggable={false} />
          {Math.max(0, shownMana(c))}
        </span>
      ),
    })),
    // Spec 0086 (7 B) -- round picture badges, not word chips.
    ...kept.map((c) => ({
      key: `counter:${c.name}`,
      width: BADGE_W,
      node: (
        <CountBadge
          key={`counter:${c.name}`}
          kind={countKind(c.name)}
          count={c.count}
          label={`${player.name}: ${countWords(c.name, c.count)}`}
          side={side}
          expanded={open}
          onClick={toggle}
          fresh={fresh(`counter:${c.name}`)}
        />
      ),
    })),
    // Amendment 1 -- the city's blessing: a badge, a gold pulse when gained.
    ...(blessed
      ? [
          {
            key: "blessing",
            width: BADGE_W,
            node: (
              <CountBadge
                key="blessing"
                kind="blessing"
                count={null}
                label={`${player.name} has the city's blessing`}
                side={side}
                expanded={open}
                onClick={toggle}
                fresh={fresh("blessing")}
              />
            ),
          },
        ]
      : []),
    // Amendment 1 -- the Ring's count: a badge that ticks +1 at each temptation.
    ...(player.ringTempted > 0
      ? [
          {
            key: "ring",
            width: BADGE_W,
            node: (
              <CountBadge
                key="ring"
                kind="ring"
                count={player.ringTempted}
                label={`The Ring has tempted ${player.name} ${player.ringTempted === 1 ? "once" : `${player.ringTempted} times`}`}
                side={side}
                expanded={open}
                onClick={toggle}
                fresh={fresh("ring")}
              />
            ),
          },
        ]
      : []),
    ...player.command.flatMap((thing, i) => {
      // Spec 0086 -- the Ring is its badge now.
      if (thing === "The Ring") return [];
      const said = words[i]?.name && thing.startsWith(words[i].name) ? words[i] : undefined;
      const id = player.commandIds?.[i];
      const key = `command:${id ?? `${i}:${thing}`}`;
      // Spec 0086 (8) -- a dungeon is its map card.
      if (said?.rooms && said.rooms.length > 0) {
        return [
          {
            key,
            width: MAP_CARD_W,
            node: (
              <DungeonMap
                key={key}
                id={id}
                name={fullName(thing)}
                rooms={said.rooms}
                side={side}
                expanded={open}
                onClick={toggle}
                fresh={fresh(key)}
              />
            ),
          },
        ];
      }
      // Spec 0086 (8) -- an emblem is a tile with its planeswalker's picture.
      if (/^Emblem\s*[—–-]/.test(thing)) {
        return [
          {
            key,
            width: EMBLEM_W,
            node: (
              <EmblemTile
                key={key}
                id={id}
                name={fullName(thing)}
                emblem={emblems.find((e) => e.id === id)}
                says={said?.says}
                artUrl={artUrl}
                expanded={open}
                onClick={toggle}
                fresh={fresh(key)}
              />
            ),
          },
        ];
      }
      const text = shortName(thing);
      return [{ key, width: itemWidth(text, false), node: chip(key, "gs-chip-zone", text) }];
    }),
  ];
  // Spec 0086 -- remembered after this board, for the next one's "new".
  useLayoutEffect(() => {
    seenKeys.current = new Set(items.map((item) => item.key));
  });
  // Spec 0086 (8) -- a completed dungeon's map card shrinks away (nothing jumps).
  const leaving = useLeaving(items.filter((item) => item.width === MAP_CARD_W));
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
      {leaving}
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
          spectating={spectating}
          peek={peek}
          mana={mana}
          onClose={() => setOpenSeat(null)}
        />
      )}
    </div>
  );
}

export const StatusTray = memo(StatusTrayView, sameProps);

/**
 * Spec 0086 (8) -- items that left the tray (a dungeon completed) are drawn
 * a moment longer, shrinking away where they were.
 */
function useLeaving(now: readonly { key: string; node: ReactNode }[]): ReactNode {
  const last = useRef<Map<string, ReactNode>>(new Map());
  const [gone, setGone] = useState<{ key: string; node: ReactNode }[]>([]);
  const keys = now.map((item) => item.key).join("|");
  useLayoutEffect(() => {
    const was = last.current;
    last.current = new Map(now.map((item) => [item.key, item.node]));
    if (reducedMotion()) return;
    const left = [...was].filter(([key]) => !last.current.has(key));
    if (left.length > 0) setGone((g) => [...g, ...left.map(([key, node]) => ({ key, node }))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the set changes
  }, [keys]);
  return gone.map((g) => (
    <Leaving
      key={`leaving:${g.key}`}
      onGone={() => setGone((all) => all.filter((x) => x.key !== g.key))}
    >
      {g.node}
    </Leaving>
  ));
}

function Leaving({ children, onGone }: { children: ReactNode; onGone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== "function") {
      onGone();
      return;
    }
    const shrink = el.animate(
      [
        { transform: "scale(1)", opacity: 1, filter: "drop-shadow(0 0 8px #b9a2ff)" },
        { transform: "scale(0)", opacity: 0 },
      ],
      { duration: paced(450), easing: "cubic-bezier(0.65, 0, 0.35, 1)", fill: "forwards" },
    );
    shrink.onfinish = onGone;
    shrink.oncancel = onGone;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once
  }, []);
  return (
    <span ref={ref} className="gs-leaving" aria-hidden="true" data-leaving="true">
      {children}
    </span>
  );
}

/** W-21 -- the list: grouped, each thing once, with what it does. */
function StatusList({
  player,
  side,
  spectating,
  peek,
  mana,
  onClose,
}: {
  player: Player;
  side: "opponent" | "viewer";
  spectating: boolean;
  peek: boolean;
  mana: readonly string[];
  onClose: () => void;
}) {
  // Spec 0067 -- a spectator's trays are nobody's: "for them" both.
  const yours = side === "viewer" && !spectating;
  const words = player.commandWords ?? [];
  const held = player.designations;
  // Spec 0077 -- poison is the badge by the life shield, not listed here.
  const counters = player.counters
    .filter((c) => c.name.toUpperCase() !== "POISON")
    .map((c) => `${c.count} ${c.name.toLowerCase()}`);
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
        {counters.length > 0 && (
          <section>
            <h3 className="gs-status-sec">Counters</h3>
            <p className="gs-status-line">{counters.join(" · ")}</p>
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
      {/* Spec 0057, item 2 -- Peek and "or hold Space" left, Close right. */}
      <PeekFoot className="gs-status-foot">
        <button type="button" className="gs-win-btn gs-win-btn-quiet" onClick={onClose}>
          Close
        </button>
      </PeekFoot>
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
