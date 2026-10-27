// Deck Depot client — PHASE_02 §2.81–§2.86, spec 0022.
//
// Deliberately UI-free, like status.ts. Since spec 0022 decks arrive
// from a linked Proxic Deck Builder, so there is no upload here.

import { apiFetch } from "./auth";

export interface DeckSummary {
  deckId: string;
  displayName: string;
  totalCards: number;
  distinctCards: number;
  importedAt: string;
  /** PHASE_04 §4.73 — who owns it. "Shared by Pat" needs a name. */
  ownerDisplayName: string;
  /** PHASE_07 §7.65 — how many players hold one of YOUR decks; 0 on a lent one. */
  shareCount?: number;
  /** Spec 0012 — the deck's colours in WUBRG order ("" colourless); absent until Forge has said. */
  colors?: string | null;
  /** Spec 0012 — the owner's chosen icon; absent shows the suggestion from [colors]. */
  icon?: string | null;
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
  /** PHASE_07 Amendment 10 — Forge's answer; absent until an older deck is sorted. */
  category?: CardCategory;
  /** Spec 0008 — the face it turns over to, when the deck has its picture. */
  backFaceName?: string;
  backArtUrl?: string;
}

export type CardCategory = "LAND" | "CREATURE" | "SPELL";

export interface CardBand {
  label: string;
  /** Cards, not lines: four Mountains count four. */
  count: number;
  entries: DeckEntryView[];
}

/** Spec 0022 — a token card a deck brought, for its picture in play. */
export interface DeckTokenView {
  quantity: number;
  name: string;
  setCode?: string | null;
  collectorNumber?: string | null;
  artUrl?: string | null;
}

const BANDS: { category: CardCategory; label: string }[] = [
  { category: "LAND", label: "Lands" },
  { category: "CREATURE", label: "Creatures" },
  { category: "SPELL", label: "Spells" },
];

/**
 * An open deck in the bands a player reads it in — PHASE_07
 * Amendment 10. Forge decided each card's category; this only
 * groups. A card with no category yet (a deck imported before the
 * column, waiting for the server's fill) goes in a band of its own
 * rather than being guessed into one. Empty bands are left out, and
 * each band keeps decklist order.
 */
export function bandsOf(entries: DeckEntryView[]): CardBand[] {
  const band = (label: string, of: DeckEntryView[]): CardBand => ({
    label,
    count: of.reduce((sum, entry) => sum + entry.quantity, 0),
    entries: of,
  });
  const bands = BANDS.map(({ category, label }) =>
    band(
      label,
      entries.filter((entry) => entry.category === category),
    ),
  );
  bands.push(
    band(
      "Not sorted yet",
      entries.filter((entry) => !BANDS.some(({ category }) => category === entry.category)),
    ),
  );
  return bands.filter((b) => b.entries.length > 0);
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
  /** Spec 0022 — the token pictures it brought, outside the card count. */
  tokens?: DeckTokenView[];
}

/**
 * Your library; null when it could not be read. Not an empty library:
 * "Nothing imported yet" would be untrue when the server did not answer
 * (spec 0008).
 */
export async function listDecks(fetchFn: typeof fetch = fetch): Promise<DeckLibrary | null> {
  try {
    const response = await fetchFn("/api/decks", { credentials: "same-origin" });
    if (!response.ok) return null;
    return (await response.json()) as DeckLibrary;
  } catch {
    return null;
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

/** Somebody the owner could share with — PHASE_07 Amendment 10. */
export interface ShareCandidate {
  username: string;
  displayName: string;
}

export interface ShareList {
  shares: ShareRecipient[];
  /** Every active player except you and the current holders. */
  candidates: ShareCandidate[];
}

/**
 * The share list — PHASE_04 §4.99, and since PHASE_07 Amendment 10
 * the players it could still go to.
 *
 * Only the owner may read this; a recipient gets 403 and the page
 * simply does not show the panel. `null` means "not yours to see",
 * which is a different thing from an empty list.
 */
export async function listShares(
  deckId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ShareList | null> {
  try {
    const response = await fetchFn(`/api/decks/${deckId}/shares`, { credentials: "same-origin" });
    if (!response.ok) return null;
    const body = (await response.json()) as Partial<ShareList>;
    return { shares: body.shares ?? [], candidates: body.candidates ?? [] };
  } catch {
    return null;
  }
}

/** PHASE_07 §7.65 — the outcome of a rename, in words a person can act on. */
export type RenameOutcome = { ok: true; displayName: string } | { ok: false; message: string };

/**
 * Rename a deck you own. The server trims, checks the name is one
 * line of 1 to 80 characters and not one of your others, and says
 * which when it refuses; its words are shown as they come.
 */
export async function renameDeck(
  deckId: string,
  displayName: string,
  fetchFn: typeof fetch = fetch,
): Promise<RenameOutcome> {
  let response: Response;
  try {
    response = await apiFetch(
      `/api/decks/${deckId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName }),
      },
      fetchFn,
    );
  } catch {
    return { ok: false, message: "The rename could not be sent. Try again." };
  }
  if (response.ok) {
    const body = (await response.json()) as { displayName: string };
    return { ok: true, displayName: body.displayName };
  }
  const body = (await response.json().catch(() => null)) as { detail?: string } | null;
  return { ok: false, message: body?.detail ?? "That deck could not be renamed." };
}

/**
 * Spec 0012 — set a deck's icon (one of the 100 names), or null to go
 * back to the suggestion. The owner only; the server refuses anybody else.
 */
export async function setDeckIcon(
  deckId: string,
  icon: string | null,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const response = await apiFetch(
      `/api/decks/${deckId}/icon`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon }),
      },
      fetchFn,
    );
    return response.ok;
  } catch {
    return false;
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
