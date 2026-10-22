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
import { Link } from "react-router-dom";
import { useAuth } from "./AuthContext";
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
        // PHASE_03 §3.100, §3.103 -- PixiJS compiles its shader and
        // uniform sync functions with `new Function()`, which the
        // Content-Security-Policy forbids, and without this the
        // renderer reports "Current environment does not allow
        // unsafe-eval". The answer is NOT 'unsafe-eval' in the
        // policy -- that would re-enable string-to-code evaluation
        // for every script on the page to spare one dependency.
        // Pixi ships this polyfill for exactly this case: it
        // replaces the generated functions with interpreted
        // equivalents. Side-effect import, so it must run before
        // the renderer is constructed.
        await import("pixi.js/unsafe-eval");
        const size = fitCanvas(host.clientWidth || 640, (host.clientWidth || 640) / (16 / 9));
        const handle = await mountRenderer({
          container: host,
          width: size.width,
          height: size.height,
          app: new Application(),
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

/**
 * Who you are, and the way in — PHASE_03 §3.69.
 *
 * The home page is public (§3.83): it is the status page, and a
 * signed-out visitor is meant to see it. But it said NOTHING about
 * authentication, so there was no way to sign in from it and no way
 * to tell whether you already were.
 *
 * Found by the owner on the production deployment, looking at a page
 * with five green lights and no login. Every automated test passed,
 * because each one navigated straight to /login or /decks -- the
 * tests knew where the door was, and a person has no reason to.
 */
function HomeIdentity() {
  const { state, signOut } = useAuth();

  // Deliberately renders nothing while loading rather than guessing
  // (§3.73): a "Sign in" link that flickers into "Signed in as..."
  // tells the visitor the page is unsure who they are.
  if (state.status === "loading") return null;

  if (state.status !== "authenticated") {
    return (
      <section className="panel">
        <div className="row">
          <span className="name">Not signed in</span>
          <span className="state">
            <Link to="/login">Sign in</Link>
          </span>
        </div>
        <p className="hint">
          Accounts are created by an administrator. Signing in is required for decks.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="row">
        <span className="name">Signed in as {state.user.displayName}</span>
        {/* Shown because §3.69 asks for it. The server never trusts
            it coming back -- authorisation is decided from the
            session, every request (§3.19). */}
        <span className="state">{state.user.role}</span>
      </div>
      <div className="row">
        <span className="name">
          {/* PHASE_05 §5.228 "Add Play/lobby entry". There was no
              link to /play anywhere: the lobby existed and nothing
              pointed at it, so the only way in was typing the URL.
              Found by the owner, signed in on two browsers,
              looking for the thing that had been built. Play comes
              first because it is what the site is FOR. */}
          <Link to="/play">Play</Link> · <Link to="/decks">Deck Depot</Link> ·{" "}
          <Link to="/account">Account</Link>
        </span>
        <span className="state">
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </span>
      </div>
    </section>
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
        {/* Which build is this? The question cost an hour during the
            Phase 4 deployment, answered by comparing bundle hashes.
            The server knows (PROXIC_BUILD_ID, baked in by CI), so
            the page should say it where a person can see it without
            opening devtools.

            Short form, because the first seven characters identify a
            commit and the full forty are noise on a status line. A
            local build reports "dev", which is honest about being
            neither published nor reproducible. */}
        {snap.version?.buildId && <> · build {snap.version.buildId.slice(0, 7)}</>}
      </p>

      <HomeIdentity />

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
