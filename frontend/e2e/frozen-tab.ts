// Spec 0120 (owner decision 7) -- a REAL hidden and frozen game tab.
//
// Playwright keeps every page it drives visible (RUN 2026-11-26: a page
// behind another tab, and one in a minimised window, both still said
// `visible`, in a launched Edge and in one attached over CDP), and
// Chromium's lifecycle "frozen" does nothing to a visible page. So the tab
// under test is opened in a plain Edge of its own, driven over the raw
// DevTools protocol (no Playwright attached to it): a second tab activated
// in front of it really hides it (`visibilitychange` -> hidden), and
// `Page.setWebLifecycleState frozen` then really freezes it (its timers stop,
// `freeze` / `resume` events). Headed only, Windows Edge; by hand, not CI.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

/** One DevTools connection to one target, and the events it hears. */
export class Devtools {
  private ws: WebSocket;
  private n = 0;
  private waiting = new Map<number, (m: Record<string, unknown>) => void>();
  readonly events: { at: number; method: string; params: Record<string, unknown> }[] = [];
  readonly ready: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve) => (this.ws.onopen = () => resolve()));
    this.ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data)) as Record<string, unknown>;
      if (typeof m["id"] === "number") this.waiting.get(m["id"])?.(m);
      else if (typeof m["method"] === "string")
        this.events.push({
          at: Date.now(),
          method: m["method"],
          params: (m["params"] ?? {}) as Record<string, unknown>,
        });
    };
  }

  send(method: string, params: Record<string, unknown> = {}) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const id = ++this.n;
      const timer = setTimeout(
        () => reject(new Error(`DevTools: no answer to ${method} in 15 s`)),
        15_000,
      );
      this.waiting.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const reply = await this.send("Runtime.evaluate", { expression, returnByValue: true });
    return ((reply["result"] as { result?: { value?: T } })?.result?.value ?? null) as T;
  }

  close() {
    this.ws.close();
  }
}

/** A plain Edge (its own profile), with the DevTools port open. */
export class PlainEdge {
  /** When the browser process ended on its own, and how. */
  exited: string | null = null;

  private constructor(
    private readonly process: ChildProcess,
    readonly port: number,
  ) {
    process.on("exit", (code, signal) => {
      this.exited = `${new Date().toISOString()} code ${String(code)} signal ${String(signal)}`;
    });
  }

  static async start(port = 9335): Promise<PlainEdge> {
    const dir = mkdtempSync(join(tmpdir(), "proxic-frozen-"));
    const child = spawn(
      EDGE,
      [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${dir}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--window-size=1920,1080",
        "about:blank",
      ],
      { stdio: "ignore" },
    );
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 200));
      if (
        await fetch(`http://127.0.0.1:${port}/json/version`).then(
          (r) => r.ok,
          () => false,
        )
      )
        return new PlainEdge(child, port);
    }
    throw new Error("Edge did not open its DevTools port");
  }

  async pages(): Promise<{ id: string; url: string; webSocketDebuggerUrl: string }[]> {
    const list = (await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json()) as {
      id: string;
      type: string;
      url: string;
      webSocketDebuggerUrl: string;
    }[];
    return list.filter((t) => t.type === "page");
  }

  async newTab(url: string) {
    return (await (
      await fetch(`http://127.0.0.1:${this.port}/json/new?${url}`, { method: "PUT" })
    ).json()) as { id: string; webSocketDebuggerUrl: string };
  }

  async activate(id: string) {
    await fetch(`http://127.0.0.1:${this.port}/json/activate/${id}`);
  }

  stop() {
    this.process.kill();
  }
}
