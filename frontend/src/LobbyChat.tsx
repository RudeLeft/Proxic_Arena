// The lobby's chat panel — spec 0007 (owner 2026-10-24), on the 0006 layout.
// Spec 0013 — the game's chat is the same panel with its own lines, title
// and a Close beside Send.
//
// The time beside the name, your own lines marked, a run of lines in one
// bubble, reactions, an emoji panel by Send, and a "New" divider for what came in while you were away. Still
// live only (Phase 5 Amendment 3): the server stores none of it.

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { MAX_CHAT_LENGTH, type ChatLine, type LobbyState } from "./lobby";
import { avatarOf, chatItems, presenceOf, rankOf, unreadAfter } from "./lobbyView";
import { PICKER, REACTIONS } from "./chatEmoji";
import { Avatar } from "./avatars";

/** Within this many pixels of the bottom counts as reading the latest line. */
const BOTTOM_SLACK = 24;
/** Room the reaction row needs above a line, in pixels. */
const ROW_ROOM = 52;

export function ChatPanel({
  lobby,
  me,
  onSay,
  onReact,
  lines = lobby.chat,
  title = "Chat",
  inputLabel = "Message the lobby",
  onClose,
  className = "",
}: {
  lobby: LobbyState;
  me: string | null;
  onSay: (text: string) => void;
  onReact: (lineId: string, emoji: string, on: boolean) => void;
  /** Spec 0013 — whose lines: the lobby's (the default) or the game's. */
  lines?: ChatLine[];
  title?: string;
  inputLabel?: string;
  /** Spec 0013 — with this, a Close beside Send. */
  onClose?: () => void;
  className?: string;
}) {
  const headingId = useId();
  const [draft, setDraft] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  /** The line whose reaction row is up: pointed at, tapped or focused. */
  const [rowFor, setRowFor] = useState<string | null>(null);
  const inputId = useId();
  const logRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const lastId = lines[lines.length - 1]?.id ?? null;

  // --- unread (C7) --------------------------------------------------------
  const [hidden, setHidden] = useState(() => document.hidden);
  const [atBottom, setAtBottom] = useState(true);
  const [seenId, setSeenId] = useState(lastId);
  const [newBefore, setNewBefore] = useState<string | null>(null);
  const wasAway = useRef(false);
  const reading = !hidden && atBottom;

  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, []);

  useEffect(() => {
    if (!reading) {
      wasAway.current = true;
      return;
    }
    // Back: the first line that came in meanwhile gets the divider.
    const missed = unreadAfter(lines, seenId, me);
    if (wasAway.current && missed[0]) setNewBefore(missed[0].id);
    wasAway.current = false;
    if (seenId !== lastId) setSeenId(lastId);
  }, [reading, lastId, lines, seenId, me]);

  const unread = reading ? 0 : unreadAfter(lines, seenId, me).length;
  useEffect(() => {
    const base = "Proxic Arena";
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [unread]);

  // The log scrolls itself, not the page, and only when you were at the
  // bottom already: scrolled up to read, a new line must not yank you.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && atBottom) log.scrollTop = log.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on new content only
  }, [lines.length]);

  const scrolled = () => {
    const log = logRef.current;
    if (!log) return;
    setAtBottom(log.scrollHeight - log.scrollTop - log.clientHeight <= BOTTOM_SLACK);
  };

  // --- the emoji panel (C3) ---------------------------------------------
  useEffect(() => {
    if (!pickerOpen) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (pickerRef.current?.contains(target)) return;
      if ((target as Element).closest?.(".pa-emoji-toggle")) return;
      setPickerOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [pickerOpen]);

  const insert = (emoji: string) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? draft.length;
    const end = input?.selectionEnd ?? draft.length;
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, MAX_CHAT_LENGTH);
    setDraft(next);
    requestAnimationFrame(() => {
      input?.focus();
      const at = Math.min(start + emoji.length, next.length);
      input?.setSelectionRange(at, at);
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSay(text);
    setDraft("");
    setPickerOpen(false);
    setNewBefore(null);
    setAtBottom(true);
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  };

  const items = useMemo(() => chatItems(lines, newBefore), [lines, newBefore]);
  const nameOf = (userId: string) =>
    lobby.players.find((p) => p.userId === userId)?.displayName ??
    lobby.presence.find((p) => p.userId === userId)?.displayName ??
    "Somebody";

  return (
    <section className={`pa-panel pa-chat ${className}`} aria-labelledby={headingId}>
      <div className="pa-panel-head">
        <h2 id={headingId}>{title}</h2>
        {unread > 0 && <span className="pa-panel-note pa-chat-unread">{unread} new</span>}
      </div>
      <div className="pa-chat-log" role="log" ref={logRef} onScroll={scrolled}>
        {items.map((item) => {
          if (item.kind === "new") {
            return (
              <div key={item.id} className="pa-chat-new" role="separator" aria-label="New messages">
                <span>New</span>
              </div>
            );
          }
          const mine = item.fromUserId === me;
          return (
            <div key={item.id} className={`pa-chat-line${mine ? " pa-chat-mine" : ""}`}>
              <span className="pa-chat-face">
                <Avatar
                  avatar={avatarOf(lobby, item.fromUserId)}
                  size={30}
                  rank={rankOf(lobby, item.fromUserId)}
                  {...presenceOf(lobby, item.fromUserId, item.displayName, Date.now())}
                />
              </span>
              <div className="pa-chat-body">
                <div className="pa-chat-meta">
                  <span className="pa-chat-who">{item.displayName}</span>
                  <span className="pa-chat-at">{timeOf(item.sentAt)}</span>
                </div>
                <div className="pa-chat-bubble">
                  {item.lines.map((line) => (
                    <ChatMessage
                      key={line.id}
                      line={line}
                      me={me}
                      rowOpen={rowFor === line.id}
                      onRow={(open) => setRowFor(open ? line.id : null)}
                      onReact={(emoji, on) => {
                        onReact(line.id, emoji, on);
                        setRowFor(null);
                      }}
                      nameOf={nameOf}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pickerOpen && (
        <div
          className="pa-emoji-panel"
          role="dialog"
          aria-label="Emoji"
          ref={pickerRef}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setPickerOpen(false);
              inputRef.current?.focus();
            }
          }}
        >
          {PICKER.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="pa-emoji"
              aria-label={emoji}
              onClick={() => insert(emoji)}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <form className="pa-chat-form" onSubmit={submit}>
        <label className="pa-visually-hidden" htmlFor={inputId}>
          {inputLabel}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          className="pa-input"
          value={draft}
          maxLength={MAX_CHAT_LENGTH}
          placeholder="Type a message..."
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && pickerOpen) setPickerOpen(false);
          }}
        />
        <button
          type="button"
          className={`pa-button pa-emoji-toggle${pickerOpen ? " pa-emoji-toggle-on" : ""}`}
          aria-label="Emoji"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M6.8 11.6c.8 1.3 1.9 2 3.2 2s2.4-.7 3.2-2" />
            <circle cx="7.4" cy="8" r="0.7" className="pa-emoji-eye" />
            <circle cx="12.6" cy="8" r="0.7" className="pa-emoji-eye" />
          </svg>
        </button>
        {/* Not before the socket is open: a send while connecting is
            lost without a word. CI caught a fast click doing it. */}
        <button
          type="submit"
          className="pa-button"
          disabled={draft.trim().length === 0 || lobby.connection !== "open"}
        >
          Send
        </button>
        {onClose && (
          <button
            type="button"
            className="pa-button pa-button-quiet pa-chat-close"
            onClick={onClose}
          >
            Close
          </button>
        )}
      </form>
    </section>
  );
}

/**
 * One line, its reactions under it, and its row of six (C4): up while
 * the pointer is on the line, after a tap on a phone, or from the
 * React button for a keyboard.
 */
function ChatMessage({
  line,
  me,
  rowOpen,
  onRow,
  onReact,
  nameOf,
}: {
  line: ChatLine;
  me: string | null;
  rowOpen: boolean;
  onRow: (open: boolean) => void;
  onReact: (emoji: string, on: boolean) => void;
  nameOf: (userId: string) => string;
}) {
  const reactions = REACTIONS.filter((emoji) => (line.reactions?.[emoji]?.length ?? 0) > 0);
  const mineOn = (emoji: string) => (me !== null && line.reactions?.[emoji]?.includes(me)) || false;
  // The row goes above the line, unless that is off the top of the log
  // (the first line): the log cannot scroll up to it there.
  const ref = useRef<HTMLDivElement | null>(null);
  const [below, setBelow] = useState(false);
  useLayoutEffect(() => {
    const msg = ref.current;
    const log = msg?.closest(".pa-chat-log");
    if (!rowOpen || !msg || !log) return;
    setBelow(msg.getBoundingClientRect().top - log.getBoundingClientRect().top < ROW_ROOM);
  }, [rowOpen]);
  return (
    <div
      ref={ref}
      className={`pa-chat-msg${rowOpen ? " pa-chat-msg-open" : ""}`}
      // A mouse only: a tap also fires pointer events, and would open the
      // row and then shut it with its own click.
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") onRow(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") onRow(false);
      }}
      onClick={(event) => {
        // A tap on the line (a phone has no pointing); not a tap on a button.
        if ((event.target as Element).closest("button")) return;
        if (window.getSelection()?.toString()) return;
        onRow(!rowOpen);
      }}
    >
      {/* React escapes this (AMENDMENT 3's "escaped"), and the CSP
          forbids inline script behind it. */}
      <span className="pa-chat-text">{line.text}</span>
      <button
        type="button"
        className="pa-react-open"
        aria-label="React to this line"
        aria-expanded={rowOpen}
        onClick={() => onRow(!rowOpen)}
      >
        +
      </button>
      {rowOpen && (
        <div
          className={`pa-react-row${below ? " pa-react-row-below" : ""}`}
          role="group"
          aria-label="React"
        >
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`pa-react-pick${mineOn(emoji) ? " pa-react-pick-on" : ""}`}
              aria-label={`React ${emoji}`}
              aria-pressed={mineOn(emoji)}
              onClick={() => onReact(emoji, !mineOn(emoji))}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {reactions.length > 0 && (
        <div className="pa-reactions">
          {reactions.map((emoji) => {
            const who = line.reactions?.[emoji] ?? [];
            return (
              <button
                key={emoji}
                type="button"
                className={`pa-reaction${mineOn(emoji) ? " pa-reaction-mine" : ""}`}
                title={who.map(nameOf).join(", ")}
                aria-label={`${emoji} ${who.length}: ${who.map(nameOf).join(", ")}`}
                aria-pressed={mineOn(emoji)}
                onClick={() => onReact(emoji, !mineOn(emoji))}
              >
                {emoji} <span className="pa-reaction-count">{who.length}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function timeOf(sentAt: string): string {
  const at = new Date(sentAt);
  if (Number.isNaN(at.getTime())) return "";
  return at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}
