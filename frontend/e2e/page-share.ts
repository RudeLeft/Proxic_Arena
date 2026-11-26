// P11-C6 follow-up (owner 2026-11-25, "Work per update") -- the measured
// page's own JavaScript, out of a CPU profile of it, with the test's own work
// taken out.
//
// Every sample is given to whoever's script was running at its top: walking
// from the sample's leaf toward the root, the first frame that belongs to a
// script decides. The browser's own functions (querySelectorAll,
// getAnimations, setAttribute...) belong to no script (scriptId "0"), so they
// count for whoever called them: the page's code asking for its animations
// is the page's; Playwright's injected script answering a locator is the
// test's. A frame of the app's own bundle (served from /assets/) is the
// page's; any other script is the test's (Playwright's injected scripts and
// `page.evaluate`, and the speed kit's recorder: its frame clock and the
// React commit walk it runs inside React's DevTools hook, which sit above the
// page's frames). An app handler that the test's click starts is the page's
// (its frames are on top). Only what is known to be the test's is taken out:
// garbage collection and the browser's work under no script at all are
// counted as the page's too, so the split can make the page look slower,
// never hide its work.

/** The parts of a V8 CPU profile this reads (CDP Profiler.stop). */
export interface CpuProfile {
  nodes: {
    id: number;
    callFrame: { functionName: string; url: string; scriptId: string };
    children?: number[];
  }[];
  samples?: number[];
  timeDeltas?: number[];
}

export interface Share {
  /** The page's own JavaScript, ms (with the browser's functions it called). */
  page: number;
  /** Garbage collection, ms (counted in [charged]). */
  gc: number;
  /** The test's own JavaScript (Playwright's scripts, the recorder), ms. */
  test: number;
  /** Browser work under no script (a native callback, a microtask), ms (counted in [charged]). */
  other: number;
  /** What the budget reads: everything but the test's own, ms (page + gc + other). */
  charged: number;
}

/** A frame of the app's own code: the built bundle is served from /assets/. */
const APP = /\/assets\/[^/]+\.js/;

export function pageShare(profile: CpuProfile): Share {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map<number, number>();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const kinds = new Map<number, keyof Omit<Share, "charged"> | null>();
  const kindOf = (id: number) => {
    if (kinds.has(id)) return kinds.get(id)!;
    const leaf = byId.get(id)!.callFrame;
    let kind: keyof Omit<Share, "charged"> | null = null;
    if (leaf.functionName === "(garbage collector)") kind = "gc";
    else if (!["(idle)", "(program)", "(root)"].includes(leaf.functionName)) {
      kind = "other";
      let at: number | undefined = id;
      while (at !== undefined) {
        const frame: CpuProfile["nodes"][number]["callFrame"] = byId.get(at)!.callFrame;
        if (frame.scriptId !== "0") {
          kind = APP.test(frame.url) ? "page" : "test";
          break;
        }
        at = parent.get(at);
      }
    }
    kinds.set(id, kind);
    return kind;
  };
  const out = { page: 0, gc: 0, test: 0, other: 0 };
  const deltas = profile.timeDeltas ?? [];
  (profile.samples ?? []).forEach((id, i) => {
    const kind = kindOf(id);
    // deltas[i] is the time before sample i; the next one is this sample's span.
    const ms = (deltas[i + 1] ?? deltas[i] ?? 0) / 1000;
    if (kind) out[kind] += ms;
  });
  return { ...out, charged: out.page + out.gc + out.other };
}
