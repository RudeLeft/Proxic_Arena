// @vitest-environment jsdom

// Spec 0008 — the Deck Depot's close-up and its quick-click rule, in a
// browser-like page without a server: fetch answers as the server would.

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DecksPage from "./DecksPage";
import { CardZoom } from "./CardZoom";
import type { DeckDetail, DeckEntryView } from "./decks";
import { EMPTY_LOBBY } from "./lobby";

// The page reads avatars from the shell's lobby connection; no socket here.
vi.mock("./shell/LobbyConnection", () => ({ useLobbyConnection: () => ({ lobby: EMPTY_LOBBY }) }));

const entry = (
  lineNumber: number,
  cardName: string,
  category: NonNullable<DeckEntryView["category"]>,
  more = {},
) => ({
  lineNumber,
  quantity: 4,
  cardName,
  resolutionStatus: "RESOLVED",
  artUrl: `/api/decks/d/assets/${"a".repeat(63)}${lineNumber}`,
  category,
  ...more,
});

const detail = (deckId: string, displayName: string, entries: DeckEntryView[]): DeckDetail => ({
  access: "OWNER",
  ownerDisplayName: "Pat",
  deckId,
  displayName,
  totalCards: 60,
  distinctCards: entries.length,
  importedAt: "2026-10-24T00:00:00Z",
  entries,
});

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("the close-up (Z1)", () => {
  const cards: DeckEntryView[] = [
    entry(1, "Mountain", "LAND"),
    entry(2, "Delver of Secrets", "CREATURE", {
      backFaceName: "Insectile Aberration",
      backArtUrl: "/api/decks/d/assets/" + "b".repeat(64),
    }),
    entry(3, "Lightning Bolt", "SPELL"),
  ];

  it("shows the full scan, steps with the arrow keys around the deck, and closes on Esc", () => {
    let index = 0;
    const onClose = vi.fn();
    const view = render(
      <CardZoom cards={cards} index={index} onIndex={(next) => (index = next)} onClose={onClose} />,
    );
    expect(screen.getByAltText("Mountain").getAttribute("src")).toBe(
      `${cards[0]!.artUrl}?size=full`,
    );
    expect(screen.getByText("4 copies · 1 of 3")).toBeTruthy();

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "ArrowLeft" });
    expect(index).toBe(2); // round from the first to the last
    view.rerender(
      <CardZoom cards={cards} index={index} onIndex={(next) => (index = next)} onClose={onClose} />,
    );
    fireEvent.keyDown(dialog, { key: "ArrowRight" });
    expect(index).toBe(0);

    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("offers Turn over only for a card with a back face, and shows that face", () => {
    const view = render(<CardZoom cards={cards} index={0} onIndex={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: "Turn over" })).toBeNull();

    view.rerender(<CardZoom cards={cards} index={1} onIndex={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn over" }));
    expect(screen.getByAltText("Insectile Aberration").getAttribute("src")).toBe(
      `${cards[1]!.backArtUrl}?size=full`,
    );
  });
});

describe("the page (C1)", () => {
  it("shows the deck clicked last, however the answers arrive", async () => {
    let releaseFirst: (value: Response) => void = () => {};
    const library = {
      mine: [
        {
          deckId: "burn",
          displayName: "Burn",
          totalCards: 60,
          distinctCards: 1,
          importedAt: "",
          ownerDisplayName: "Pat",
        },
        {
          deckId: "goblins",
          displayName: "Goblins",
          totalCards: 60,
          distinctCards: 1,
          importedAt: "",
          ownerDisplayName: "Pat",
        },
      ],
      sharedWithMe: [],
    };
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/decks") return json(library);
        if (url === "/api/decks/burn")
          return new Promise<Response>((resolve) => (releaseFirst = resolve));
        if (url === "/api/decks/goblins")
          return json(detail("goblins", "Goblins", [entry(1, "Goblin Guide", "CREATURE")]));
        return json(null, 403);
      }),
    );

    render(<DecksPage />);
    fireEvent.click(await screen.findByRole("button", { name: "View Burn" }));
    fireEvent.click(screen.getByRole("button", { name: "View Goblins" }));
    expect(await screen.findByRole("heading", { name: "Goblins" })).toBeTruthy();

    // Burn's answer comes last: it must not replace the deck asked for last.
    await act(async () => {
      releaseFirst(
        new Response(JSON.stringify(detail("burn", "Burn", [entry(1, "Lightning Bolt", "SPELL")]))),
      );
      await Promise.resolve();
    });
    expect(screen.queryByRole("heading", { name: "Burn" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Goblins" })).toBeTruthy();
  });

  it("says when the library could not be loaded, and does not claim it is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("down"))),
    );
    render(<DecksPage />);
    expect(await screen.findByText("Your decks could not be loaded.")).toBeTruthy();
    expect(screen.queryByText("Nothing imported yet.")).toBeNull();
  });
});
