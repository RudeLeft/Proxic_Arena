// A page open across an update reloads itself (owner 2026-11-06).
//
// The page loads some parts only when first needed, and each build renames
// them. A tab opened before the server was updated asks for the OLD names,
// which the new server no longer has: the owner saw "Unable to preload CSS
// for /assets/CHD7CQ2m.css" on the live site after updating to 1.45.0.
// Reloading picks up the new build. Once only: if it reloaded for this less
// than RELOAD_WINDOW_MS ago, the error screen shows instead, so it can
// never loop.

const KEY = "proxic:reloaded-for-update";
export const RELOAD_WINDOW_MS = 60_000;

/** The browser's words for a part of the page that could not be fetched. */
export function looksLikeUpdate(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /Unable to preload CSS|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    text,
  );
}

/** Reload once for an update; false when it already did, just now. */
export function reloadForUpdate(now = Date.now()): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY) ?? 0);
  } catch {
    // Storage blocked: reload anyway, once per page load.
  }
  if (now - last < RELOAD_WINDOW_MS) return false;
  try {
    sessionStorage.setItem(KEY, String(now));
  } catch {
    // As above.
  }
  window.location.reload();
  return true;
}

/** Vite's own signal that a part of the page could not be loaded. */
export function installUpdateReload() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
}
