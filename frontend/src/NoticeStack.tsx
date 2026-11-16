// Spec 0050 — the notice stack, top right of every page and of the table.
//
// Newest on top, three at a time and "+N more". A notice with a fade drains
// a thin bar and goes; pointing at the stack pauses it. On the table
// (Phase 9 W-22) a notice with nothing to click lets clicks through to the
// card beneath and turns see-through under the pointer, so it never blocks
// the board (Phase 7 Amendment 12). Notices never take the keyboard focus.

import { useEffect, useRef, useState } from "react";
import { arrange, type Notice } from "./notices";

/** Runs `done` after `ms` of not being paused. */
function useFade(ms: number | undefined, paused: boolean, done: (() => void) | undefined) {
  const left = useRef(ms ?? 0);
  const finish = useRef(done);
  finish.current = done;
  useEffect(() => {
    if (!ms || paused) return undefined;
    const started = Date.now();
    const timer = window.setTimeout(() => finish.current?.(), left.current);
    return () => {
      window.clearTimeout(timer);
      left.current -= Date.now() - started;
    };
  }, [ms, paused]);
}

function NoticeCard({ notice, paused }: { notice: Notice; paused: boolean }) {
  useFade(notice.fadeMs, paused, notice.close);
  const through = notice.quiet === true || (notice.actions.length === 0 && !notice.close);
  return (
    <div
      className={`pa-note pa-note-${notice.tone}${through ? " pa-note-through" : ""}`}
      role={notice.tone === "red" ? "alert" : "status"}
      data-notice={notice.key}
    >
      <span className="pa-note-label">{notice.label}</span>
      <strong className="pa-note-title">{notice.titleNode ?? notice.title}</strong>
      {notice.line && <span className="pa-note-line">{notice.line}</span>}
      {notice.actions.length > 0 && (
        <span className="pa-note-actions">
          {notice.actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? "pa-note-button pa-note-button-main" : "pa-note-button"}
              onClick={action.run}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}
      {notice.close && !notice.quiet && (
        <button
          type="button"
          className="pa-note-close"
          aria-label={`Close: ${notice.title}`}
          onClick={notice.close}
        >
          ×
        </button>
      )}
      {notice.fadeMs ? (
        <span
          aria-hidden="true"
          className="pa-note-bar"
          style={{
            animationDuration: `${notice.fadeMs}ms`,
            animationPlayState: paused ? "paused" : "running",
          }}
        />
      ) : null}
    </div>
  );
}

export function NoticeStack({ notices, place }: { notices: Notice[]; place: "page" | "table" }) {
  // Spec 0097, item 1 -- the card under the pointer, not just "pointed": a
  // card removed under the pointer (an invitation closed, "Reconnecting"
  // gone) sends no mouseleave, and a plain flag stayed true, so every later
  // card mounted paused forever. A pause holds only while the card that was
  // pointed at is still shown, and an empty stack forgets it.
  const [pointedAt, setPointedAt] = useState<string | null>(null);
  const stack = useRef<HTMLDivElement | null>(null);

  // On the table the cards take no pointer, so :hover never fires: whatever
  // is under the pointer goes see-through.
  useEffect(() => {
    if (place !== "table") return undefined;
    const moved = (event: MouseEvent) => {
      for (const card of stack.current?.querySelectorAll<HTMLElement>(".pa-note-through") ?? []) {
        const box = card.getBoundingClientRect();
        const over =
          event.clientX >= box.left &&
          event.clientX <= box.right &&
          event.clientY >= box.top &&
          event.clientY <= box.bottom;
        card.classList.toggle("pa-note-dim", over);
      }
    };
    window.addEventListener("mousemove", moved);
    return () => window.removeEventListener("mousemove", moved);
  }, [place]);

  const { shown, more } = arrange(notices);
  // "*": the stack itself (between cards, "+N more").
  const pointedShown =
    pointedAt !== null &&
    shown.length > 0 &&
    (pointedAt === "*" || shown.some((notice) => notice.key === pointedAt));
  useEffect(() => {
    if (pointedAt !== null && !pointedShown) setPointedAt(null);
  }, [pointedAt, pointedShown]);
  if (shown.length === 0) return null;
  const point = (target: EventTarget | null) => {
    const card = target instanceof Element ? target.closest<HTMLElement>("[data-notice]") : null;
    setPointedAt(card?.dataset["notice"] ?? "*");
  };
  return (
    <div
      ref={stack}
      className={`pa-notes pa-notes-${place}`}
      aria-label="Notices"
      role="region"
      onMouseOver={(event) => point(event.target)}
      onMouseLeave={() => setPointedAt(null)}
    >
      {shown.map((notice) => (
        <NoticeCard key={notice.key} notice={notice} paused={pointedShown} />
      ))}
      {more > 0 && <span className="pa-notes-more">+{more} more</span>}
    </div>
  );
}
