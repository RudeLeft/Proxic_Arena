// @vitest-environment jsdom

// Spec 0114 (F-0114-D) -- the player pages' words as a player reads them
// on the page (docs/features/wording/0114-wording-table.md): each page
// is rendered from what its server answers, and the words -- visible,
// aria-label and the screen reader's hidden text -- are read off it.
// The words built in plain functions are in wording0114.test.ts.

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "./auth";
import { EMPTY_LOBBY, type LobbyState, type RoomView } from "./lobby";
import { forgetKept } from "./kept";

interface Held {
  auth: AuthState;
  lobby: LobbyState;
  signIn: (u: string, p: string) => Promise<unknown>;
  signOutEverywhere: () => Promise<number | null>;
  setLobby: () => void;
  send: () => void;
}

const held: Held = vi.hoisted(() => ({
  auth: { status: "loading" },
  lobby: {} as LobbyState,
  signIn: () => Promise.resolve(null),
  signOutEverywhere: () => Promise.resolve(3),
  // Stable, as the shell's are: a new function each render re-runs the page's effects.
  setLobby: () => {},
  send: () => {},
}));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    state: held.auth,
    signIn: held.signIn,
    signOut: () => Promise.resolve(),
    signOutEverywhere: held.signOutEverywhere,
    sessionExpired: () => {},
    setUser: () => {},
  }),
  RequireAuth: ({ children }: { children: unknown }) => children,
}));
vi.mock("./shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: held.lobby, setLobby: held.setLobby, send: held.send }),
}));
vi.mock("html-to-image", () => ({
  toJpeg: () => Promise.resolve("data:image/jpeg;base64,/9j/4AAQ"),
  toPng: () => Promise.resolve("data:image/png;base64,iVBORw0KGgo"),
}));

import { AccountPage } from "./AccountPage";
import { Avatar } from "./avatars";
import DecksPage from "./DecksPage";
import { shareDeck } from "./decks";
import HallPage from "./HallPage";
import type { Hall } from "./hall";
import { JoinPage } from "./JoinPage";
import { ChatPanel } from "./LobbyChat";
import LobbyPage from "./LobbyPage";
import { LoginPage } from "./LoginPage";
import { ReportDialog, whoseTurnWords } from "./ReportDialog";
import { ResetPage } from "./ResetPage";

const NOW = Date.now();
const me = { userId: "u-me", username: "me", displayName: "Me", role: "PLAYER" };
const pat = { userId: "u-pat", username: "pat", displayName: "Pat" };
const sam = { userId: "u-sam", username: "sam", displayName: "Sam" };

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

/** A fetch answering by address; anything else is a 404. */
function serve(routes: Record<string, () => Promise<Response>>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => (routes[url] ?? (() => json({ detail: "no" }, 404)))()),
  );
}

const page = (element: React.ReactElement, path = "/") =>
  render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);

/** Lets the page's fetches answer and React draw what they brought. */
const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

beforeEach(() => {
  forgetKept();
  held.auth = { status: "authenticated", user: me };
  held.lobby = EMPTY_LOBBY;
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.location.hash = "";
  document.body.innerHTML = "";
});

describe("the account pages (W2-008..W2-017)", () => {
  it("W2-008, W2-014, W2-015, W2-016: the Account page", async () => {
    serve({});
    page(<AccountPage />);
    expect(screen.getByText("Needed, up to 12 characters")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose an avatar" })).toBeTruthy();
    expect(screen.queryByText(/Choose an avatar \(/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out all" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    expect(
      await screen.findByText("Signed out of three sessions. You'll be taken to sign in."),
    ).toBeTruthy();
  });

  it("W2-014: one session", async () => {
    held.signOutEverywhere = () => Promise.resolve(1);
    serve({});
    page(<AccountPage />);
    fireEvent.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    expect(
      await screen.findByText("Signed out of one session. You'll be taken to sign in."),
    ).toBeTruthy();
    held.signOutEverywhere = () => Promise.resolve(3);
  });

  it("W2-009, W2-010, W2-011: the join page's rules", async () => {
    held.auth = { status: "anonymous" };
    window.location.hash = "#a-token";
    serve({
      "/api/auth/join/peek": () =>
        json({ email: "a@b.c", invitedBy: "Pat", suggestedUsername: "" }),
    });
    page(<JoinPage />);
    expect(
      await screen.findByText(
        "What you sign in with: three to 32 letters, digits, dots, underscores or hyphens",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/What other players see, up to 12 characters\. You can change it/),
    ).toBeTruthy();
    expect(
      screen.getByText("a username (three to 32 letters, digits, dots, underscores or hyphens)"),
    ).toBeTruthy();
  });

  it("W2-012: a dead invitation", async () => {
    held.auth = { status: "anonymous" };
    serve({});
    page(<JoinPage />);
    expect(
      await screen.findByText(
        /^It may have been used already or canceled, or it may have expired\. Ask whoever invited you for a new one\.$/,
      ),
    ).toBeTruthy();
  });

  it("W2-013: a dead reset link", async () => {
    held.auth = { status: "anonymous" };
    serve({});
    page(<ResetPage />);
    expect(
      await screen.findByText(
        /^It may have been used already or replaced by a newer one, or it may have expired \(links last an hour\)\./,
      ),
    ).toBeTruthy();
  });

  it("W2-017: signing in too often", async () => {
    held.auth = { status: "anonymous" };
    held.signIn = () =>
      Promise.resolve({
        errorCode: "TOO_MANY_ATTEMPTS",
        detail: "Too many sign-in attempts. Try again in about 15 minutes.",
      });
    serve({});
    page(<LoginPage />);
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "pat" } });
    fireEvent.change(screen.getByLabelText("Password", { exact: true }), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "This is only a short wait, not a lock. Nothing has been switched off, and no one can lock you out by guessing.",
    );
    expect(alert.textContent).not.toMatch(/throttle/i);
  });
});

// --- the lobby -----------------------------------------------------------------------

const myRoom = (over: Partial<RoomView> = {}): RoomView => ({
  roomId: "r-me",
  name: "Me's room",
  hostUserId: me.userId,
  presetId: "open-format",
  desiredPlayerCount: 2,
  status: "OPEN",
  revision: 1,
  everyoneReady: false,
  members: [
    {
      ...me,
      seatNumber: 1,
      ready: false,
      isHost: true,
      deckSelected: false,
      selectedDeckId: null,
      selectedDeckName: null,
    },
  ],
  ...over,
});

const lobbyWithRoom = (over: Partial<LobbyState> = {}): LobbyState => ({
  ...EMPTY_LOBBY,
  connection: "open",
  presence: [me, pat],
  players: [me, pat, { ...sam, lastSeenAt: new Date(NOW - 130 * 60_000).toISOString() }],
  room: myRoom(),
  rooms: [
    {
      roomId: "r-me",
      name: "Me's room",
      hostUserId: me.userId,
      status: "OPEN",
      desiredPlayerCount: 2,
      seats: [{ seatNumber: 1, userId: me.userId, displayName: "Me", ready: false, isHost: true }],
      clearsAt: new Date(NOW + 4.5 * 60_000).toISOString(),
      warnsAt: new Date(NOW - 30_000).toISOString(),
      held: { ...pat, asked: false },
    },
  ],
  outgoing: { roomId: "r-me", to: pat },
  ...over,
});

const library = (decks: unknown[] = []) => ({ mine: decks, sharedWithMe: [] });

describe("the lobby (W2-033..W2-040)", () => {
  it("W2-033, W2-034, W2-036, W2-037, W2-038, W2-039: your room and the players", async () => {
    held.lobby = lobbyWithRoom();
    serve({ "/api/decks": () => json(library()) });
    page(<LobbyPage />);
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(
      "This room closes in five minutes because nothing has happened.",
    );
    expect(screen.getByText("Invited, waiting for an answer")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the Deck Depot to add a deck" })).toBeTruthy();
    const taken = document.querySelector(".pa-room-taken")!;
    expect(taken.textContent).toBe("One of two seats taken");
    expect(taken.getAttribute("data-taken")).toBe("1/2");
    expect(screen.getByText("One online")).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Offline \(one player\)/ })).toBeTruthy();
  });

  it("W2-038: nobody else online", async () => {
    held.lobby = lobbyWithRoom({ presence: [me], outgoing: null });
    serve({ "/api/decks": () => json(library()) });
    page(<LobbyPage />);
    await settle();
    expect(screen.getByText("Nobody else online")).toBeTruthy();
  });

  it("W2-035: a deck in the room's list", async () => {
    held.lobby = lobbyWithRoom();
    serve({
      "/api/decks": () =>
        json(
          library([
            {
              deckId: "d-1",
              displayName: "Burn",
              totalCards: 60,
              distinctCards: 10,
              importedAt: "",
              ownerDisplayName: "Me",
            },
          ]),
        ),
    });
    page(<LobbyPage />);
    await settle();
    expect(screen.getByRole("option", { name: "Burn (60 cards)" })).toBeTruthy();
  });

  it("W2-040: a dialog's close button is 'Close'", async () => {
    const guest = {
      ...pat,
      seatNumber: 2,
      ready: false,
      isHost: false,
      deckSelected: false,
      selectedDeckId: null,
      selectedDeckName: null,
    };
    const room = myRoom();
    held.lobby = lobbyWithRoom({
      room: { ...room, members: [...room.members, guest] },
      outgoing: null,
    });
    serve({ "/api/decks": () => json(library()) });
    page(<LobbyPage />);
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Remove Pat" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Put this aside for now" })).toBeNull();
  });
});

describe("the chat (W2-041..W2-043, W2-157)", () => {
  const line = (id: string, from = pat, reactions?: Record<string, string[]>) => ({
    id,
    fromUserId: from.userId,
    displayName: from.displayName,
    text: `line ${id}`,
    sentAt: new Date(NOW).toISOString(),
    ...(reactions ? { reactions } : {}),
  });

  it("says the new lines in words, reads a reaction's names, and names its pick", () => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    const lobby = { ...EMPTY_LOBBY, presence: [me, pat, sam] };
    const props = { lobby, me: me.userId, onSay: () => {}, onReact: () => {} };
    const view = render(
      <ChatPanel {...props} lines={[line("1", pat, { "👍": [pat.userId, sam.userId] })]} />,
    );
    view.rerender(
      <ChatPanel
        {...props}
        lines={[
          line("1", pat, { "👍": [pat.userId, sam.userId] }),
          line("2"),
          line("3"),
          line("4"),
        ]}
      />,
    );
    expect(screen.getByText("Three new")).toBeTruthy();
    expect(screen.getByRole("button", { name: "👍 from Pat and Sam" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "React to this line" })[0]!);
    expect(screen.getAllByRole("button", { name: /^React with / }).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Type a message…")).toBeTruthy();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });
});

// --- the Deck Depot ---------------------------------------------------------------

describe("the Deck Depot (W2-045..W2-053)", () => {
  const summary = (deckId: string, name: string, shareCount: number) => ({
    deckId,
    displayName: name,
    totalCards: 60,
    distinctCards: 3,
    importedAt: "2026-10-24T00:00:00Z",
    ownerDisplayName: "Me",
    shareCount,
  });
  const entry = (n: number, cardName: string, quantity: number, category: string) => ({
    lineNumber: n,
    quantity,
    cardName,
    resolutionStatus: "RESOLVED",
    artUrl: null,
    category,
  });

  it("says counts in words, in the list and on the open deck", async () => {
    serve({
      "/api/decks": () =>
        json({ mine: [summary("d-1", "Burn", 2), summary("d-2", "Elves", 1)], sharedWithMe: [] }),
      "/api/decks/d-1": () =>
        json({
          access: "OWNER",
          ownerDisplayName: "Me",
          deckId: "d-1",
          displayName: "Burn",
          totalCards: 60,
          distinctCards: 3,
          importedAt: "2026-10-24T00:00:00Z",
          entries: [
            entry(1, "Mountain", 24, "LAND"),
            entry(2, "Goblin Guide", 1, "CREATURE"),
            entry(3, "Lightning Bolt", 4, "SPELL"),
          ],
          tokens: [
            { quantity: 1, name: "Goblin" },
            { quantity: 1, name: "Treasure" },
            { quantity: 1, name: "Clue" },
          ],
        }),
      "/api/decks/d-1/shares": () =>
        json({
          shares: [{ ...pat, sharedAt: "2026-10-24T00:00:00Z" }],
          candidates: [],
        }),
    });
    page(<DecksPage />);
    expect(await screen.findByText("60 cards · shared with two players")).toBeTruthy();
    expect(screen.getByText("60 cards · shared with one player")).toBeTruthy();
    expect(screen.getByLabelText("Two decks")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View Burn" }));
    expect(await screen.findByRole("group", { name: "Creatures, one card" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Lands, 24 cards" })).toBeTruthy();
    expect(screen.getByLabelText("Four copies")).toBeTruthy();
    expect(screen.getByLabelText("One copy")).toBeTruthy();
    expect(screen.getByLabelText("Tokens, three pictures")).toBeTruthy();
    expect(screen.getByText("Different cards")).toBeTruthy();
    expect(screen.queryByText("Distinct")).toBeNull();

    const stop = await screen.findByRole("button", { name: "Stop sharing with Pat" });
    expect(stop.textContent).toBe("Stop sharing");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("down"))),
    );
    fireEvent.click(stop);
    expect(await screen.findByText("Sharing could not be stopped. Try again.")).toBeTruthy();
  });

  it("W2-053: a share that never reached the server", async () => {
    const outcome = await shareDeck("d-1", "pat", () => Promise.reject(new Error("down")));
    expect(outcome).toEqual({ ok: false, message: "The deck could not be shared. Try again." });
  });
});

// --- the Hall ---------------------------------------------------------------------

describe("the Hall (W2-055..W2-067, W2-154)", () => {
  const row = (userId: string, rank: number, move: number | null) => ({
    userId,
    rank,
    move,
    rating: 1100,
    change: 10,
    wins: 4,
    losses: 1,
    draws: 1,
    form: "WLDWW",
    badges: [],
    deck: null,
  });
  const hall = (over: Partial<Hall> = {}): Hall => ({
    season: {
      number: 3,
      month: "2026-11",
      endsAt: new Date(NOW + 5 * 86_400_000).toISOString(),
      places: [
        { place: 1, userId: pat.userId, rating: 1200, wins: 5, games: 6 },
        { place: 2, userId: sam.userId, rating: 1100, wins: 4, games: 6 },
        { place: 3, userId: me.userId, rating: 1000, wins: 3, games: 6 },
      ],
    },
    belt: {
      holder: pat.userId,
      since: new Date(NOW - 3 * 86_400_000).toISOString(),
      defences: 3,
      defendBy: new Date(NOW + 4 * 86_400_000).toISOString(),
      idleDays: 7,
    },
    board: [row(pat.userId, 1, 2), row(sam.userId, 2, -1)],
    allTime: [],
    qualifying: [{ userId: me.userId, games: 2, wins: 1 }],
    records: [],
    rivalries: [{ a: pat.userId, b: sam.userId, aWins: 3, bWins: 1, draws: 0 }],
    rival: null,
    latest: [],
    past: [],
    ...over,
  });

  it("says places, counts and the table's headings in words", async () => {
    held.lobby = { ...EMPTY_LOBBY, players: [me, pat, sam] };
    serve({ "/api/hall": () => json(hall()) });
    page(<HallPage />);
    expect(await screen.findByText("First place")).toBeTruthy();
    expect(screen.getByText("Second place")).toBeTruthy();
    expect(screen.getByText("Third place")).toBeTruthy();
    expect(screen.getByText(/· defended three times/)).toBeTruthy();
    expect(
      screen.getByText(
        "Finish a game every seven days, or the belt passes to the top-rated active player.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Rank" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Won · Lost · Drawn" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Favorite deck" })).toBeTruthy();
    expect(screen.getByLabelText("Up two places")).toBeTruthy();
    expect(screen.getByLabelText("Down one place")).toBeTruthy();
    expect(screen.getAllByLabelText("Last five: won, lost, drawn, won, won").length).toBe(2);
    expect(screen.getByText("Playing their way in · five games to be ranked")).toBeTruthy();
    expect(document.querySelector(".pa-hp-q")!.textContent).toMatch(/two of five$/);
    fireEvent.click(screen.getByRole("tab", { name: "Rivalries" }));
    const score = screen.getByLabelText("three wins to one");
    expect(score.textContent).toBe("3 to 1");
    expect(document.body.textContent).not.toMatch(/–|1st|2nd|3rd|Favourite/);

    fireEvent.click(screen.getByRole("button", { name: /How ratings work|rating/i }));
    expect(screen.getByRole("tooltip").textContent).toContain(
      "You need five games in a season to be ranked.",
    );
  });

  it("W2-057, W2-060: defended once, and nobody ranked yet", async () => {
    held.lobby = { ...EMPTY_LOBBY, players: [me, pat, sam] };
    const base = hall();
    serve({
      "/api/hall": () => json(hall({ belt: { ...base.belt, defences: 1 }, board: [] })),
    });
    page(<HallPage />);
    expect(await screen.findByText(/· defended once/)).toBeTruthy();
    expect(
      screen.getByText("Nobody is ranked yet: five finished games put a player on the board."),
    ).toBeTruthy();
  });

  it("W2-056: a place's ring is read aloud in words", () => {
    render(<Avatar avatar={null} size={40} rank={3} />);
    expect(screen.getByRole("img", { name: "Third place" })).toBeTruthy();
  });
});

// --- the report dialog ------------------------------------------------------------

describe("the report dialog (W2-077..W2-080)", () => {
  it("W2-077, W2-078, W2-080: the form's words, and the facts without a raw phase", async () => {
    serve({ "/api/version": () => json({ proxicVersion: "1.75.0" }) });
    page(
      <ReportDialog
        picture={null}
        onClose={() => {}}
        game={{
          matchId: "m-1",
          opponent: "Sam",
          turn: 3,
          whose: whoseTurnWords(false, "Sam"),
          step: "",
          cards: [],
        }}
      />,
      "/game",
    );
    await settle();
    expect(screen.getByText(/or choose or paste a picture/)).toBeTruthy();
    expect(
      screen.getByText(
        "Also: what your screen did in the last 15 minutes (clicks, messages and errors), the Proxic version, and your browser and screen size.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Turn 3 · Sam’s turn")).toBeTruthy();
    expect(whoseTurnWords(false, null)).toBe("the other player’s turn");
    expect(whoseTurnWords(true, "Me")).toBe("Your turn");
  });

  it("W2-079: the sent note names the report's number once", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/reports" ? json({ number: 42 }, 201) : json({ proxicVersion: "1.75.0" }),
      ),
    );
    page(<ReportDialog picture={null} onClose={() => {}} />, "/play");
    await settle();
    fireEvent.change(screen.getByLabelText(/What happened\?/), {
      target: { value: "The lobby froze." },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Send/ }));
    const sent = await screen.findByRole("status");
    expect(sent.textContent).toMatch(
      /It went to the admins with your page’s log\. It is report #42, if you want to mention it\./,
    );
    expect(sent.textContent).not.toMatch(/Number #/);
  });
});
