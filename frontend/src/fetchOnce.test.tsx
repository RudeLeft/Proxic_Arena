// @vitest-environment jsdom

// PHASE_11 P11-E16 -- each page's data read once per load. The Hall read
// /api/hall twice on every cold load: once on opening, and again when the
// lobby socket's first STANDINGS arrived (the list as it stands on joining,
// which the page had just read). It still reads again when a finished game
// moves the standings.

import { act, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Hall } from "./hall";
import { EMPTY_LOBBY, type LobbyState, type Standings } from "./lobby";
import { forgetKept } from "./kept";

const held = vi.hoisted(() => ({ lobby: {} as LobbyState }));

vi.mock("./AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", user: { userId: "u-me", username: "me", displayName: "Me" } },
  }),
}));
vi.mock("./shell/LobbyConnection", () => ({
  useLobbyConnection: () => ({ lobby: held.lobby, setLobby: () => {}, send: () => {} }),
}));

import HallPage from "./HallPage";

const hall = (season: number): Hall => ({
  season: {
    number: season,
    month: "2026-11",
    endsAt: new Date(Date.now() + 86_400_000).toISOString(),
    places: [],
  },
  belt: { holder: null, since: null, defences: 0, defendBy: null, idleDays: 7 },
  board: [],
  allTime: [],
  qualifying: [],
  records: [],
  rivalries: [],
  rival: null,
  latest: [],
  past: [],
});

const standings = (belt: string | null): Standings => ({ podium: [], last: null, belt });

const settle = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });

let answers: (() => void)[] = [];
let reads = 0;

beforeEach(() => {
  forgetKept();
  held.lobby = EMPTY_LOBBY;
  answers = [];
  reads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url !== "/api/hall") return Promise.resolve(new Response("{}", { status: 404 }));
      reads += 1;
      const season = reads;
      // Each answer waits until the test lets it go, so the socket's list can arrive first.
      return new Promise<Response>((resolve) => {
        answers.push(() =>
          resolve(
            new Response(JSON.stringify(hall(season)), {
              headers: { "Content-Type": "application/json" },
            }),
          ),
        );
      });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const draw = () => (
  <MemoryRouter>
    <HallPage />
  </MemoryRouter>
);

describe("the Hall reads /api/hall once per load (P11-E16)", () => {
  it("not again for the socket's first standings, even while the first read is out", async () => {
    const view = render(draw());
    expect(reads).toBe(1);
    // The socket joins and sends the standings before the Hall has answered.
    held.lobby = { ...EMPTY_LOBBY, standings: standings(null) };
    view.rerender(draw());
    await settle();
    expect(reads).toBe(1);
    // The first read still lands.
    answers[0]!();
    await settle();
    expect(screen.getByText(/Season 1/)).toBeTruthy();

    // A finished game moves the standings: read again, and that one is shown.
    held.lobby = { ...EMPTY_LOBBY, standings: standings("u-pat") };
    view.rerender(draw());
    await settle();
    expect(reads).toBe(2);
    answers[1]!();
    await settle();
    expect(screen.getByText(/Season 2/)).toBeTruthy();
  });

  it("opened with the standings already in (an in-app visit): one read", async () => {
    held.lobby = { ...EMPTY_LOBBY, standings: standings(null) };
    render(draw());
    await settle();
    expect(reads).toBe(1);
  });

  it("an older read never replaces a newer one", async () => {
    held.lobby = { ...EMPTY_LOBBY, standings: standings(null) };
    const view = render(draw());
    held.lobby = { ...EMPTY_LOBBY, standings: standings("u-pat") };
    view.rerender(draw());
    await settle();
    expect(reads).toBe(2);
    answers[1]!();
    await settle();
    answers[0]!();
    await settle();
    expect(screen.getByText(/Season 2/)).toBeTruthy();
  });

  it("still draws under StrictMode's double effects", async () => {
    render(<StrictMode>{draw()}</StrictMode>);
    await settle();
    for (const answer of answers) answer();
    await settle();
    expect(screen.getByText(/Season/)).toBeTruthy();
  });
});
