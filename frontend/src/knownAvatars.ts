// Who wears which avatar, known before the lobby connection says -- PHASE_11
// P11-E2 (the owner's report, 2026-11-19: "avatar icons take a few seconds
// to load on Chrome but load instantly on Firefox").
//
// A player's avatar name used to reach a page only with the lobby socket's
// PLAYERS list (lobbyView.ts `avatarOf`), so a page that draws people from
// its own data -- the Hall, Admin's accounts, a deck's shares, your own
// Account and seat -- drew the default face first and swapped it 0.9-2.2 s
// later on a 150 ms link. Now the data that names a person carries their
// avatar's name too (/api/auth/me, /api/hall, /api/admin/accounts, a deck's
// shares), and every name learned is kept for the tab (sessionStorage), so
// a reload or the next page draws the right face at once.
//
// A hint, never the truth: the socket's list wins the moment it lands
// (`avatarOf` asks it first), and storage that is empty, full or refused
// only means the old wait. A disabled account is never in it (the server
// sends avatars only for the accounts PLAYERS lists, so the look is the
// same as before). Cleared at sign-out.

const KEY = "proxic.avatars";
/** Only a name of the owner's set; anything else is the default picture (as lobby.ts reads PLAYERS). */
const NAME = /^avatar-\d{2,3}$/;

const known = new Map<string, string | null>(read());

function read(): [string, string | null][] {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as unknown;
    if (typeof kept !== "object" || kept === null) return [];
    return Object.entries(kept as Record<string, unknown>).flatMap(([userId, avatar]) =>
      avatar === null || (typeof avatar === "string" && NAME.test(avatar))
        ? [[userId, avatar] as [string, string | null]]
        : [],
    );
  } catch {
    return [];
  }
}

function keep(): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(Object.fromEntries(known)));
  } catch {
    // Full, refused or private: the page only waits for the socket, as before.
  }
}

/**
 * Remember who wears what: each user id with an avatar's name, or null for
 * the default picture. Anything that is not a name of the set is the default.
 */
export function learnAvatars(
  entries: Iterable<readonly [string, string | null | undefined]>,
): void {
  let changed = false;
  for (const [userId, avatar] of entries) {
    if (!userId) continue;
    const name = typeof avatar === "string" && NAME.test(avatar) ? avatar : null;
    if (known.get(userId) === name && known.has(userId)) continue;
    known.set(userId, name);
    changed = true;
  }
  if (changed) keep();
}

/** The avatar [userId] was last known to wear: a name, null for the default, undefined when unknown. */
export function knownAvatar(userId: string): string | null | undefined {
  return known.get(userId);
}

/** Signing out forgets it all: the next person in this tab starts from the server again. */
export function forgetAvatars(): void {
  known.clear();
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing kept */
  }
}
