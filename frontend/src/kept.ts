// Pages keep their data -- PHASE_11 P11-E7 and P11-E8.
//
// A page used to forget everything when the player left it: coming back to
// the Hall, the Deck Depot or Admin asked the server again and waited a
// round trip (or eight lists) before drawing. Now the last answer each page
// read is kept for the tab, in memory, and drawn at once on the next visit;
// the page still asks again on every visit, and the fresh answer replaces
// the kept one the moment it lands.
//
// Only data a page may draw while it is being read again is kept (the list
// of what is and is not kept is in PHASE_11, "As built: P11-E7 and
// P11-E8"). The rules:
// - Kept for one person: each answer is filed under the user id that read
//   it, and another person's is never handed out; signing out, or a session
//   that expired, forgets everything (AuthContext). Memory only, so a
//   reload, another tab or a closed browser keeps nothing.
// - The latest read wins: an answer is used only if no read of the same
//   data started after it. A list read before an action (an admin disabling
//   an account) that lands after the action's own re-read can never put
//   the old list back (`supersede`).
// - A read that fails keeps what is shown; with nothing kept, the page says
//   it failed, as it did before.

import { useCallback, useEffect, useRef, useState } from "react";

/** The deck library (`/api/decks`): the Deck Depot's and the lobby's deck list. */
export const DECKS_KEY = "decks";

interface Kept {
  user: string;
  value: unknown;
}

const kept = new Map<string, Kept>();
/** The number of the latest read started for each key. */
const latest = new Map<string, number>();
let reads = 0;

/** What [user] last read for [key]; never another person's. */
export function keptFor<T>(user: string | null, key: string): T | undefined {
  if (!user) return undefined;
  const entry = kept.get(key);
  return entry && entry.user === user ? (entry.value as T) : undefined;
}

/** Keep [value] as [user]'s answer for [key]. */
export function keepFor(user: string, key: string, value: unknown): void {
  kept.set(key, { user, value });
}

/**
 * Forget what was kept: everything (signing out), or the keys [which]
 * accepts. A read of a forgotten key already under way is dropped when it
 * lands, so nothing read before can be kept after.
 */
export function forgetKept(which?: (key: string) => boolean): void {
  if (!which) {
    kept.clear();
    latest.clear();
    return;
  }
  for (const key of new Set([...kept.keys(), ...latest.keys()]))
    if (which(key)) {
      kept.delete(key);
      latest.delete(key);
    }
}

/** Start a read of [key]: its number, which `isLatest` compares. */
function begin(key: string): number {
  reads += 1;
  latest.set(key, reads);
  return reads;
}

function isLatest(key: string, read: number): boolean {
  return latest.get(key) === read;
}

/** Reads of [keys] already under way can no longer land (an action changed what they read). */
export function supersede(keys: Iterable<string>): void {
  for (const key of keys) begin(key);
}

/**
 * Read [key] for [user] and keep the answer, unless a later read of it began
 * meanwhile or it was forgotten. Nothing is drawn: a page reads ahead with
 * this what it may need next (Admin's other tabs).
 */
export async function readAhead<T>(
  user: string,
  key: string,
  read: () => Promise<T | null>,
): Promise<void> {
  const number = begin(key);
  const value = await read();
  if (value !== null && isLatest(key, number)) keepFor(user, key, value);
}

export interface KeptData<T> {
  /** The latest answer: kept from an earlier visit until this visit's lands. */
  value: T | undefined;
  /** The latest read failed and nothing is shown. */
  failed: boolean;
  /** Read again now; resolves when the answer is in (or was superseded). */
  refresh: () => Promise<void>;
}

/**
 * The data at [key], read by [read] on every visit (and on `refresh`), drawn
 * from what [user] was kept until the answer lands. [key] or [user] null:
 * nothing to read (not signed in, or the data is not needed now).
 */
export function useKept<T>(
  user: string | null,
  key: string | null,
  read: () => Promise<T | null>,
): KeptData<T> {
  const [shown, setShown] = useState<{
    key: string | null;
    user: string | null;
    value: T | undefined;
  }>(() => ({ key, user, value: key ? keptFor<T>(user, key) : undefined }));
  const [failed, setFailed] = useState(false);
  const readRef = useRef(read);
  readRef.current = read;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!key || !user) return;
    const number = begin(key);
    const value = await readRef.current();
    if (!isLatest(key, number)) return;
    if (value === null) {
      if (alive.current) setFailed(true);
      return;
    }
    keepFor(user, key, value);
    if (!alive.current) return;
    setFailed(false);
    setShown({ key, user, value });
  }, [key, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Another key or person: what is kept for that, at once, in this same draw.
  const value =
    shown.key === key && shown.user === user
      ? shown.value
      : key
        ? keptFor<T>(user, key)
        : undefined;
  return { value, failed: failed && value === undefined, refresh };
}
