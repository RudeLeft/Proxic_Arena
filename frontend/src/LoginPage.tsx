// Sign in — PHASE_03 §3.65–§3.71; PHASE_07 §7.63 and the canvas's Login
// artboard. The only page a stranger is sent (owner 2026-10-24): it
// carries the basics' styles and nothing of the signed-in pages.

import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { LoginFailure } from "./auth";
import logo from "./assets/logo-840.webp";
import "./shell/base.css";

/** The notice slot, above the form and never inside it (the canvas). */
function SignInNotice({ expired, failure }: { expired: boolean; failure: LoginFailure | null }) {
  if (failure?.errorCode === "TOO_MANY_ATTEMPTS") {
    return (
      <div role="alert" className="pa-notice pa-notice-warn">
        <span aria-hidden="true" className="pa-notice-mark" />
        <span className="pa-notice-text">
          {failure.detail}
          <span className="pa-notice-sub">
            This is a throttle, not a lock. Nothing has been disabled, and no one can lock you out
            by guessing.
          </span>
        </span>
      </div>
    );
  }
  if (failure) {
    return (
      <div role="alert" className="pa-notice pa-notice-bad">
        <span aria-hidden="true" className="pa-notice-mark" />
        {/* The server's own sentence: the page never says "no such user"
            (§3.44). */}
        <span className="pa-notice-text">{failure.detail}</span>
      </div>
    );
  }
  if (expired) {
    // §3.74 — not an error treatment: nothing broke.
    return (
      <div role="status" className="pa-notice">
        <span aria-hidden="true" className="pa-notice-mark" />
        <span className="pa-notice-text">Your session ended. Please sign in again.</span>
      </div>
    );
  }
  return null;
}

export function LoginPage() {
  const { state, signIn } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [busy, setBusy] = useState(false);

  // §3.66 — an already-authenticated visitor goes to the app, not a
  // login form they do not need. Always the lobby (owner 2026-10-24):
  // there is no "return to the page you asked for" any more, and so no
  // address a link could bounce a fresh sign-in to.
  if (state.status === "authenticated") return <Navigate to="/play" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    const refused = await signIn(username, password);
    setBusy(false);
    if (refused) {
      setFailure(refused);
      // The password field is cleared and the username kept: a
      // mistyped password is the common case, and making someone
      // retype their username as well is a small punishment for it.
      setPassword("");
      return;
    }
    void navigate("/play", { replace: true });
  };

  return (
    <main className="pa-signin">
      <div className="pa-signin-column">
        <h1 className="pa-signin-logo">
          <img src={logo} alt="Proxic Arena" width={420} height={140} />
        </h1>

        <SignInNotice
          expired={state.status === "anonymous" && state.reason === "expired"}
          failure={failure}
        />

        <form className="pa-signin-form" onSubmit={(event) => void submit(event)}>
          <label className="pa-label" htmlFor="username">
            Username
          </label>
          <input
            className="pa-input"
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label className="pa-label" htmlFor="password">
            Password
          </label>
          <input
            className="pa-input"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" className="pa-button pa-button-wide" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
