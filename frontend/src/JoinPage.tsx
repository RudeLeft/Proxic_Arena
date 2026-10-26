// Create your account — spec 0014 (owner 2026-10-25).
//
// The page an invitation link opens (/join#<code>). Like Sign in it is
// open to a stranger and carries nothing of the signed-in pages. The code
// stays after the "#", so it never reaches the server's or Cloudflare's
// logs; the page hands it over itself. Every dead or wrong link reads the
// same, so a guesser learns nothing.

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { apiFetch, type AuthUser } from "./auth";
import logo from "./assets/logo-840.webp";
import "./shell/base.css";

/** The server's own rule (PasswordHasher), shown as the person types. */
const MIN_PASSWORD = 12;

interface Peek {
  email: string;
  invitedBy: string;
  suggestedUsername: string;
}

type Stage = { kind: "checking" } | { kind: "dead" } | { kind: "ready"; peek: Peek };

async function post(path: string, body: unknown): Promise<Response | null> {
  try {
    return await apiFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export function JoinPage() {
  const { state, setUser } = useAuth();
  const navigate = useNavigate();
  const token = window.location.hash.replace(/^#/, "");
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setStage({ kind: "dead" });
      return;
    }
    void post("/api/auth/join/peek", { token }).then(async (response) => {
      if (!response?.ok) {
        setStage({ kind: "dead" });
        return;
      }
      const peek = (await response.json()) as Peek;
      setUsername(peek.suggestedUsername);
      setStage({ kind: "ready", peek });
    });
  }, [token]);

  const longEnough = password.length >= MIN_PASSWORD;
  const matches = password.length > 0 && password === again;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!longEnough || !matches) return;
    setBusy(true);
    setProblem(null);
    const response = await post("/api/auth/join", { token, username, displayName, password });
    setBusy(false);
    if (response?.status === 201) {
      const body = (await response.json()) as { user: AuthUser };
      setUser(body.user);
      void navigate("/play", { replace: true });
      return;
    }
    if (response?.status === 410) {
      setStage({ kind: "dead" });
      return;
    }
    const answer = (await response?.json().catch(() => null)) as { detail?: string } | null;
    setProblem(answer?.detail ?? "Your account could not be created. Try again.");
  };

  return (
    <main className="pa-signin">
      <div className="pa-signin-column">
        <h1 className="pa-signin-logo">
          <img src={logo} alt="Proxic Arena" width={420} height={140} />
        </h1>

        {state.status === "authenticated" ? (
          <div role="status" className="pa-notice">
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">
              You are signed in as {state.user.displayName}. To use this invitation, open it in a
              private window or sign out first.
              <span className="pa-notice-sub">
                <Link to="/play">Go to the lobby</Link>
              </span>
            </span>
          </div>
        ) : stage.kind === "checking" ? (
          <p className="pa-visually-hidden" role="status">
            Checking your invitation…
          </p>
        ) : stage.kind === "dead" ? (
          <section className="pa-join-card" aria-labelledby="join-dead">
            <h2 id="join-dead" className="pa-join-title">
              This invitation is no longer valid
            </h2>
            <p className="pa-join-sub">
              It may have been used already, cancelled, or it expired. Ask whoever invited you for a
              new one.
            </p>
            <Link className="pa-button pa-button-wide" to="/login">
              Go to sign in
            </Link>
          </section>
        ) : (
          <section className="pa-join-card" aria-labelledby="join-title">
            <h2 id="join-title" className="pa-join-title">
              Create your account
            </h2>
            <p className="pa-join-sub">
              Invited by {stage.peek.invitedBy} · {stage.peek.email}
            </p>
            {problem && (
              <div role="alert" className="pa-notice pa-notice-bad">
                <span aria-hidden="true" className="pa-notice-mark" />
                <span className="pa-notice-text">{problem}</span>
              </div>
            )}
            <form className="pa-signin-form" onSubmit={(event) => void submit(event)}>
              <label className="pa-label" htmlFor="join-username">
                Username
              </label>
              <input
                className="pa-input"
                id="join-username"
                autoComplete="username"
                value={username}
                maxLength={32}
                onChange={(event) => setUsername(event.target.value)}
                aria-describedby="join-username-hint"
                required
              />
              <span id="join-username-hint" className="pa-join-hint">
                What you sign in with: letters, digits, dot, underscore and hyphen.
              </span>

              <label className="pa-label" htmlFor="join-name">
                Display name
              </label>
              <input
                className="pa-input"
                id="join-name"
                autoComplete="nickname"
                value={displayName}
                maxLength={40}
                placeholder={username || "What other players see"}
                onChange={(event) => setDisplayName(event.target.value)}
                aria-describedby="join-name-hint"
              />
              <span id="join-name-hint" className="pa-join-hint">
                What other players see. You can change it later.
              </span>

              <label className="pa-label" htmlFor="join-password">
                Password
              </label>
              <input
                className="pa-input"
                id="join-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="join-password-check"
                required
              />
              <span
                id="join-password-check"
                className={`pa-join-hint${longEnough ? " pa-join-ok" : ""}`}
              >
                {longEnough ? "✓ Long enough" : `At least ${MIN_PASSWORD} characters`}
              </span>

              <label className="pa-label" htmlFor="join-again">
                Password again
              </label>
              <input
                className="pa-input"
                id="join-again"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(event) => setAgain(event.target.value)}
                aria-describedby="join-again-check"
                required
              />
              <span id="join-again-check" className={`pa-join-hint${matches ? " pa-join-ok" : ""}`}>
                {again.length === 0 ? "" : matches ? "✓ They match" : "They don't match yet"}
              </span>

              <button
                type="submit"
                className="pa-button pa-button-wide"
                disabled={busy || !longEnough || !matches || username.trim().length < 3}
              >
                {busy ? "Creating…" : "Create account"}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
