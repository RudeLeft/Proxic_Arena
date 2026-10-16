// Deck import client — PHASE_02 §2.81–§2.86.
//
// Deliberately UI-free, like status.ts: the import state machine and
// the error shaping are where mistakes would be, and both should be
// testable without a browser.

import { apiFetch } from "./auth";

/** §2.84 — the simple state model. No fake fine-grained progress. */
export type ImportState = "idle" | "selected" | "uploading" | "validating" | "imported" | "failed";

export interface ImportedDeck {
  deckId: string;
  displayName: string;
  status: string;
  totalCards: number;
  distinctCards: number;
  artStored: number;
  entriesWithoutArt: number;
}

export interface ImportFailure {
  errorCode: string;
  detail: string;
  problems: string[];
  /** The existing deck, when the failure is a duplicate. */
  existingDeckId?: string;
}

export interface DeckSummary {
  deckId: string;
  displayName: string;
  totalCards: number;
  distinctCards: number;
  importedAt: string;
  /** PHASE_04 §4.73 — who owns it. "Shared by Pat" needs a name. */
  ownerDisplayName: string;
}

/**
 * The Deck Depot library — §4.58, §4.59.
 *
 * Two named lists rather than one array with a flag, because §4.60
 * asks that nobody assume they may manage a deck merely shared with
 * them. A shape that cannot express "mixed" enforces that better
 * than a field the page has to remember to read.
 */
export interface DeckLibrary {
  mine: DeckSummary[];
  sharedWithMe: DeckSummary[];
}

export const EMPTY_LIBRARY: DeckLibrary = { mine: [], sharedWithMe: [] };

export interface DeckEntryView {
  lineNumber: number;
  quantity: number;
  cardName: string;
  setCode?: string;
  collectorNumber?: string;
  resolutionStatus: string;
  artUrl?: string;
}

export interface DeckDetail {
  /** §4.41 — OWNER or SHARED, decided by the server. */
  access?: "OWNER" | "SHARED";
  ownerDisplayName?: string;
  deckId: string;
  displayName: string;
  totalCards: number;
  distinctCards: number;
  importedAt: string;
  entries: DeckEntryView[];
}

/**
 * Human-readable headings for the server's error codes (§2.86).
 *
 * The server's `detail` is already a sentence; this adds the
 * category so a player sees "That is not a Proxic Deck Builder
 * package" rather than `NOT_A_ZIP`. An unknown code falls back to
 * the detail alone, because a new server code must not produce a
 * blank screen on an old client.
 */
const ERROR_HEADINGS: Record<string, string> = {
  NOT_A_ZIP: "That file is not a deck package",
  ARCHIVE_TOO_LARGE: "That package is too large",
  EMPTY_ARCHIVE: "That package is empty",
  NO_DECK_LIST: "No decklist in that package",
  MULTIPLE_DECK_LISTS: "That package has more than one decklist",
  UNSAFE_PATH: "That package contains an unsafe file path",
  DUPLICATE_PATH: "That package contains two files with the same name",
  UNEXPECTED_ENTRY: "That package contains something unexpected",
  COMPRESSION_RATIO: "That package expands too much to be a deck",
  TOO_MANY_ENTRIES: "That package contains too many files",
  TOO_MANY_IMAGES: "That package contains too many images",
  INVALID_DECK_LIST: "The decklist could not be read",
  DECK_NOT_LEGAL: "That deck is not legal in Open Format",
  CARDS_NOT_RESOLVED: "Forge does not recognise every card in that deck",
  INVALID_ARTWORK: "That package contains artwork that is not a usable image",
  DUPLICATE_PACKAGE: "That deck has already been imported",
  IMPORT_DISABLED: "Deck import is turned off on this server",
  NO_FILE: "No file was selected",
};

export function headingFor(errorCode: string): string | null {
  return ERROR_HEADINGS[errorCode] ?? null;
}

/**
 * Upload a package.
 *
 * Returns a discriminated result rather than throwing: a rejected
 * package is an ordinary outcome the page must display, not an
 * exception (§2.86 — the user should never be told to read container
 * logs for a package mistake).
 */
export async function importDeck(
  file: File,
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; deck: ImportedDeck } | { ok: false; failure: ImportFailure }> {
  const body = new FormData();
  body.append("package", file, file.name);

  let response: Response;
  try {
    // apiFetch, not fetch: every deck endpoint now requires a
    // session (PHASE 3 AMENDMENT 1) and every mutation requires the
    // CSRF header (§3.52). A plain fetch here produced a 403 that
    // looked like a permissions bug and was a missing header.
    response = await apiFetch("/api/decks/import", { method: "POST", body }, fetchFn);
  } catch {
    return {
      ok: false,
      failure: {
        errorCode: "NETWORK",
        detail: "The server could not be reached. Is it running?",
        problems: [],
      },
    };
  }

  if (response.status === 201) {
    return { ok: true, deck: (await response.json()) as ImportedDeck };
  }

  const payload = (await response.json().catch(() => null)) as
    | (ImportFailure & { problems?: string[] })
    | null;

  if (!payload) {
    return {
      ok: false,
      failure: {
        errorCode: "UNREADABLE_RESPONSE",
        detail: `The server answered ${response.status} with something unreadable.`,
        problems: [],
      },
    };
  }

  const failure: ImportFailure = {
    errorCode: payload.errorCode,
    detail: payload.detail,
    problems: payload.problems ?? [],
  };

  // A duplicate carries the existing deck id in `problems`, so the
  // page can link to the deck already imported rather than telling
  // the player a dead end (§2.75, owner decision D3).
  const existing = failure.problems[0];
  // `exactOptionalPropertyTypes` means an optional field cannot be
  // assigned `undefined` — the element lookup is only narrowed by
  // checking it, not by checking the array's length.
  if (payload.errorCode === "DUPLICATE_PACKAGE" && existing !== undefined) {
    failure.existingDeckId = existing;
  }
  return { ok: false, failure };
}

export async function listDecks(fetchFn: typeof fetch = fetch): Promise<DeckLibrary> {
  try {
    const response = await fetchFn("/api/decks", { credentials: "same-origin" });
    if (!response.ok) return EMPTY_LIBRARY;
    return (await response.json()) as DeckLibrary;
  } catch {
    return EMPTY_LIBRARY;
  }
}

export async function getDeck(
  deckId: string,
  fetchFn: typeof fetch = fetch,
): Promise<DeckDetail | null> {
  try {
    const response = await fetchFn(`/api/decks/${deckId}`, { credentials: "same-origin" });
    if (!response.ok) return null;
    return (await response.json()) as DeckDetail;
  } catch {
    return null;
  }
}

export interface ShareRecipient {
  userId: string;
  username: string;
  displayName: string;
  sharedAt: string;
}

/**
 * The share list — PHASE_04 §4.99.
 *
 * Only the owner may read this; a recipient gets 403 and the page
 * simply does not show the panel. `null` means "not yours to see",
 * which is a different thing from an empty list.
 */
export async function listShares(
  deckId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShareRecipient[] | null> {
  try {
    const response = await fetchFn(`/api/decks/${deckId}/shares`, { credentials: "same-origin" });
    if (!response.ok) return null;
    const body = (await response.json()) as { shares: ShareRecipient[] };
    return body.shares;
  } catch {
    return null;
  }
}

/** §4.72 — every outcome the owner needs to be told about. */
export type ShareOutcome =
  | { ok: true; created: boolean; recipient: ShareRecipient }
  | { ok: false; message: string };

/**
 * Share a deck with a username — §4.32, §4.72.
 *
 * The server decides; this turns its answer into something a person
 * can read, and never guesses when the server said nothing useful.
 */
export async function shareDeck(
  deckId: string,
  username: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShareOutcome> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/decks/${deckId}/shares`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      },
      fetchFn,
    );
  } catch {
    return { ok: false, message: "That share could not be sent. Try again." };
  }

  if (response.ok) {
    const recipient = (await response.json()) as ShareRecipient;
    // 201 created it; 200 means it was already shared (§4.33).
    return { ok: true, created: response.status === 201, recipient };
  }

  const body = (await response.json().catch(() => null)) as { detail?: string } | null;
  // The server's own wording, because it knows which of the §4.72
  // cases happened. A message invented here would eventually
  // contradict it.
  return { ok: false, message: body?.detail ?? "That share could not be created." };
}

/** §4.34 — revoke by recipient. Idempotent server-side. */
export async function revokeShare(
  deckId: string,
  userId: string,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await apiFetch(
      `/api/decks/${deckId}/shares/${userId}`,
      { method: "DELETE" },
      fetchFn,
    );
    return response.status === 204;
  } catch {
    return false;
  }
}

export async function deleteDeck(deckId: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const response = await apiFetch(`/api/decks/${deckId}`, { method: "DELETE" }, fetchFn);
    return response.status === 204;
  } catch {
    return false;
  }
}
