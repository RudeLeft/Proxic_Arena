// Is this page going away? — owner 2026-10-24.
//
// A refresh closes the page's live connections on its way out, and the
// browser reports that like any lost connection: for an instant the
// lobby said "Reconnecting…" and the game its reconnect banner, before
// the new page drew. A page that is leaving is not disconnected; the
// connections ask here and say nothing.
//
// A page kept by the browser's back/forward cache comes back with
// "pageshow"; anything that stood down while it was away is told, so
// it can connect again.

let leaving = false;
const back = new Set<() => void>();

if (typeof window !== "undefined") {
  const away = () => {
    leaving = true;
  };
  window.addEventListener("pagehide", away);
  window.addEventListener("beforeunload", away);
  window.addEventListener("pageshow", () => {
    if (!leaving) return;
    leaving = false;
    for (const wake of back) wake();
  });
}

/** True from the moment the page starts to unload. */
export function pageIsLeaving(): boolean {
  return leaving;
}

/** Called when a page that was leaving comes back (back/forward cache). Returns the stop. */
export function onPageBack(wake: () => void): () => void {
  back.add(wake);
  return () => back.delete(wake);
}
