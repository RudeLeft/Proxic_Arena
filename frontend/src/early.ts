// The start-up chain, started together -- PHASE_11 P11-E5.
//
// With a session hint, a signed-in page's code, its data and the lobby
// connection start beside "who am I" (`/api/auth/me`) instead of after it,
// one after another (earlyPages.ts has the chain as it was).
//
// The hint is the CSRF cookie, the one cookie the page can read
// (AUTHENTICATION.md "Cookies"): the server sets it with the session and
// clears it at sign-out. It is only a hint. The page still draws nothing
// until "who am I" answers (routes.tsx `RequireAuth`), so no wrong page
// flashes. And a stranger gets the sign-in files and nothing else (owner
// 2026-10-24): one who never signed in has no hint and asks for nothing
// more; one whose session ended elsewhere (the cookie outlives it) is
// refused each thing -- a 404 for a signed-in file, a 401 for the data,
// the lobby connection closed with "authentication required" -- and each
// costs a refusal's few bytes, kept by nobody.
//
// How each start is safe with a wrong hint:
// - Code: each script is asked with `<link rel="modulepreload">`, each
//   style with `<link rel="preload" as="style">` -- the browser's own
//   preloads, which the lazy import in routes.tsx and Vite's style link then
//   use, one download each. Chosen by measuring each way in both engines
//   (RUN, 2026-11-22; PHASE_11 "As built: P11-E5"): a `fetch()` into the
//   cache is downloaded twice by WebKit and fetched again on its reloads; a
//   failed `preload as=script` is remembered by Chromium and a failed
//   `preload as=style` by WebKit, so after signing in the shell would never
//   load or never be styled; a failed modulepreload is remembered by
//   neither. So scripts start on the hint, and styles once "who am I" says
//   signed in (`whoAnswered`), when no refusal can be remembered.
// - Data is asked once and handed to the first reader of that address
//   within FRESH_MS (`primedFetch`), and only before the player's first
//   click or key: after that, a read may follow something they did (a room
//   made, a deck deleted), and must be asked afresh. Unread, it is dropped.
// - The lobby connection's messages are kept until the shell takes it
//   (`takeEarlySocket`), then replayed to it in order, so nothing said
//   before the shell's code arrived is lost.
// - Spec 0122 (P11-E12): on /game and /watch/<room> the game's own
//   connection starts here too, at an address where the server says which
//   game (`/ws/matches/current`, `/ws/matches/watch/<room>`). Its events are
//   kept with the times they arrived, handed to the game screen once
//   (`takeEarlyGame`), and applied only once its hello names the page's game;
//   otherwise the page opens its own connection, as before.

import { csrfToken, type AuthUser } from "./auth";
import { earlyPageFor, type EarlyFiles } from "./earlyPages";

/** How long a primed answer may wait for its reader. */
export const FRESH_MS = 10_000;
/** How long an early lobby connection may wait for the shell to take it. */
export const TAKE_WITHIN_MS = 30_000;

const primed = new Map<string, { at: number; answer: Promise<Response> }>();

/** "Who am I" (auth.ts `fetchAuthState`). */
export const WHO_AM_I = "/api/auth/me";

/** The address the lobby connection uses (shell/LobbyConnection.tsx). */
export function lobbyUrl(): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}/ws/user`;
}

/** The build's list (vite.config.ts `earlyFiles`); null in development or when unreadable. */
function earlyFiles(): EarlyFiles | null {
  try {
    const text = document.getElementById("pa-early")?.textContent;
    if (!text) return null;
    const parsed = JSON.parse(text) as EarlyFiles;
    return Array.isArray(parsed.files) && typeof parsed.pages === "object" ? parsed : null;
  } catch {
    return null;
  }
}

let watching = false;

function prime(path: string): void {
  const already = primed.get(path);
  if (already && Date.now() - already.at <= FRESH_MS) return;
  if (!watching) {
    watching = true;
    // The player's first act ends every primed answer (above).
    const acted = () => {
      primed.clear();
      watching = false;
      removeEventListener("pointerdown", acted, true);
      removeEventListener("keydown", acted, true);
    };
    addEventListener("pointerdown", acted, true);
    addEventListener("keydown", acted, true);
  }
  const answer = fetch(path, { credentials: "same-origin" });
  // A failed ask is the reader's to see; until then it is nobody's.
  answer.catch(() => undefined);
  primed.set(path, { at: Date.now(), answer });
}

/**
 * Start what the page at [path] needs, beside "who am I". Nothing without
 * the hint. Called by main.tsx before the first draw (`who`: "who am I"
 * itself is asked first, for everybody -- the one question every page asks
 * anyway, so a stranger asks nothing more -- ahead of the files, which on a
 * link of six connections at a time would otherwise queue in front of it),
 * and by signing in (the session is then certain).
 */
export function startEarly(
  path: string,
  opts: { who?: boolean; socket?: boolean; certain?: boolean } = {},
): void {
  if (opts.who) prime(WHO_AM_I);
  if (!csrfToken()) return;
  const page = earlyPageFor(path);
  if (!page) return;
  for (const address of page.data(path)) prime(address);
  // Spec 0122 -- the game's connection FIRST, then the lobby's. A browser
  // opens one WebSocket to a host at a time (RFC 6455 4.1: a second waits
  // until the first is open; RUN 2026-11-27, Chromium, not Playwright's
  // WebKit): with the lobby's first, the game's waited for it and a reload
  // gained nothing. On the game page the table is what the player waits for.
  const game = page.game?.(path);
  if (game && opts.socket !== false) openEarlyGame(game.path, game.watching);
  if (page.shell && opts.socket !== false) openEarlySocket();
  const built = earlyFiles();
  styles = [];
  for (const index of built?.pages[page.path] ?? []) {
    const file = built?.files[index];
    if (!file) continue;
    if (file.endsWith(".css")) styles.push(`/${file}`);
    else preload(`/${file}`, "modulepreload");
  }
  if (opts.certain) startStyles();
}

/**
 * P11-E7/E8 -- the code of the pages at [paths] (the header's), fetched
 * ahead once the page in hand is drawn, so a first click on one waits only
 * for its data. The same preload links as above, one download each, kept by
 * the browser like any built file; called only inside the shell, where the
 * session is certain, so the styles go too. Each link is taken out once its
 * file is in: with them left in the page, WebKit measured slower on later
 * clicks (PHASE_11 "As built: P11-E7 and P11-E8"), and nothing needs them
 * once the file is in the browser's module map and cache.
 */
export function preloadPages(paths: readonly string[]): void {
  for (const path of paths)
    for (const item of aheadOf(path)) preload(item.href, item.rel, item.as, true);
}

/** A built file the page fetches ahead: its address and how it is asked. */
interface Ahead {
  href: string;
  rel: "modulepreload" | "preload";
  as?: "style" | "image";
}

/** The files the build names for the page at [path], as preloads (above). */
function aheadOf(path: string): Ahead[] {
  const built = earlyFiles();
  return (built?.pages[path] ?? []).flatMap((index): Ahead[] => {
    const file = built?.files[index];
    if (!file) return [];
    return file.endsWith(".css")
      ? [{ href: `/${file}`, rel: "preload", as: "style" }]
      : [{ href: `/${file}`, rel: "modulepreload" }];
  });
}

/** Each in turn: the next is asked once the one before is in (or failed). */
function inTurn(items: readonly Ahead[], unless: () => boolean = () => false): Promise<void> {
  return items.reduce<Promise<void>>(
    (before, item) =>
      before.then(() =>
        unless()
          ? undefined
          : new Promise<void>((done) => preload(item.href, item.rel, item.as, true, done)),
      ),
    Promise.resolve(),
  );
}

/**
 * P11-E6 -- the game's code, then the common mana pictures, fetched ahead
 * while the player sits in a room (shell/Shell.tsx `useGameAhead`), so
 * "Start match" opens the game on what the browser already has. The same
 * preloads as the header pages' (above): one download each, kept like any
 * built file (a year), each link taken out once its file is in. One file at
 * a time, so a page left (a reload, a click away) has at most one file under
 * way, not the whole game's code sharing the link with the next page. Once
 * per page; a player who never starts a game pays these bytes once per
 * update. Resolves when every file is in, failed, or no longer wanted.
 */
let gameAhead: Promise<void> | null = null;
/**
 * Start match has been pressed on this page (`gameStarting`): nothing more
 * is fetched ahead. Measured (2026-11-25, PHASE_11 "As built: P11-E6"): the
 * game's code or pictures asked while the server starts the game share a
 * slow link with the start's own requests, and the game's first board then
 * came 1.0-1.9 s later on slow 4G. What is not in by then comes with the
 * game's page, as before.
 */
let pressed = false;

export function preloadGame(): Promise<void> {
  const stop = () => pressed;
  gameAhead ??= inTurn(aheadOf("/game"), stop)
    .then(async () => {
      if (pressed) return;
      const mana = await import("./battlefield/manaPictures");
      await inTurn(
        mana.commonPictures().map((href): Ahead => ({ href, rel: "preload", as: "image" })),
        stop,
      );
    })
    .catch(() => undefined); // the pictures come with the game, as before
  return gameAhead;
}

/** P11-E6 -- Start match pressed (LobbyPage): stop fetching the game ahead (`pressed`). */
export function gameStarting(): void {
  pressed = true;
}

/** Tests only: forget everything fetched ahead. */
export function forgetAhead(): void {
  gameAhead = null;
  pressed = false;
  askedAhead.clear();
}

/** The page's styles, held until the session is certain (above). */
let styles: string[] = [];

function startStyles(): void {
  for (const href of styles) preload(href, "preload", "style");
  styles = [];
}

/** Every file this page has fetched ahead, its link since taken out (P11-E6): never asked twice. */
const askedAhead = new Set<string>();

function preload(href: string, rel: string, as?: string, drop = false, done?: () => void): void {
  if (document.head.querySelector(`link[href="${href}"]`) || askedAhead.has(href)) {
    done?.();
    return;
  }
  const link = document.createElement("link");
  if (drop) {
    askedAhead.add(href);
    link.addEventListener(
      "load",
      () => {
        link.remove();
        done?.();
      },
      { once: true },
    );
    link.addEventListener("error", () => done?.(), { once: true });
  }
  link.rel = rel;
  if (as) link.as = as;
  // As the module scripts and Vite's style links ask (crossorigin), so the
  // preload is the one they use. A picture is asked by a plain <img>, with
  // no crossorigin: a preload that said one would not be the one it uses.
  if (as !== "image") link.crossOrigin = "anonymous";
  link.href = href;
  document.head.append(link);
}

/**
 * "Who am I" answered: an administrator's page asks for its own lists now
 * (they are refused to a player, so never on the hint alone); somebody not
 * signed in drops everything started.
 */
export function whoAnswered(user: AuthUser | null, path: string, search = ""): void {
  if (!user) {
    endEarly();
    return;
  }
  startStyles();
  const page = earlyPageFor(path);
  if (user.role === "ADMIN") for (const address of page?.adminData?.(search) ?? []) prime(address);
}

/**
 * P11-E7/E8 -- a move inside the app (a header link): the page's data is
 * asked now, beside its code, not after the code has arrived. The click
 * that made the move came before this, so the answers follow it (the rule
 * above: never one read before the player's last act), and the page takes
 * them as it opens (`primedFetch`). [user] is the one signed in.
 */
export function startVisit(path: string, search: string, user: AuthUser): void {
  const page = earlyPageFor(path);
  if (!page) return;
  for (const address of page.data(path)) prime(address);
  if (user.role === "ADMIN") for (const address of page.adminData?.(search) ?? []) prime(address);
}

/** Drop every early start: signed out, or nobody to take it. */
export function endEarly(): void {
  primed.clear();
  styles = [];
  endEarlyGame();
  const socket = early;
  early = null;
  if (socket) {
    clearTimeout(socket.timer);
    try {
      socket.real.close();
    } catch {
      /* already closed */
    }
  }
}

/** A `fetch` that hands a primed GET answer to its first reader, and asks afresh otherwise. */
export const primedFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? "GET").toUpperCase();
  if (typeof input === "string" && method === "GET") {
    const kept = primed.get(input);
    if (kept) {
      primed.delete(input);
      if (Date.now() - kept.at <= FRESH_MS) return kept.answer;
    }
  }
  return fetch(input, init);
};

// --- the lobby connection ---------------------------------------------------

interface Early {
  real: WebSocket;
  /** What it said before the shell took it, in order. */
  past: Event[];
  /** Once taken: where each new event goes. */
  forward: ((event: Event) => void) | null;
  timer: ReturnType<typeof setTimeout>;
}

let early: Early | null = null;

function openEarlySocket(): void {
  if (early) return;
  let real: WebSocket;
  try {
    real = new WebSocket(lobbyUrl());
  } catch {
    return; // the shell opens its own, as before
  }
  const started: Early = {
    real,
    past: [],
    forward: null,
    // Nobody took it (the page never reached the shell): let it go.
    timer: setTimeout(() => {
      if (early === started) endEarly();
    }, TAKE_WITHIN_MS),
  };
  for (const type of ["open", "message", "close", "error"])
    real.addEventListener(type, (event) => {
      if (started.forward) started.forward(event);
      else started.past.push(event);
    });
  early = started;
}

/** The same event, fresh, for a second target. */
function copy(event: Event): Event {
  if (event.type === "message")
    return new MessageEvent("message", { data: (event as MessageEvent).data as unknown });
  if (event.type === "close") {
    const closed = event as CloseEvent;
    return new CloseEvent("close", {
      code: closed.code,
      reason: closed.reason,
      wasClean: closed.wasClean,
    });
  }
  return new Event(event.type);
}

/** The early connection as the shell sees it: its past replayed, then live. */
class Taken extends EventTarget {
  constructor(private readonly real: WebSocket) {
    super();
  }
  get readyState(): number {
    return this.real.readyState;
  }
  get url(): string {
    return this.real.url;
  }
  send(data: string): void {
    this.real.send(data);
  }
  close(code?: number, reason?: string): void {
    this.real.close(code, reason);
  }
}

/**
 * The lobby connection opened beside "who am I", for the shell to use as its
 * first (lobby.ts `connectLobby`): null when there is none for [url]. What it
 * said already is replayed once the caller's listeners are on (a microtask
 * later), then everything is passed on as it comes.
 */
export function takeEarlySocket(url: string): WebSocket | null {
  const taken = early;
  if (!taken) return null;
  early = null;
  clearTimeout(taken.timer);
  if (taken.real.url !== url) {
    taken.real.close();
    return null;
  }
  const target = new Taken(taken.real);
  let live = false;
  taken.forward = (event) => {
    if (live) target.dispatchEvent(copy(event));
    else taken.past.push(event);
  };
  queueMicrotask(() => {
    for (const event of taken.past) target.dispatchEvent(copy(event));
    taken.past.length = 0;
    live = true;
  });
  return target as unknown as WebSocket;
}

// --- the game connection (spec 0122, P11-E12) -------------------------------
//
// Opened beside "who am I" on a load of /game or /watch/<room>, before the
// page knows its game: the server resolves the address (the game this user
// is seated in; the game that room is playing) and names it in MATCH_HELLO.
// The game keeps its own connection, separate from the lobby's (owner
// 2026-11-27). Every event is kept with the time it arrived, so a board that
// waited in here while the page's code came is not taken for late (match.ts
// `connectMatch` reads `arrivedAt`).
//
// Never a new kind of drop (spec 0120): an untaken one is closed only when
// the page leaves the game (`endEarlyGame`) or after TAKE_WITHIN_MS; one
// whose hello names another game is closed only once the page's own
// connection has opened (`EarlyGameSocket`), so the seat is never left with none.

/** One event of the early game connection, with the times it arrived. */
interface KeptEvent {
  event: Event;
  /** Date.now() at the event: what the lateness rule reads (`sentAt` is the server's clock). */
  at: number;
  /** performance.now() at the event. */
  mono: number;
}

interface EarlyGame {
  real: WebSocket;
  watching: boolean;
  past: KeptEvent[];
  forward: ((kept: KeptEvent) => void) | null;
  timer: ReturnType<typeof setTimeout>;
}

let earlyGame: EarlyGame | null = null;

/** The address an early game connection uses, for [path] (`/ws/matches/...`). */
export function earlyGameUrl(path: string): string {
  const scheme = location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${location.host}${path}`;
}

function openEarlyGame(path: string, watching: boolean): void {
  if (earlyGame) return;
  let real: WebSocket;
  try {
    real = new WebSocket(earlyGameUrl(path));
  } catch {
    return; // the game screen opens its own, as before
  }
  const started: EarlyGame = {
    real,
    watching,
    past: [],
    forward: null,
    // Nobody took it (the page never reached its table): let it go.
    timer: setTimeout(() => {
      if (earlyGame === started) endEarlyGame();
    }, TAKE_WITHIN_MS),
  };
  for (const type of ["open", "message", "close", "error"])
    real.addEventListener(type, (event) => {
      const kept = { event, at: Date.now(), mono: performance.now() };
      if (started.forward) started.forward(kept);
      else started.past.push(kept);
    });
  earlyGame = started;
}

/**
 * The page will not take the early game connection (no game, the page left
 * before its table, signed out): closed at once. Nothing when there is none.
 */
export function endEarlyGame(): void {
  const game = earlyGame;
  earlyGame = null;
  if (!game) return;
  clearTimeout(game.timer);
  try {
    game.real.close();
  } catch {
    /* already closed */
  }
}

/** Spec 0122 -- each replayed event's kept arrival time (Date.now() then). */
const arrivals = new WeakMap<Event, number>();

/**
 * When [event] arrived, if the early connection kept it and replayed it
 * later (Date.now() at its arrival); undefined for one handled as it came.
 */
export function arrivedAt(event: Event): number | undefined {
  return arrivals.get(event);
}

/** Spec 0122 -- the close of an early address with no game behind it (server `NO_GAME_CODE`). */
export const NO_GAME_CODE = 4003;

/** The performance mark a page makes when its game came by the early connection (HID-004: a run can show it). */
export const EARLY_GAME_MARK = "pa-game-early";

/** The match id a message names, if it is a hello or the game's end ("" for one without an id); else null. */
function namesGame(event: Event): string | null {
  if (event.type !== "message") return null;
  const data = (event as MessageEvent).data as unknown;
  if (typeof data !== "string") return null;
  try {
    const parsed = JSON.parse(data) as Record<string, unknown>;
    if (parsed["type"] !== "MATCH_HELLO" && parsed["type"] !== "MATCH_ENDED") return null;
    return typeof parsed["matchId"] === "string" ? parsed["matchId"] : "";
  } catch {
    return null;
  }
}

type Handler = ((event: Event) => void) | null;

/**
 * The early game connection as connectMatch sees it, for its first open.
 * Nothing is passed on until a hello (or the game's end) names the page's
 * game; then everything kept is replayed in order, each with its kept
 * arrival time, and the rest passed on as it comes. If it names another
 * game, or the connection closes before naming one (4003 "no game", or any
 * other close), the page's own connection is opened instead and used from
 * then on: the early one is closed once the own one has opened (or failed).
 */
class EarlyGameSocket extends EventTarget {
  onopen: Handler = null;
  onmessage: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  private current: WebSocket;
  private deciding = true;
  private held: KeptEvent[] = [];
  private closed = false;

  constructor(
    private readonly early: EarlyGame,
    private readonly matchId: string,
    private readonly own: () => WebSocket,
    private readonly noGame?: () => void,
  ) {
    super();
    this.current = early.real;
    // Once the caller's handlers are on (a microtask later), as takeEarlySocket.
    queueMicrotask(() => {
      const past = early.past.splice(0);
      for (const kept of past) this.fromEarly(kept);
      early.forward = (kept) => this.fromEarly(kept);
    });
  }

  get readyState(): number {
    return this.current.readyState;
  }
  get url(): string {
    return this.current.url;
  }
  send(data: string): void {
    this.current.send(data);
  }
  close(code?: number, reason?: string): void {
    this.closed = true;
    this.early.forward = null;
    if (this.current !== this.early.real) this.current.close(code, reason);
    try {
      this.early.real.close();
    } catch {
      /* already closed */
    }
  }

  private fire(event: Event, at?: number): void {
    const fresh = copy(event);
    if (at !== undefined) arrivals.set(fresh, at);
    const handler = this[`on${event.type}` as "onopen"];
    handler?.call(this, fresh);
    this.dispatchEvent(fresh);
  }

  private fromEarly(kept: KeptEvent): void {
    if (this.closed) return;
    if (!this.deciding) {
      if (this.current === this.early.real) this.fire(kept.event, kept.at);
      return;
    }
    this.held.push(kept);
    const named = namesGame(kept.event);
    if (named === this.matchId) {
      // The page's game: everything kept, in order, at the times it came.
      this.deciding = false;
      performance.mark?.(EARLY_GAME_MARK);
      for (const one of this.held.splice(0)) this.fire(one.event, one.at);
    } else if (named !== null || kept.event.type === "close") {
      this.useOwn();
      // 4003: the server says this player is in no game now (it ended while
      // the page loaded): the page asks /api/matches/current again.
      if (kept.event.type === "close" && (kept.event as CloseEvent).code === NO_GAME_CODE)
        this.noGame?.();
    }
  }

  /** The page's own connection, as before; the early one closed once that has opened (or gone). */
  private useOwn(): void {
    this.deciding = false;
    this.held = [];
    const early = this.early.real;
    const letGo = () => {
      try {
        early.close();
      } catch {
        /* already closed */
      }
    };
    let own: WebSocket;
    try {
      own = this.own();
    } catch {
      letGo();
      this.fire(new CloseEvent("close", { code: 1006 }));
      return;
    }
    this.current = own;
    for (const type of ["open", "message", "close", "error"])
      own.addEventListener(type, (event) => {
        if (type === "open" || type === "close") letGo();
        if (!this.closed) this.fire(event);
      });
  }
}

/**
 * Spec 0122 -- the early game connection, for the game screen's first
 * connection to [matchId] (connectMatch's `first`): null when there is none,
 * when it was opened for the other kind of page ([watching]: a player's or a
 * spectator's). [own] opens the page's own
 * connection, for when the early one turns out not to be for this game.
 */
export function takeEarlyGame(opts: {
  matchId: string;
  watching: boolean;
  own: () => WebSocket;
  /** Closed 4003 "no game" before naming one: the game may have ended while the page loaded. */
  noGame?: () => void;
}): WebSocket | null {
  const taken = earlyGame;
  if (!taken) return null;
  earlyGame = null;
  clearTimeout(taken.timer);
  // A closed one is still taken: what it said before closing decides (a
  // hello or the end naming this game is replayed; else the page's own).
  if (taken.watching !== opts.watching) {
    try {
      taken.real.close();
    } catch {
      /* already closed */
    }
    return null;
  }
  return new EarlyGameSocket(taken, opts.matchId, opts.own, opts.noGame) as unknown as WebSocket;
}
