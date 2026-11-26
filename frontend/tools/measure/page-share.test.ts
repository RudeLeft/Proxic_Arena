// P11-C6 follow-up -- the speed test's split of a CPU profile into the
// page's own JavaScript and the test's (e2e/page-share.ts).
import { describe, expect, it } from "vitest";
import { pageShare, type CpuProfile } from "../../e2e/page-share";

const APP = "http://127.0.0.1:8080/assets/Bc8fmvZ-.js";
type Frame = { name: string; url?: string; script?: string; kids?: Frame[]; ms?: number };

/** A profile from a call tree: each frame's [ms] is sampled at it, 1 ms a sample, after a 5 ms wait. */
function profileOf(roots: Frame[]): CpuProfile {
  const nodes: CpuProfile["nodes"] = [];
  const samples: number[] = [];
  const add = (f: Frame): number => {
    const id = nodes.length + 1;
    const node = {
      id,
      callFrame: { functionName: f.name, url: f.url ?? "", scriptId: f.script ?? "0" },
      children: [] as number[],
    };
    nodes.push(node);
    for (let i = 0; i < (f.ms ?? 0); i++) samples.push(id);
    for (const k of f.kids ?? []) node.children.push(add(k));
    return id;
  };
  add({ name: "(root)", kids: roots });
  // The first delta is the wait before the first sample (not its span).
  return { nodes, samples, timeDeltas: samples.map((_, i) => (i === 0 ? 5000 : 1000)) };
}

const app = (name: string, more: Partial<Frame> = {}): Frame => ({
  name,
  url: APP,
  script: "5",
  ...more,
});
const native = (name: string, ms: number, kids?: Frame[]): Frame => ({
  name,
  ms,
  ...(kids ? { kids } : {}),
});

describe("pageShare", () => {
  it("gives the page its own code and the browser's functions it calls", () => {
    const share = pageShare(
      profileOf([app("render", { ms: 3, kids: [native("getAnimations", 4)] })]),
    );
    expect(share).toMatchObject({ page: 7, test: 0, gc: 0, other: 0, charged: 7 });
  });

  it("gives the test Playwright's scripts and the browser's functions they call", () => {
    const share = pageShare(
      profileOf([
        {
          name: "evaluate",
          script: "7",
          ms: 1,
          kids: [{ name: "query", script: "59", ms: 2, kids: [native("querySelectorAll", 5)] }],
        },
      ]),
    );
    expect(share).toMatchObject({ page: 0, test: 8 });
  });

  it("gives the test the recorder's walk inside React's commit, above the page's frames", () => {
    const share = pageShare(
      profileOf([
        app("commitRoot", {
          ms: 2,
          kids: [
            {
              name: "onCommitFiberRoot",
              script: "3",
              ms: 1,
              kids: [{ name: "walk", script: "3", ms: 6 }],
            },
          ],
        }),
      ]),
    );
    expect(share).toMatchObject({ page: 2, test: 7 });
  });

  it("gives the page an app handler that the test's click started", () => {
    const share = pageShare(
      profileOf([
        {
          name: "evaluate",
          script: "7",
          ms: 1,
          kids: [native("click", 1, [app("onClick", { ms: 5 })])],
        },
      ]),
    );
    expect(share).toMatchObject({ page: 5, test: 2 });
  });

  it("charges the page with garbage collection and work under no script, nothing for idle", () => {
    const share = pageShare(
      profileOf([
        native("(garbage collector)", 3),
        native("(idle)", 50),
        native("(program)", 20),
        native("requestAnimationFrame", 2),
        app("tick", { ms: 1 }),
      ]),
    );
    expect(share).toMatchObject({ page: 1, gc: 3, other: 2, test: 0, charged: 6 });
  });

  it("reads an empty profile as nothing", () => {
    expect(pageShare({ nodes: [] })).toMatchObject({ page: 0, test: 0, charged: 0 });
  });
});
