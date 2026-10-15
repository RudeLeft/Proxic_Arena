// Foundation UI — PHASE_01 §1.68–§1.70.
//
// Temporary diagnostic UI. Per §1.16 React owns the shell, status and
// connectivity here, and owns NOTHING about cards, hands, lobbies or
// gameplay — those are Phases 5–7.
//
// Every indicator is driven by `status.ts`, which asks the backend.
// §1.69 forbids hardcoded ready lights, and the logic lives in a
// testable module precisely so the honesty is verifiable without a
// browser.

import { useEffect, useRef, useState } from "react";
import {
  INITIAL_SNAPSHOT,
  connectSystemSocket,
  fetchStatus,
  type ServiceState,
  type Snapshot,
} from "./status";
import { fitCanvas, liveRendererCount, mountRenderer } from "./renderer";

const LABEL: Record<ServiceState, string> = {
  loading: "Checking…",
  ready: "Ready",
  degraded: "Not configured",
  unavailable: "Unavailable",
  disconnected: "Disconnected",
  "version-mismatch": "Version mismatch",
};

const COLOUR: Record<ServiceState, string> = {
  loading: "#8a8f98",
  ready: "#4caf72",
  degraded: "#d8a33c",
  unavailable: "#d2504a",
  disconnected: "#d2504a",
  "version-mismatch": "#b454d0",
};

/**
 * Labels for the raw backend check values (§1.69, §1.70).
 *
 * The backend distinguishes five Forge-worker states because the
 * operator action differs for each. Collapsing them all to the
 * generic "Not configured" told someone to set a variable that was
 * already set.
 */
const DETAIL_LABEL: Record<string, string> = {
  ok: "Ready",
  unconfigured: "Not configured",
  missing: "Not found",
  unreachable: "Unreachable",
  incompatible: "Version mismatch",
  "resources-missing": "Data files missing",
  unprobed: "Not checked",
  unwritable: "Not writable",
  configured: "Not checked",
};

function Indicator({
  name,
  state,
  detail,
}: {
  name: string;
  state: ServiceState;
  detail?: string | undefined;
}) {
  // Prefer what the server actually said; fall back to the coarse
  // state when there is no raw value (the WebSocket and the renderer
  // have none — they are observed in the browser, not reported).
  const text = (detail !== undefined ? DETAIL_LABEL[detail] : undefined) ?? LABEL[state];
  return (
    <div className="row">
      <span className="name">{name}</span>
      <span className="state">
        <span className="dot" style={{ background: COLOUR[state] }} aria-hidden="true" />
        {text}
      </span>
    </div>
  );
}

/**
 * The Pixi panel. Mounted in an effect that returns its disposer, so
 * React Strict Mode's double-mount cannot leave a second canvas or a
 * second ticker behind (§1.18).
 */
function RendererPanel({ onState }: { onState: (s: ServiceState) => void }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [live, setLive] = useState(0);

  useEffect(() => {
    let disposed = false;
    let dispose: (() => void) | null = null;

    // `void`: this mount is fire-and-forget by design, and the body
    // handles its own failure by degrading the panel. An unmarked
    // floating promise hides a rejection nobody ever sees.
    void (async () => {
      const host = hostRef.current;
      if (!host) return;
      try {
        // Imported lazily so a Pixi/WebGL failure degrades this panel
        // rather than blanking the whole page.
        const { Application } = await import("pixi.js");
        const size = fitCanvas(host.clientWidth || 640, (host.clientWidth || 640) / (16 / 9));
        const handle = await mountRenderer({
          container: host,
          width: size.width,
          height: size.height,
          app: new Application() as never,
        });
        if (disposed) {
          handle.destroy();
          return;
        }
        // 1.19: the canvas must track the window, not just the
        // size it happened to have at mount.
        const onResize = () => handle.resize(host.clientWidth || 640, window.innerHeight);
        window.addEventListener("resize", onResize);
        dispose = () => {
          window.removeEventListener("resize", onResize);
          handle.destroy();
        };
        onState("ready");
        setLive(liveRendererCount());
      } catch {
        onState("unavailable");
      }
    })();

    return () => {
      disposed = true;
      dispose?.();
      setLive(liveRendererCount());
    };
  }, [onState]);

  return (
    <div>
      <div ref={hostRef} className="canvas-host" />
      <p className="hint">live renderers: {live}</p>
    </div>
  );
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot>(INITIAL_SNAPSHOT);
  const [renderer, setRenderer] = useState<ServiceState>("loading");

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const s = await fetchStatus();
      if (!cancelled) setSnap((prev) => ({ ...prev, ...s }));
    };
    void poll();
    // setInterval expects a void callback. Handing it an async
    // function means a rejection becomes an unhandled rejection in
    // the page, and the status panel silently stops updating.
    const id = setInterval(() => void poll(), 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws/system`;
    return connectSystemSocket(url, (websocket) => setSnap((p) => ({ ...p, websocket })));
  }, []);

  const overall: ServiceState =
    snap.server === "version-mismatch"
      ? "version-mismatch"
      : snap.server === "unavailable"
        ? "unavailable"
        : "ready";

  return (
    <main>
      <h1>PROXIC ARENA</h1>
      <p className="sub">
        Foundation Build {snap.version?.proxicVersion ?? "—"}
        {snap.version ? ` · protocol v${snap.version.protocolVersion}` : ""}
      </p>

      <section className="panel">
        <Indicator name="Application Server" state={snap.server} />
        <Indicator name="Database" state={snap.database} detail={snap.checks["database"]} />
        <Indicator name="WebSocket" state={snap.websocket} />
        <Indicator
          name="Forge Runtime"
          state={snap.forgeRuntime}
          detail={snap.checks["forgeWorker"]}
        />
        <Indicator name="Pixi Renderer" state={renderer} />
      </section>

      <section className="panel">
        <RendererPanel onState={setRenderer} />
      </section>

      {snap.version && (
        <p className="hint">
          Forge {snap.version.forgeRelease} · {snap.version.forgeCommit.slice(0, 10)} · Java{" "}
          {snap.version.javaVersion}
        </p>
      )}

      <p className="verdict">
        {overall === "ready"
          ? "Application foundation ready"
          : overall === "version-mismatch"
            ? "Client and server protocol versions differ — reload, or update the client"
            : "Application server unavailable"}
      </p>
    </main>
  );
}
