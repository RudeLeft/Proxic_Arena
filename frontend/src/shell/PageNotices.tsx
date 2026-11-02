// Spec 0050 — every notice on a signed-in page, as one list.
//
// Built from the live lobby connection: the questions (an invitation, a
// request to join) and the problems stay while they are true; news (a
// decline, a closed room, an abandoned match) is taken off the lobby state
// as it arrives and queued, so a second one waits under the first instead
// of replacing it. The shell draws the list top right of every page; the
// game screen draws it on the table with the game's own notices.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext";
import { isNewBuild } from "../status";
import { useSettled } from "../useSettled";
import { useLobbyConnection } from "./LobbyConnection";
import {
  NEWS_MS,
  goneOf,
  inArrival,
  lobbyNoticeOf,
  newsOf,
  questionArrived,
  questionKey,
  versionWaits,
  type NewsItem,
  type Notice,
} from "../notices";
import { playChime, soundsOn } from "../sounds";
import { setTitleCount } from "../tabTitle";

/** How often an open page asks whether the server has been updated. */
const VERSION_CHECK_MS = 60_000;

async function buildIdNow(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return null;
    const body = (await response.json()) as { buildId?: unknown };
    return typeof body.buildId === "string" ? body.buildId : null;
  } catch {
    return null;
  }
}

/**
 * A page loaded before an update keeps running the old screens until it
 * is reloaded (seen 2026-10-21: the joining player had the pre-Phase-7
 * match view while the host had the new one).
 */
function useNewVersion(): boolean {
  const loadedWith = useRef<string | null>(null);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      const now = await buildIdNow();
      if (!alive) return;
      if (loadedWith.current === null) loadedWith.current = now;
      else if (isNewBuild(loadedWith.current, now)) setStale(true);
    };
    void check();
    const timer = window.setInterval(() => void check(), VERSION_CHECK_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return stale;
}

const PageNoticesContext = createContext<Notice[]>([]);

/** The page's notices, for the game screen to draw on the table. */
export function usePageNotices(): Notice[] {
  return useContext(PageNoticesContext);
}

/** Is this the game screen, where a game is being played or watched? */
export function isGameRoute(pathname: string): boolean {
  return pathname === "/game" || pathname.startsWith("/watch/");
}

export function PageNoticesProvider({ children }: { children: ReactNode }) {
  const { lobby, setLobby, send } = useLobbyConnection();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const stale = useNewVersion();
  const [versionClosed, setVersionClosed] = useState(false);
  // Shown only when it lasts: a refresh or a blip is not news (owner 2026-10-24).
  const reconnecting = useSettled(lobby.connection === "reconnecting", 1500);
  // Questions put aside with ×: still answerable from the Lobby.
  const [asideInvite, setAsideInvite] = useState<string | null>(null);
  const [asideAsk, setAsideAsk] = useState<string | null>(null);
  const [news, setNews] = useState<(NewsItem & { key: string })[]>([]);
  const newsCount = useRef(0);
  const order = useRef(new Map<string, number>());

  // News is taken off the lobby state as it arrives: queued, not replaced.
  useEffect(() => {
    const roomNews = lobby.notice !== null && !lobbyNoticeOf(lobby.notice).problem;
    const arrived: NewsItem[] = [
      ...lobby.news.map(newsOf),
      ...lobby.invitationGone.map(goneOf),
      ...(roomNews && lobby.notice ? [lobbyNoticeOf(lobby.notice)] : []),
    ];
    if (arrived.length === 0) return;
    setNews((list) => [
      ...list,
      ...arrived.map((item) => ({ ...item, key: `news-${(newsCount.current += 1)}` })),
    ]);
    setLobby((previous) => ({
      ...previous,
      news: previous.news.slice(lobby.news.length),
      invitationGone: previous.invitationGone.slice(lobby.invitationGone.length),
      notice: roomNews ? null : previous.notice,
    }));
  }, [lobby.news, lobby.invitationGone, lobby.notice, setLobby]);

  const toLobby = useCallback(() => {
    if (pathname !== "/play") void navigate("/play");
  }, [navigate, pathname]);

  const inGame = versionWaits(pathname, lobby.match?.status ?? null);

  const notices = useMemo(() => {
    const list: Notice[] = [];
    if (lobby.connection === "ended") {
      list.push({
        key: "ended",
        tone: "red",
        label: "Signed out",
        title: "Your session ended",
        line: "You were signed out, perhaps from another tab or device.",
        actions: [
          {
            label: "Sign in again",
            primary: true,
            run: () => void signOut().then(() => navigate("/login", { replace: true })),
          },
        ],
      });
    } else if (reconnecting) {
      // §5.133 — a page that stopped being told must say so. It
      // reconnects on its own (owner report 2026-10-21).
      list.push({
        key: "reconnecting",
        tone: "blue",
        label: "Connection",
        title: "Reconnecting…",
        line: "The connection dropped. This page catches up by itself as soon as it's back.",
        actions: [],
      });
    }
    const invitation = lobby.invitation;
    if (invitation && asideInvite !== invitation.roomId) {
      list.push({
        key: `invited-${invitation.roomId}`,
        tone: "gold",
        label: "Invitation",
        title: `${invitation.from.displayName} invited you to ${invitation.roomName}`,
        line: "One seat is held for you. Close this and you can still accept from the room list in the Lobby.",
        actions: [
          { label: "Decline", run: () => send({ type: "INVITE_DECLINE" }) },
          {
            label: "Accept",
            primary: true,
            run: () => {
              send({ type: "INVITE_ACCEPT", roomId: invitation.roomId });
              toLobby();
            },
          },
        ],
        close: () => setAsideInvite(invitation.roomId),
      });
    }
    const askedBy = lobby.askedBy;
    const askKey = askedBy ? `${askedBy.roomId}:${askedBy.from.userId}` : null;
    if (askedBy && asideAsk !== askKey) {
      list.push({
        key: `asked-${askKey}`,
        tone: "gold",
        label: "Request to join",
        title: `${askedBy.from.displayName} would like to join your room`,
        line: "Their seat is held until you answer. You can also answer from the seat in your room.",
        actions: [
          { label: "Decline", run: () => send({ type: "JOIN_DECLINE" }) },
          {
            label: "Accept",
            primary: true,
            run: () => {
              send({ type: "JOIN_ACCEPT" });
              toLobby();
            },
          },
        ],
        close: () => setAsideAsk(askKey),
      });
    }
    if (lobby.setupProblem) {
      // §5.100 — about YOUR deck, sent only to you; goes when the room changes.
      list.push({
        key: "setup",
        tone: "red",
        label: "Your deck",
        title: "Your deck needs attention",
        line: lobby.setupProblem.detail,
        actions: [],
        close: () => setLobby((previous) => ({ ...previous, setupProblem: null })),
      });
    }
    if (lobby.notice && lobbyNoticeOf(lobby.notice).problem) {
      const problem = lobbyNoticeOf(lobby.notice);
      list.push({
        key: `problem-${lobby.notice.errorCode}`,
        tone: "red",
        label: problem.label,
        title: problem.title,
        line: problem.line,
        actions: [],
        close: () => setLobby((previous) => ({ ...previous, notice: null })),
      });
    }
    for (const item of news) {
      list.push({
        key: item.key,
        tone: "gold",
        label: item.label,
        title: item.title,
        line: item.line,
        actions: [],
        close: () => setNews((all) => all.filter((n) => n.key !== item.key)),
        fadeMs: NEWS_MS,
      });
    }
    // A new version during a game waits until the game is over.
    if (stale && !versionClosed && !inGame) {
      list.push({
        key: "version",
        tone: "blue",
        label: "New version",
        title: "Proxic Arena has been updated",
        line: "Reload to get the new version. Nothing you're doing is lost.",
        actions: [{ label: "Reload", primary: true, run: () => window.location.reload() }],
        close: () => setVersionClosed(true),
      });
    }
    return inArrival(list, order.current);
  }, [
    lobby.connection,
    lobby.invitation,
    lobby.askedBy,
    lobby.setupProblem,
    lobby.notice,
    reconnecting,
    asideInvite,
    asideAsk,
    news,
    stale,
    versionClosed,
    inGame,
    send,
    setLobby,
    signOut,
    navigate,
    toLobby,
  ]);

  // Spec 0050 — a question waiting chimes once and counts in the tab's title.
  const questions = (lobby.invitation ? 1 : 0) + (lobby.askedBy ? 1 : 0);
  const waiting = questionKey(lobby.invitation?.roomId ?? null, lobby.askedBy?.from.userId ?? null);
  const heard = useRef(questionKey(null, null));
  useEffect(() => {
    const fresh = questionArrived(heard.current, waiting);
    heard.current = waiting;
    if (fresh && soundsOn()) playChime();
  }, [waiting]);
  useEffect(() => setTitleCount("questions", questions), [questions]);
  useEffect(() => () => setTitleCount("questions", 0), []);

  return <PageNoticesContext.Provider value={notices}>{children}</PageNoticesContext.Provider>;
}
