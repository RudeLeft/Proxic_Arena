// @vitest-environment jsdom

// PHASE_11 P11-E5 -- the start-up chain, started together. With a session
// hint a signed-in page's data, code and lobby connection start beside "who
// am I"; without one nothing more is asked than before (owner 2026-10-24: a
// stranger gets the sign-in files and nothing else).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FRESH_MS,
  TAKE_WITHIN_MS,
  WHO_AM_I,
  endEarly,
  lobbyUrl,
  primedFetch,
  startEarly,
  takeEarlySocket,
  whoAnswered,
} from "./early";
import { EARLY_PAGES, earlyFilesOf, earlyPageFor, type BuiltChunk } from "./earlyPages";
import { EMPTY_LOBBY, connectLobby, reduceLobby, type LobbyState, type RoomView } from "./lobby";
import { avatarOf } from "./lobbyView";
import type { AuthUser } from "./auth";

class FakeSocket extends EventTarget {
  static made: FakeSocket[] = [];
  readyState = 0;
  closed = false;
  sent: string[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.made.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
  }
  opened() {
    this.readyState = 1;
    this.dispatchEvent(new Event("open"));
  }
  says(message: Record<string, unknown>) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
}

const asked: string[] = [];
const hint = (on: boolean) => {
  document.cookie = on
    ? "proxicarena_csrf=token; path=/"
    : "proxicarena_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
};
const user = (role: string): AuthUser => ({
  userId: "u-1",
  username: "pat",
  displayName: "Pat",
  role,
});

beforeEach(() => {
  asked.length = 0;
  FakeSocket.made = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string) => {
      asked.push(input);
      return Promise.resolve(new Response(JSON.stringify({ asked: input })));
    }),
  );
  document.head.innerHTML = `<script type="application/json" id="pa-early">${JSON.stringify({
    files: ["assets/shell.js", "assets/shell.css", "assets/lobby.js", "assets/hall.js"],
    pages: { "/play": [0, 1, 2], "/hall": [0, 1, 3] },
  })}</script>`;
});

afterEach(() => {
  endEarly();
  hint(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a stranger", () => {
  it("asks who they are and nothing else, on every page", () => {
    hint(false);
    for (const path of ["/play", "/hall", "/admin", "/game", "/login", "/"]) {
      startEarly(path, { who: true });
    }
    expect(asked).toEqual([WHO_AM_I]);
    expect(FakeSocket.made).toHaveLength(0);
  });

  it("whose session ended elsewhere drops everything the hint started", async () => {
    hint(true);
    startEarly("/play", { who: true });
    expect(FakeSocket.made).toHaveLength(1);
    whoAnswered(null, "/play");
    expect(FakeSocket.made[0]!.closed).toBe(true);
    expect(takeEarlySocket(lobbyUrl())).toBeNull();
    // A primed answer is gone: the next reader asks afresh.
    await primedFetch("/api/decks");
    expect(asked.filter((a) => a === "/api/decks")).toHaveLength(2);
  });
});

describe("with the hint", () => {
  it("starts the page's data, its code and the lobby connection beside who am I", () => {
    hint(true);
    startEarly("/play", { who: true });
    expect(asked).toEqual([WHO_AM_I, "/api/rooms/current", "/api/matches/current", "/api/decks"]);
    expect(FakeSocket.made.map((s) => s.url)).toEqual([lobbyUrl()]);
    const links = () =>
      [...document.head.querySelectorAll("link")].map((l) => `${l.rel} ${l.getAttribute("href")}`);
    // Scripts at once, as modulepreloads; never fetched into the cache.
    expect(links()).toEqual(["modulepreload /assets/shell.js", "modulepreload /assets/lobby.js"]);
    // Styles once who am I says signed in: a refused style preload is remembered (WebKit).
    whoAnswered(user("PLAYER"), "/play");
    expect(links()).toEqual([
      "modulepreload /assets/shell.js",
      "modulepreload /assets/lobby.js",
      "preload /assets/shell.css",
    ]);
  });

  it("asks for no style when who am I says nobody", () => {
    hint(true);
    startEarly("/play", { who: true });
    whoAnswered(null, "/play");
    expect(document.head.querySelectorAll('link[rel="preload"]')).toHaveLength(0);
  });

  it("hands a primed answer to its first reader once, and never a stale one", async () => {
    vi.useFakeTimers();
    hint(true);
    startEarly("/hall");
    expect(asked.filter((a) => a === "/api/hall")).toHaveLength(1);
    await primedFetch("/api/hall");
    expect(asked.filter((a) => a === "/api/hall")).toHaveLength(1);
    await primedFetch("/api/hall");
    expect(asked.filter((a) => a === "/api/hall")).toHaveLength(2);

    endEarly();
    startEarly("/hall");
    vi.advanceTimersByTime(FRESH_MS + 1);
    await primedFetch("/api/hall");
    expect(asked.filter((a) => a === "/api/hall")).toHaveLength(4);
    // Only a GET is ever handed over.
    startEarly("/decks");
    await primedFetch("/api/decks", { method: "POST" });
    await primedFetch("/api/decks");
    expect(asked.filter((a) => a === "/api/decks")).toHaveLength(2);
  });

  it("hands nothing primed over once the player has clicked or typed", async () => {
    hint(true);
    startEarly("/play");
    window.dispatchEvent(new Event("pointerdown"));
    await primedFetch("/api/rooms/current");
    expect(asked.filter((a) => a === "/api/rooms/current")).toHaveLength(2);
    startEarly("/hall");
    window.dispatchEvent(new Event("keydown"));
    await primedFetch("/api/hall");
    expect(asked.filter((a) => a === "/api/hall")).toHaveLength(2);
  });

  it("asks an administrator's lists only once who am I says administrator", () => {
    hint(true);
    startEarly("/admin", { who: true });
    expect(asked.some((a) => a.startsWith("/api/admin/"))).toBe(false);
    whoAnswered(user("PLAYER"), "/admin");
    expect(asked.some((a) => a.startsWith("/api/admin/"))).toBe(false);
    whoAnswered(user("ADMIN"), "/admin");
    expect(asked.filter((a) => a.startsWith("/api/admin/"))).toHaveLength(7);
  });

  it("a page outside the shell holds no lobby connection", () => {
    hint(true);
    startEarly("/status");
    startEarly("/login");
    expect(FakeSocket.made).toHaveLength(0);
  });

  it("lets an early connection nobody takes go", () => {
    vi.useFakeTimers();
    hint(true);
    startEarly("/play");
    vi.advanceTimersByTime(TAKE_WITHIN_MS);
    expect(FakeSocket.made[0]!.closed).toBe(true);
    expect(takeEarlySocket(lobbyUrl())).toBeNull();
  });
});

describe("the shell takes the early connection", () => {
  it("replays what it said before the shell's code came, in order, then passes the rest on", async () => {
    hint(true);
    startEarly("/play");
    const early = FakeSocket.made[0]!;
    // Said while the shell's code was still on its way.
    early.opened();
    early.says({ type: "HELLO", userId: "u-1" });
    early.says({ type: "PLAYERS", players: [{ userId: "u-2", displayName: "Sam" }] });

    let state: LobbyState = EMPTY_LOBBY;
    const socket = connectLobby(
      lobbyUrl(),
      (next) => {
        state = next(state);
      },
      FakeSocket as unknown as typeof WebSocket,
      { first: takeEarlySocket },
    );
    // One connection only: the early one.
    expect(FakeSocket.made).toHaveLength(1);
    await Promise.resolve();
    expect(state.connection).toBe("open");
    expect(state.players.map((p) => p.userId)).toEqual(["u-2"]);

    early.says({ type: "PLAYERS", players: [{ userId: "u-3", displayName: "Lee" }] });
    expect(state.players.map((p) => p.userId)).toEqual(["u-3"]);
    socket.send({ type: "ACTIVITY", away: false });
    expect(early.sent).toEqual([JSON.stringify({ type: "ACTIVITY", away: false })]);
    socket.close();
    expect(early.closed).toBe(true);
  });

  it("opens its own when there is none", () => {
    hint(false);
    startEarly("/play");
    connectLobby(lobbyUrl(), () => {}, FakeSocket as unknown as typeof WebSocket, {
      first: takeEarlySocket,
    });
    expect(FakeSocket.made).toHaveLength(1);
  });
});

describe("the build's list of each page's files", () => {
  const chunk = (fileName: string, more: Partial<BuiltChunk> = {}): BuiltChunk => ({
    fileName,
    isEntry: false,
    imports: [],
    moduleIds: [],
    css: [],
    ...more,
  });

  it("names each page's chunks and styles once, without the entry's", () => {
    const pages = EARLY_PAGES.flatMap((p) => p.modules);
    const chunks = [
      chunk("entry.js", { isEntry: true, imports: ["shared.js"], css: ["entry.css"] }),
      chunk("shared.js"),
      chunk("deep.js"),
      ...[...new Set(pages)].map((m) =>
        chunk(`${m}.js`, {
          moduleIds: [`C:\\app\\src\\${m.replace(/\//g, "\\")}`],
          imports: ["shared.js", "deep.js"],
          css: m === "shell/Shell.tsx" ? ["shell.css"] : [],
        }),
      ),
    ];
    const built = earlyFilesOf(chunks);
    const of = (path: string) => (built.pages[path] ?? []).map((i) => built.files[i]);
    expect(of("/play")).toEqual(["shell/Shell.tsx.js", "shell.css", "deep.js", "LobbyPage.tsx.js"]);
    expect(of("/status")).toEqual(["App.tsx.js", "deep.js"]);
    expect(new Set(built.files).size).toBe(built.files.length);
    expect(built.files).not.toContain("entry.js");
    expect(built.files).not.toContain("shared.js");
  });

  it("covers every page routes.tsx loads lazily", () => {
    const routes = readFileSync(join(__dirname, "routes.tsx"), "utf8");
    const lazy = [...routes.matchAll(/lazy\(\(\) => import\("\.\/([\w/]+)"\)/g)]
      .map((m) => `${m[1]}.tsx`)
      .filter((m) => !m.startsWith("battlefield/Dev"));
    const listed = new Set(EARLY_PAGES.flatMap((p) => p.modules));
    expect(lazy.length).toBeGreaterThan(5);
    for (const module of lazy) expect(listed, module).toContain(module);
    for (const path of ["/play", "/hall", "/decks", "/account", "/admin", "/game", "/status"])
      expect(routes, path).toContain(`path="${path}"`);
    expect(earlyPageFor("/")?.path).toBe("/play");
    expect(earlyPageFor("/watch/r-1")?.data("/watch/r-1")).toEqual(["/api/matches/watch/r-1"]);
    expect(earlyPageFor("/login")).toBeNull();
  });
});

describe("a room's seats say their faces (owner 2026-11-22)", () => {
  const room = (avatar: string | null | undefined): RoomView => ({
    roomId: "r-1",
    name: "Pat's room",
    hostUserId: "u-1",
    presetId: "OPEN_FORMAT_1V1",
    desiredPlayerCount: 2,
    status: "OPEN",
    revision: 1,
    everyoneReady: false,
    members: [
      {
        userId: "u-2",
        username: "sam",
        displayName: "Sam",
        seatNumber: 2,
        ready: false,
        isHost: false,
        deckSelected: false,
        selectedDeckId: null,
        selectedDeckName: null,
        ...(avatar === undefined ? {} : { avatar }),
      },
    ],
  });

  it("draws the other seat's own face before the players list lands, and the list wins after", () => {
    expect(avatarOf({ ...EMPTY_LOBBY, room: room("avatar-07") }, "u-2")).toBe("avatar-07");
    expect(avatarOf({ ...EMPTY_LOBBY, room: room(null) }, "u-2")).toBeNull();
    const listed = {
      ...EMPTY_LOBBY,
      room: room("avatar-07"),
      players: [{ userId: "u-2", username: "sam", displayName: "Sam", avatar: "avatar-09" }],
    };
    expect(avatarOf(listed, "u-2")).toBe("avatar-09");
  });

  it("reads a seat's face as the room data says it: a name, the default (null), or not said", () => {
    const seat = (userId: string, more: Record<string, unknown>) => ({
      userId,
      displayName: userId,
      ...more,
    });
    const next = reduceLobby(EMPTY_LOBBY, {
      type: "ROOM",
      room: {
        roomId: "r-1",
        hostUserId: "a",
        members: [
          seat("a", { avatar: "avatar-07" }),
          seat("b", { avatar: null }),
          seat("c", {}),
          seat("d", { avatar: "not-one-of-ours" }),
        ],
      },
    });
    const faces = next.room?.members.map((m) => ("avatar" in m ? m.avatar : "unsaid"));
    expect(faces).toEqual(["avatar-07", null, "unsaid", null]);
  });
});
