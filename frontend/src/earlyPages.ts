// What each signed-in page needs before it can be used -- PHASE_11 P11-E5
// (the start-up chain).
//
// A signed-in page used to wait for five or six steps one after another:
// index.html, the entry code, "who am I" (`/api/auth/me`), the shell's code,
// the page's code, then the page's data, with the lobby connection last. On
// a 150 ms link each step is a round trip. With a session hint (early.ts),
// the shell's code, the page's code, its data and the lobby connection now
// all start beside "who am I"; the page still draws nothing until "who am
// I" has answered (routes.tsx `RequireAuth`), so no wrong page can flash.
//
// One list, read twice: by the build (vite.config.ts `earlyFiles`, which
// writes each page's built files into index.html) and by the page itself
// (early.ts). An address not listed here starts nothing early.

export interface EarlyPage {
  /** The address; `prefix` for one that carries a part of its own (`/watch/<room>`). */
  path: string;
  prefix?: boolean;
  /** Its code: the files routes.tsx loads lazily for it, relative to src. */
  modules: readonly string[];
  /** Inside the shell, so it holds the lobby connection (shell/LobbyConnection.tsx). */
  shell: boolean;
  /** What it reads on opening, for anybody signed in: GET addresses. */
  data: (path: string) => readonly string[];
  /**
   * What it reads on opening for an administrator only, for the address's
   * query ([search], "?tab=games"): asked once "who am I" says so.
   */
  adminData?: (search: string) => readonly string[];
}

/**
 * P11-E7 -- the Admin page's lists, and which each tab reads on opening (the
 * page reads the open tab's and the overview, not all seven: AdminPage.tsx).
 */
export const ADMIN_LISTS = {
  accounts: "/api/admin/accounts",
  invites: "/api/admin/invites",
  rooms: "/api/admin/rooms",
  matches: "/api/admin/matches",
  reports: "/api/admin/reports",
  signIns: "/api/admin/sign-ins",
  computers: "/api/admin/computers",
} as const;
export type AdminList = keyof typeof ADMIN_LISTS;

export const ADMIN_TAB_LISTS: Record<string, readonly AdminList[]> = {
  accounts: ["accounts", "invites"],
  rooms: ["rooms"],
  games: ["matches"],
  reports: ["reports"],
  "sign-ins": ["signIns"],
  computers: ["computers"],
  email: [],
  records: ["accounts"],
  server: [],
};

/** The start of the viewer's day, as the overview's `since` says it. */
export function dayStart(now = new Date()): string {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.toISOString();
}

/** The tiles' and tab counts' numbers (server `AdminOverview.kt`), counted from [since]. */
export const adminOverviewAddress = (since = dayStart()) =>
  `/api/admin/overview?since=${encodeURIComponent(since)}`;

/** The tab an Admin address opens: its `tab`, or Accounts. */
export function adminTabOf(search: string): string {
  const asked = new URLSearchParams(search).get("tab");
  return asked !== null && asked in ADMIN_TAB_LISTS ? asked : "accounts";
}

/** What the Admin page at [search] reads on opening: the open tab's lists and the overview. */
export function adminOpening(search: string): string[] {
  return [
    ...ADMIN_TAB_LISTS[adminTabOf(search)]!.map((list) => ADMIN_LISTS[list]),
    adminOverviewAddress(),
  ];
}

const SHELL = "shell/Shell.tsx";
const none = () => [];

export const EARLY_PAGES: readonly EarlyPage[] = [
  {
    path: "/play",
    modules: [SHELL, "LobbyPage.tsx"],
    shell: true,
    // LobbyPage's first effect: the room and the match a refresh lands back
    // in (§5.119, §6.114), and the deck list.
    data: () => ["/api/rooms/current", "/api/matches/current", "/api/decks"],
  },
  { path: "/hall", modules: [SHELL, "HallPage.tsx"], shell: true, data: () => ["/api/hall"] },
  { path: "/decks", modules: [SHELL, "DecksPage.tsx"], shell: true, data: () => ["/api/decks"] },
  { path: "/account", modules: [SHELL, "AccountPage.tsx"], shell: true, data: none },
  {
    path: "/admin",
    modules: [SHELL, "AdminPage.tsx"],
    shell: true,
    data: none,
    // AdminPage's opening reads: refused to a player, so asked only for an
    // administrator; the open tab's lists and the overview (P11-E7).
    adminData: adminOpening,
  },
  {
    path: "/game",
    modules: [SHELL, "GamePage.tsx"],
    shell: true,
    data: () => ["/api/matches/current"],
  },
  {
    path: "/watch/",
    prefix: true,
    modules: [SHELL, "WatchPage.tsx"],
    shell: true,
    data: (path) => {
      const room = path.slice("/watch/".length);
      return room && !room.includes("/") ? [`/api/matches/watch/${room}`] : [];
    },
  },
  {
    path: "/status",
    modules: ["App.tsx"],
    shell: false,
    data: none,
    // App `fetchStatus`; the page is the administrators' (spec 0114).
    adminData: () => ["/api/version", "/api/system/status"],
  },
];

/** The page at [path], or null; "/" is the lobby once signed in (routes.tsx `Home`). */
export function earlyPageFor(path: string): EarlyPage | null {
  const at = path === "/" ? "/play" : path.replace(/\/+$/, "") || "/";
  return (
    EARLY_PAGES.find((page) => (page.prefix ? at.startsWith(page.path) : at === page.path)) ?? null
  );
}

/** A built chunk, as much of it as `earlyFilesOf` reads (Rollup's OutputChunk). */
export interface BuiltChunk {
  fileName: string;
  isEntry: boolean;
  imports: readonly string[];
  moduleIds: readonly string[];
  css: readonly string[];
}

/** What the build writes into index.html: every file once, and each page's by number. */
export interface EarlyFiles {
  files: string[];
  pages: Record<string, number[]>;
}

/**
 * Each page's built files: the chunk of each of its modules, the chunks they
 * import, and their styles -- leaving out the entry's own, which the page has
 * already. Built files are named by their hash alone, and the entry already
 * names every one of them (it imports them), so this names nothing new.
 */
export function earlyFilesOf(chunks: readonly BuiltChunk[]): EarlyFiles {
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  const closure = (start: BuiltChunk[]): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    const walk = (chunk: BuiltChunk) => {
      if (seen.has(chunk.fileName)) return;
      seen.add(chunk.fileName);
      out.push(chunk.fileName, ...chunk.css);
      for (const next of chunk.imports) {
        const found = byFile.get(next);
        if (found) walk(found);
      }
    };
    start.forEach(walk);
    return out;
  };
  const loaded = new Set(closure(chunks.filter((c) => c.isEntry)));
  const files: string[] = [];
  const pages: Record<string, number[]> = {};
  for (const page of EARLY_PAGES) {
    const own = page.modules.map((module) => {
      const chunk = chunks.find((c) =>
        c.moduleIds.some((id) => id.replace(/\\/g, "/").endsWith(`/src/${module}`)),
      );
      if (!chunk) throw new Error(`P11-E5: no built chunk holds src/${module}`);
      return chunk;
    });
    pages[page.path] = [...new Set(closure(own))]
      .filter((file) => !loaded.has(file))
      .map((file) => {
        const at = files.indexOf(file);
        return at >= 0 ? at : files.push(file) - 1;
      });
  }
  return { files, pages };
}
