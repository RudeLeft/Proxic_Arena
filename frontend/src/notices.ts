// Spec 0050 — one look for every notice.
//
// Every notice is the same card, top right: a coloured edge, a label, a
// title, one line saying what can be done next, and its buttons. Gold for
// invitations and rooms, red for problems, blue for the connection and new
// versions, grey for the game's own messages. Newest on top, three at a
// time, the rest waiting as "+N more"; nothing replaces anything. News
// fades; questions and problems stay until answered or closed.

import type { ReactNode } from "react";
import { goneTitle } from "./lobbyView";
import type { LobbyState } from "./lobby";

export type NoticeTone = "gold" | "red" | "blue" | "grey";

export interface NoticeAction {
  label: string;
  primary?: boolean;
  run: () => void;
}

export interface Notice {
  /** Stable while the notice is the same notice: it keeps its place. */
  key: string;
  tone: NoticeTone;
  label: string;
  title: string;
  /** The title drawn some other way (mana symbols); `title` still names it. */
  titleNode?: ReactNode;
  line?: string | undefined;
  actions: NoticeAction[];
  /** The ×. Absent for one that goes on its own (Reconnecting) or never. */
  close?: () => void;
  /** Fades after this long, unless the pointer is over the stack. */
  fadeMs?: number;
  /** Nothing to click (the game's own messages): no ×, and clicks go through it. */
  quiet?: boolean;
}

export const NEWS_MS = 8000;
/** The game's own messages: as long as they always lasted (§7.57). */
export const GAME_MESSAGE_MS = 7000;
export const MAX_SHOWN = 3;

/** Newest on top, three at most; how many wait below. */
export function arrange<T>(
  oldestFirst: readonly T[],
  max = MAX_SHOWN,
): { shown: T[]; more: number } {
  const shown = oldestFirst.slice(-max).reverse();
  return { shown, more: oldestFirst.length - shown.length };
}

/** A title ends without a full stop. */
export function asTitle(text: string): string {
  return text.trim().replace(/\.$/, "");
}

/** "A, so the match did not start. The room is open again." → its two halves. */
export function splitSentence(text: string): { title: string; line?: string } {
  const at = text.indexOf(". ");
  if (at < 0) return { title: asTitle(text) };
  return { title: text.slice(0, at), line: text.slice(at + 2).trim() };
}

/**
 * Orders notices by when each first appeared, so one that stays keeps its
 * place and a new one goes on top. `seen` lives as long as the page.
 */
export function inArrival(list: readonly Notice[], seen: Map<string, number>): Notice[] {
  for (const notice of list) {
    if (!seen.has(notice.key))
      seen.set(notice.key, seen.size === 0 ? 1 : Math.max(...seen.values()) + 1);
  }
  const live = new Set(list.map((n) => n.key));
  for (const key of [...seen.keys()]) if (!live.has(key)) seen.delete(key);
  return [...list].sort((a, b) => (seen.get(a.key) ?? 0) - (seen.get(b.key) ?? 0));
}

// --- the words (spec 0050's table) ---------------------------------------------------

/** A lobby event that is news: said once, then fading. */
export interface NewsItem {
  label: string;
  title: string;
  line?: string | undefined;
}

/** "Pat declined your invitation" and the other endings the host or asker hears. */
export function newsOf(text: string): NewsItem {
  const title = asTitle(text);
  if (/declined your invitation$/.test(title)) {
    return {
      label: "Invitation",
      title,
      line: "Your room is still open. Invite someone else from Players.",
    };
  }
  return { label: "Request to join", title, line: "You can ask again, or open your own room." };
}

/** An invitation to you that ended without your answer. */
export function goneOf(gone: LobbyState["invitationGone"][number]): NewsItem {
  return {
    label: "Invitation",
    title: goneTitle(gone.reason, gone.fromDisplayName),
    line: "The seat is no longer held for you.",
  };
}

/** The lobby's own notice: a closed room or an abandoned match is news; the rest are problems. */
export function lobbyNoticeOf(
  notice: NonNullable<LobbyState["notice"]>,
): NewsItem & { problem: boolean } {
  if (notice.kind === "info") {
    if (notice.aboutMatch)
      return { label: "Match", ...splitSentence(notice.detail), problem: false };
    return {
      label: "Room",
      title: asTitle(notice.detail),
      line: "You can open your own room or ask to join another.",
      problem: false,
    };
  }
  if (notice.aboutMatch) {
    return { label: "Match", title: "The match did not start", line: notice.detail, problem: true };
  }
  return { label: "Room", title: "That couldn't be done", line: notice.detail, problem: true };
}

/** Spec 0050 — a new version during a game waits until the game is over. */
export function versionWaits(pathname: string, matchStatus: string | null): boolean {
  return (
    pathname === "/game" &&
    matchStatus !== null &&
    !["ENDED", "FAILED_RUNTIME", "TERMINATED"].includes(matchStatus)
  );
}

/** The questions waiting, as a key: an invitation's room, a request's asker. */
export function questionKey(inviteRoom: string | null, askedBy: string | null): string {
  return `${inviteRoom ?? ""}|${askedBy ?? ""}`;
}

/** A question arrived that was not there before: chime. */
export function questionArrived(before: string, now: string): boolean {
  const [inviteNow, askNow] = now.split("|");
  const [inviteBefore, askBefore] = before.split("|");
  return Boolean((inviteNow && inviteNow !== inviteBefore) || (askNow && askNow !== askBefore));
}
