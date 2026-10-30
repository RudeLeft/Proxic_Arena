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
import {
  CheckRule,
  CheckedInput,
  MAX_DISPLAY_NAME,
  StillMissing,
  againOk,
  displayNameMissing,
  displayNameOk,
  passwordMissing,
  passwordOk,
  passwordRule,
  usernameOk,
} from "./fieldChecks";
import logo from "./assets/logo-840.webp";
import "./shell/base.css";

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

  // Spec 0041: every box says whether it's right, and the button what's missing.
  const missing = [
    ...(usernameOk(username) ? [] : ["a username (3 to 32 letters or digits)"]),
    ...displayNameMissing(displayName),
    ...passwordMissing(password, again),
  ];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing.length > 0) return;
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
              <CheckedInput
                ok={usernameOk(username)}
                id="join-username"
                autoComplete="username"
                value={username}
                maxLength={32}
                onChange={(event) => setUsername(event.target.value)}
                aria-describedby="join-username-hint"
                required
              />
              <CheckRule
                id="join-username-hint"
                ok={usernameOk(username)}
                wrong={username.trim().length > 0}
              >
                What you sign in with: 3 to 32 letters, digits, dot, underscore or hyphen
              </CheckRule>

              <label className="pa-label" htmlFor="join-name">
                Display name
              </label>
              <CheckedInput
                ok={displayNameOk(displayName)}
                id="join-name"
                autoComplete="nickname"
                value={displayName}
                maxLength={MAX_DISPLAY_NAME}
                placeholder="What other players see"
                onChange={(event) => setDisplayName(event.target.value)}
                aria-describedby="join-name-hint"
                required
              />
              <CheckRule id="join-name-hint" ok={displayNameOk(displayName)}>
                What other players see, up to {MAX_DISPLAY_NAME} characters. You can change it
                later.
              </CheckRule>

              <label className="pa-label" htmlFor="join-password">
                Password
              </label>
              <CheckedInput
                ok={passwordOk(password)}
                id="join-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="join-password-check"
                required
              />
              <CheckRule id="join-password-check" ok={passwordOk(password)}>
                {passwordRule(password)}
              </CheckRule>

              <label className="pa-label" htmlFor="join-again">
                Password again
              </label>
              <CheckedInput
                ok={againOk(password, again)}
                id="join-again"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(event) => setAgain(event.target.value)}
                aria-describedby="join-again-check"
                required
              />
              <CheckRule
                id="join-again-check"
                ok={againOk(password, again)}
                wrong={again.length > 0}
              >
                {again.length === 0
                  ? "The same password again"
                  : againOk(password, again)
                    ? "Matches"
                    : "Doesn't match yet"}
              </CheckRule>

              <button
                type="submit"
                className="pa-button pa-button-wide"
                disabled={busy || missing.length > 0}
              >
                {busy ? "Creating…" : "Create account"}
              </button>
              <StillMissing lead="To create your account, add:" items={missing} />
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
