// Spec 0064 (owner 2026-11-07, canvas "chat-1107") -- the game chat window:
// two tabs, Chat and Play log, each with an unread count (gold for chat,
// grey for plays). Docked it is spec 0013's drawer on the left edge;
// undocked it floats on the table (dragged by its top bar, resized from its
// corner, remembered in this browser, kept clear of your hand and the
// column with the action button); popped out it is the same window drawn
// into a second browser window by this page (so it stays in step with the
// game and its socket), which closes when the game page goes.
//
// The lobby chat does not change: Chat is the lobby's panel (ChatPanel)
// with this game's lines, as before. Spectators have no game chat; spec
// 0067 gives them the public play log alone, read-only (`logOnly`).

import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLobbyConnection } from "../shell/LobbyConnection";
import { ChatPanel } from "../LobbyChat";
import { SharpCard, closeUpOf, pictureUrl } from "../closeUp";
import type { PlayLogCard, PlayLogLine, SnapshotPlayer } from "../match";
import {
  clampTo,
  clearOf,
  firstPlace,
  loadPlace,
  savePlace,
  CHAT_MAX,
  CHAT_MIN,
  type Rect,
} from "./chatPlace";

type Tab = "chat" | "log";
type Mode = "docked" | "floating" | "popped";
type Filter = "all" | "plays";

/** "Spells and combat": spells, abilities, attacks, blocks, damage and what died. */
const PLAYS = new Set(["spell", "ability", "trigger", "combat", "damage", "death"]);

/** The words when the browser refuses the second window. */
export const POPUP_BLOCKED =
  "Your browser blocked the chat's own window. Allow pop-ups for this site, then try again.";

/** The places on the table the floating window keeps clear of, now. */
function keepClearNow(): Rect[] {
  const out: Rect[] = [];
  const box = (r: DOMRect): Rect => ({ x: r.left, y: r.top, w: r.width, h: r.height });
  const rail = document.querySelector(".bf-rail");
  if (rail) {
    const r = rail.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out.push(box(r));
  }
  const hand = [...document.querySelectorAll('[data-zone="viewer:hand"]')]
    .map((el) => el.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0);
  if (hand.length > 0) {
    const left = Math.min(...hand.map((r) => r.left));
    const top = Math.min(...hand.map((r) => r.top));
    const right = Math.max(...hand.map((r) => r.right));
    const bottom = Math.max(...hand.map((r) => r.bottom));
    out.push({ x: left, y: top, w: right - left, h: bottom - top });
  }
  return out;
}

const screenNow = (): Rect => ({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

/** A phone or tablet: no second window (the canvas: hidden there). */
function onPhone(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
  } catch {
    return false;
  }
}

/** The second browser window, with this page's styles, ready to be drawn into. */
function openPopOut(name: string): { win: Window; root: HTMLElement } | null {
  let win: Window | null = null;
  try {
    win = window.open("", name, "popup=yes,width=440,height=720");
  } catch {
    win = null;
  }
  if (!win || win.closed) return null;
  const doc = win.document;
  doc.title = "Game chat · Proxic Arena";
  doc.documentElement.lang = "en";
  // A window left from before a refresh is emptied and drawn again.
  doc.head.querySelectorAll("[data-proxic-style]").forEach((n) => n.remove());
  doc.body.replaceChildren();
  for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) {
    const copy = node.cloneNode(true) as HTMLElement;
    if (node instanceof HTMLLinkElement) (copy as HTMLLinkElement).href = node.href;
    copy.setAttribute("data-proxic-style", "");
    doc.head.appendChild(copy);
  }
  doc.body.className = "gs-popout";
  const root = doc.createElement("div");
  root.className = "gs-popout-root";
  doc.body.appendChild(root);
  return { win, root };
}

export function GameChat({
  open,
  onToggle,
  me,
  matchId,
  lines,
  players,
  mySeat,
  handCount,
  onInspect,
  logOnly = false,
}: {
  open: boolean;
  onToggle: (open: boolean) => void;
  me: string;
  matchId: string;
  /** The play log as far as the board on the table has come. */
  lines: PlayLogLine[];
  players: SnapshotPlayer[];
  mySeat: number;
  /** Cards in your hand: when it grows, the floating window moves clear again. */
  handCount: number;
  /** Open a card's close-up, when it is on the board (by id); false when it is not. */
  onInspect: (id: string) => boolean;
  /** Spec 0067 -- a spectator: the play log only, read-only; no chat and no box to type in. */
  logOnly?: boolean;
}) {
  const { lobby, send } = useLobbyConnection();
  const [tab, setTab] = useState<Tab>(logOnly ? "log" : "chat");
  const remembered = useMemo(() => loadPlace(me), [me]);
  const [mode, setMode] = useState<Mode>(remembered.mode);
  const [rect, setRect] = useState<Rect | null>(remembered.rect);
  const [blocked, setBlocked] = useState(false);
  const [zones, setZones] = useState<Rect[] | null>(null);
  const [popRoot, setPopRoot] = useState<HTMLElement | null>(null);
  const popWin = useRef<Window | null>(null);
  const before = useRef<"docked" | "floating">(remembered.mode);

  // --- unread, per tab --------------------------------------------------
  const chat = lobby.gameChat;
  const latestChat = chat[chat.length - 1]?.id ?? null;
  const latestFromOthers = useMemo(() => {
    for (let i = chat.length - 1; i >= 0; i--) if (chat[i]!.fromUserId !== me) return chat[i]!.id;
    return null;
  }, [chat, me]);
  const [chatSeen, setChatSeen] = useState<string | null>(latestFromOthers);
  const lastN = lines[lines.length - 1]?.n ?? null;
  // The log a refresh brings back is not news: what was there is "seen".
  const [logSeen, setLogSeen] = useState<number | null>(lastN);
  useEffect(() => {
    if (logSeen === null && lastN !== null) setLogSeen(lastN);
  }, [logSeen, lastN]);
  const showing = open || mode === "popped";
  const chatShown = showing && tab === "chat";
  const logShown = showing && tab === "log";
  useEffect(() => {
    if (chatShown) setChatSeen(latestChat);
  }, [chatShown, latestChat]);
  useEffect(() => {
    if (logShown && lastN !== null) setLogSeen(lastN);
  }, [logShown, lastN]);
  const chatUnread = useMemo(() => {
    if (chatShown) return 0;
    const from = chatSeen === null ? -1 : chat.findIndex((l) => l.id === chatSeen);
    return chat.slice(from + 1).filter((l) => l.fromUserId !== me).length;
  }, [chat, chatSeen, chatShown, me]);
  const logUnread = useMemo(
    () =>
      logShown || logSeen === null
        ? 0
        : lines.filter((l) => l.n > logSeen && l.kind !== "turn").length,
    [lines, logSeen, logShown],
  );
  // The edge tab's dot: the other player said something (spec 0013, unchanged).
  const dot = !showing && latestFromOthers !== null && chatUnread > 0;

  // --- floating ------------------------------------------------------------
  const remember = useCallback(
    (m: "docked" | "floating", r: Rect | null) => savePlace(me, { mode: m, rect: r }),
    [me],
  );
  const place = useCallback((r: Rect) => clearOf(r, keepClearNow(), screenNow()), []);
  const undock = () => {
    const next = rect ? place(rect) : firstPlace(screenNow(), keepClearNow());
    setRect(next);
    setMode("floating");
    before.current = "floating";
    remember("floating", next);
    onToggle(true);
  };
  const dock = () => {
    setMode("docked");
    before.current = "docked";
    remember("docked", rect);
    onToggle(true);
  };
  // A floating window comes back where it was, clear of what grew since.
  useEffect(() => {
    if (mode !== "floating") return undefined;
    const again = () => setRect((r) => (r ? place(r) : firstPlace(screenNow(), keepClearNow())));
    again();
    window.addEventListener("resize", again);
    return () => window.removeEventListener("resize", again);
  }, [mode, place, handCount]);

  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    from: Rect;
    kind: "move" | "size";
  } | null>(null);
  const startDrag = (kind: "move" | "size") => (event: ReactPointerEvent<HTMLElement>) => {
    if (mode !== "floating" || !rect || event.button !== 0) return;
    if (kind === "move" && (event.target as Element).closest("button")) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, from: rect, kind };
    setZones(keepClearNow());
  };
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const dx = event.clientX - d.x;
    const dy = event.clientY - d.y;
    const screen = screenNow();
    setRect(
      d.kind === "move"
        ? clampTo({ ...d.from, x: d.from.x + dx, y: d.from.y + dy }, screen)
        : clampTo(
            {
              ...d.from,
              w: Math.min(CHAT_MAX.w, Math.max(CHAT_MIN.w, d.from.w + dx)),
              h: Math.min(CHAT_MAX.h, Math.max(CHAT_MIN.h, d.from.h + dy)),
            },
            screen,
          ),
    );
  };
  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    drag.current = null;
    setZones(null);
    setRect((r) => {
      if (!r) return r;
      // Let go over the hand or the column: it slides just clear.
      const placed = place(r);
      remember("floating", placed);
      return placed;
    });
  };

  // --- popped out ------------------------------------------------------------
  const canPopOut = !onPhone();
  const popOut = () => {
    const opened = openPopOut(`proxic-game-chat-${matchId}`);
    if (!opened) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    popWin.current = opened.win;
    setPopRoot(opened.root);
    if (mode !== "popped") before.current = mode;
    setMode("popped");
  };
  const comeBack = useCallback(() => {
    const win = popWin.current;
    popWin.current = null;
    setPopRoot(null);
    setMode(before.current);
    onToggle(true);
    try {
      win?.close();
    } catch {}
  }, [onToggle]);
  // Closed by its own close button: back into the game.
  useEffect(() => {
    if (mode !== "popped") return undefined;
    const timer = window.setInterval(() => {
      if (!popWin.current || popWin.current.closed) comeBack();
    }, 500);
    return () => window.clearInterval(timer);
  }, [mode, comeBack]);
  // Refreshing (or leaving) the game closes it: it is this page's window.
  useEffect(() => {
    const gone = () => {
      try {
        popWin.current?.close();
      } catch {}
    };
    window.addEventListener("pagehide", gone);
    return () => {
      window.removeEventListener("pagehide", gone);
      gone();
    };
  }, []);
  useEffect(() => {
    if (!blocked) return undefined;
    const timer = window.setTimeout(() => setBlocked(false), 8000);
    return () => window.clearTimeout(timer);
  }, [blocked]);

  const nameOf = (seat: number) => players.find((p) => p.seat === seat)?.name ?? "A player";

  const window_ = (where: Mode) => (
    <ChatWindow
      logOnly={logOnly}
      mode={where}
      tab={tab}
      onTab={setTab}
      chatUnread={chatUnread}
      logUnread={logUnread}
      blocked={blocked && where !== "popped"}
      canPopOut={canPopOut}
      onUndock={undock}
      onDock={dock}
      onPopOut={popOut}
      onComeBack={comeBack}
      onClose={() => onToggle(false)}
      rect={where === "floating" ? rect : null}
      onHeadDown={startDrag("move")}
      onSizeDown={startDrag("size")}
      onMove={moveDrag}
      onUp={endDrag}
      chat={
        logOnly ? null : (
          <ChatPanel
            lobby={lobby}
            me={me}
            lines={lobby.gameChat}
            title="Game chat"
            inputLabel="Message the game"
            className="gs-chat-panel"
            onSay={(text) => send({ type: "CHAT", text, scope: "game" })}
            onReact={(lineId, emoji, on) =>
              send({ type: "REACT", lineId, emoji, on, scope: "game" })
            }
          />
        )
      }
      log={
        <PlayLogView
          lines={lines}
          nameOf={nameOf}
          mySeat={mySeat}
          onInspect={onInspect}
          active={tab === "log"}
        />
      }
    />
  );

  return (
    <aside
      className={`gs-chat gs-chat-${mode}${open ? " gs-chat-open" : ""}${logOnly ? " gs-chat-log-only" : ""}`}
      aria-label={logOnly ? "Play log" : "Game chat"}
    >
      {(mode !== "floating" || !open) && (
        <button
          type="button"
          className={`gs-chat-tab${dot ? " gs-chat-tab-unread" : ""}`}
          aria-expanded={showing}
          aria-label={
            logOnly
              ? mode === "popped"
                ? "The play log is in its own window: bring it back"
                : open
                  ? "Close the play log"
                  : "Open the play log"
              : mode === "popped"
                ? "The game chat is in its own window: bring it back"
                : open
                  ? "Close the game chat"
                  : dot
                    ? "Open the game chat, new messages"
                    : "Open the game chat"
          }
          onClick={() => (mode === "popped" ? comeBack() : onToggle(!open))}
        >
          <span aria-hidden="true">{logOnly ? "Play log" : "Game chat"}</span>
          {dot && <span aria-hidden="true" className="gs-chat-tab-dot" />}
        </button>
      )}
      {mode === "docked" && open && window_("docked")}
      {mode === "floating" && open && rect && (
        <>
          {zones?.map((z, i) => (
            <div
              key={i}
              className="gs-cw-zone"
              aria-hidden="true"
              style={{ left: z.x, top: z.y, width: z.w, height: z.h }}
            />
          ))}
          {window_("floating")}
        </>
      )}
      {mode === "popped" && popRoot && createPortal(window_("popped"), popRoot)}
    </aside>
  );
}

function ChatWindow({
  logOnly = false,
  mode,
  tab,
  onTab,
  chatUnread,
  logUnread,
  blocked,
  canPopOut,
  onUndock,
  onDock,
  onPopOut,
  onComeBack,
  onClose,
  rect,
  onHeadDown,
  onSizeDown,
  onMove,
  onUp,
  chat,
  log,
}: {
  mode: Mode;
  tab: Tab;
  onTab: (tab: Tab) => void;
  chatUnread: number;
  logUnread: number;
  blocked: boolean;
  canPopOut: boolean;
  onUndock: () => void;
  onDock: () => void;
  onPopOut: () => void;
  onComeBack: () => void;
  onClose: () => void;
  rect: Rect | null;
  onHeadDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onSizeDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onUp: (event: ReactPointerEvent<HTMLElement>) => void;
  chat: ReactNode;
  log: ReactNode;
  /** Spec 0067 -- a spectator's: the play log alone, read-only. */
  logOnly?: boolean;
}) {
  const style = rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined;
  return (
    <div className={`gs-cw gs-cw-${mode}`} style={style} data-testid="game-chat-window">
      <div
        className="gs-cw-head"
        onPointerDown={onHeadDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <span className="gs-cw-title">{logOnly ? "Play log · read-only" : "Game chat"}</span>
        {mode === "docked" && (
          <button
            type="button"
            className="gs-cw-ib"
            title="Float it on the table"
            aria-label="Float the chat on the table"
            onClick={onUndock}
          >
            ⇱
          </button>
        )}
        {mode === "floating" && (
          <button
            type="button"
            className="gs-cw-ib"
            title="Put it back on the edge"
            aria-label="Dock the chat on the edge"
            onClick={onDock}
          >
            ⇲
          </button>
        )}
        {mode !== "popped" && canPopOut && (
          <button
            type="button"
            className="gs-cw-ib"
            title="Open it in its own window"
            aria-label="Open the chat in its own window"
            onClick={onPopOut}
          >
            ⧉
          </button>
        )}
        {mode === "popped" && (
          <button
            type="button"
            className="gs-cw-ib"
            title="Put it back in the game"
            aria-label="Put the chat back in the game"
            onClick={onComeBack}
          >
            ⇲
          </button>
        )}
        {mode === "floating" && (
          <button
            type="button"
            className="gs-cw-ib"
            title="Close"
            aria-label="Close the game chat"
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      {blocked && (
        <p className="gs-cw-blocked" role="alert">
          {POPUP_BLOCKED}
        </p>
      )}
      <div className="gs-cw-tabs" role="tablist" aria-label="Game chat" hidden={logOnly}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "chat"}
          aria-label={chatUnread > 0 ? `Chat, ${chatUnread} new` : "Chat"}
          onClick={() => onTab("chat")}
        >
          Chat
          {chatUnread > 0 && (
            <span className="gs-cw-cnt" aria-hidden="true">
              {chatUnread}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "log"}
          aria-label={logUnread > 0 ? `Play log, ${logUnread} new` : "Play log"}
          onClick={() => onTab("log")}
        >
          Play log
          {logUnread > 0 && (
            <span className="gs-cw-cnt gs-cw-cnt-grey" aria-hidden="true">
              {logUnread}
            </span>
          )}
        </button>
      </div>
      {/* Both stay mounted: a half-typed message survives a look at the log. */}
      {!logOnly && (
        <div className="gs-cw-body" role="tabpanel" hidden={tab !== "chat"}>
          {chat}
        </div>
      )}
      <div className="gs-cw-body" role="tabpanel" hidden={tab !== "log"}>
        {log}
      </div>
      {mode === "floating" && (
        <div
          className="gs-cw-resize"
          aria-hidden="true"
          onPointerDown={onSizeDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
      )}
    </div>
  );
}

/** Within this many pixels of the bottom counts as reading the latest line. */
const BOTTOM_SLACK = 24;

const KIND_LOOK: Record<string, string> = {
  spell: "spell",
  ability: "spell",
  trigger: "spell",
  combat: "combat",
  damage: "combat",
  death: "death",
  life: "life",
  land: "land",
  draw: "draw",
  reveal: "draw",
};

interface TurnGroup {
  key: string;
  turn: number;
  active: number;
  lines: PlayLogLine[];
}

/** The lines under their turns: a turn's header line opens it; the rest join the turn they say. */
export function turnGroups(lines: PlayLogLine[]): TurnGroup[] {
  const out: TurnGroup[] = [];
  for (const line of lines) {
    const last = out[out.length - 1];
    if (line.kind === "turn") {
      out.push({ key: `t${line.n}`, turn: line.turn, active: line.active, lines: [] });
    } else if (last && last.turn === line.turn) {
      last.lines.push(line);
    } else {
      out.push({ key: `t${line.n}`, turn: line.turn, active: line.active, lines: [line] });
    }
  }
  return out;
}

export function PlayLogView({
  lines,
  nameOf,
  mySeat,
  onInspect,
  active = true,
}: {
  lines: PlayLogLine[];
  nameOf: (seat: number) => string;
  mySeat: number;
  onInspect: (id: string) => boolean;
  /** Its tab is showing: a log drawn while hidden has no height to scroll. */
  active?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [atBottom, setAtBottom] = useState(true);
  const [peek, setPeek] = useState<{ card: PlayLogCard; left: number; top: number } | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  // Lines that arrive while you look light up for a moment.
  const freshFrom = useRef<number | null>(null);
  if (freshFrom.current === null) freshFrom.current = (lines[lines.length - 1]?.n ?? 0) + 1;

  const groups = useMemo(() => {
    const all = turnGroups(lines);
    if (filter === "all") return all;
    return all
      .map((g) => ({ ...g, lines: g.lines.filter((l) => PLAYS.has(l.kind)) }))
      .filter((g) => g.lines.length > 0);
  }, [lines, filter]);
  const count = groups.reduce((n, g) => n + g.lines.length + 1, 0);

  // It follows the game, unless you have scrolled up to read.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && atBottom) log.scrollTop = log.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on new content only
  }, [count, filter, active]);
  // ...and when the window it is in changes size (floated, resized, popped
  // out), it stays on the latest line if that is where you were.
  const following = useRef(atBottom);
  following.current = atBottom;
  useEffect(() => {
    const log = logRef.current;
    if (!log || typeof ResizeObserver === "undefined") return undefined;
    const watch = new ResizeObserver(() => {
      if (following.current) log.scrollTop = log.scrollHeight;
    });
    watch.observe(log);
    return () => watch.disconnect();
  }, []);
  const scrolled = () => {
    const log = logRef.current;
    if (!log) return;
    setAtBottom(log.scrollHeight - log.scrollTop - log.clientHeight <= BOTTOM_SLACK);
  };
  const jump = () => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
    setAtBottom(true);
  };

  const show = (card: PlayLogCard, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const view = el.ownerDocument.defaultView ?? window;
    const width = 250;
    const height = 350;
    const left =
      r.right + 12 + width < view.innerWidth ? r.right + 12 : Math.max(8, r.left - width - 12);
    const top = Math.max(8, Math.min(view.innerHeight - height - 8, r.top - height / 2));
    setPeek({ card, left, top });
  };

  const part = (p: PlayLogLine["parts"][number], i: number) => {
    if (typeof p === "string") return <Fragment key={i}>{p}</Fragment>;
    if ("player" in p) {
      return (
        <span key={i} className="gs-log-pl">
          {nameOf(p.player)}
        </span>
      );
    }
    const words = p.label ?? p.name;
    return (
      <button
        key={i}
        type="button"
        className="gs-log-cn"
        aria-label={`${words}: show the card`}
        onPointerEnter={(event) => show(p, event.currentTarget)}
        onPointerLeave={() => setPeek(null)}
        onFocus={(event) => show(p, event.currentTarget)}
        onBlur={() => setPeek(null)}
        onClick={() => {
          if (p.id && onInspect(p.id)) setPeek(null);
        }}
      >
        {words}
      </button>
    );
  };

  let stepShown: string | null = null;
  return (
    <div className="gs-log">
      <div className="gs-log-filters" role="group" aria-label="Show">
        <button type="button" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
          Everything
        </button>
        <button type="button" aria-pressed={filter === "plays"} onClick={() => setFilter("plays")}>
          Spells and combat
        </button>
      </div>
      <div
        className="gs-log-lines"
        role="log"
        aria-label="Play log"
        ref={logRef}
        onScroll={scrolled}
      >
        {groups.length === 0 && <p className="gs-log-empty">Nothing has happened yet.</p>}
        {groups.map((g) => {
          stepShown = null;
          return (
            <section key={g.key} className="gs-log-turn">
              <h3 className="gs-log-head">
                {g.turn === 0 ? (
                  "Before the game"
                ) : (
                  <>
                    Turn {g.turn} · <span className="gs-log-who">{nameOf(g.active)}</span>
                    {g.active === mySeat && <span className="gs-log-you">your turn</span>}
                  </>
                )}
              </h3>
              {g.lines.map((l, i) => {
                const label =
                  l.step !== stepShown &&
                  !(i === 0 && ["Beginning", "Main 1", "Before the game"].includes(l.step))
                    ? l.step
                    : null;
                stepShown = l.step;
                const look = KIND_LOOK[l.kind] ?? "other";
                return (
                  <Fragment key={l.n}>
                    {label && <div className="gs-log-step">{label}</div>}
                    <div
                      className={`gs-log-ent gs-log-${look}${l.private ? " gs-log-private" : ""}${
                        l.n >= freshFrom.current! ? " gs-log-fresh" : ""
                      }`}
                      data-kind={l.kind}
                    >
                      <span className="gs-log-ic" aria-hidden="true" />
                      <span className="gs-log-text">
                        {l.parts.map(part)}
                        {l.life?.map((t) => (
                          <span key={t.seat} className="gs-log-total">
                            {nameOf(t.seat)} {t.total}
                          </span>
                        ))}
                        {l.private && (
                          <span className="pa-visually-hidden"> (only you were told)</span>
                        )}
                      </span>
                    </div>
                  </Fragment>
                );
              })}
            </section>
          );
        })}
      </div>
      {!atBottom && (
        <button type="button" className="gs-log-jump" onClick={jump}>
          Jump to latest
        </button>
      )}
      {peek && (
        <div className="gs-log-peek" aria-hidden="true" style={{ left: peek.left, top: peek.top }}>
          {peek.card.art ? (
            <SharpCard
              low={pictureUrl(peek.card.art)}
              high={closeUpOf(pictureUrl(peek.card.art))}
              alt=""
            />
          ) : (
            <span className="gs-log-peek-name">{peek.card.label ?? peek.card.name}</span>
          )}
        </div>
      )}
    </div>
  );
}
