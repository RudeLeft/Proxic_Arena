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
