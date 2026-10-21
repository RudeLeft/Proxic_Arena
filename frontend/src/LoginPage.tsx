// Sign in and Account — PHASE_03 §3.65–§3.71, §3.75; PHASE_07 §7.63,
// §7.66 and the canvas's Login and Account artboards.

import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { apiFetch, safeReturnPath, type LoginFailure } from "./auth";
import logo from "./assets/logo-840.webp";
import "./shell/app.css";

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
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [busy, setBusy] = useState(false);

  const from = safeReturnPath(new URLSearchParams(location.search).get("from"));

  // §3.66 — an already-authenticated visitor goes to the app, not a
  // login form they do not need.
  if (state.status === "authenticated") return <Navigate to={from} replace />;

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
    navigate(from, { replace: true });
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

        <p className="pa-signin-foot">
          Accounts are created by an administrator. There is no self-registration.
        </p>
      </div>
    </main>
  );
}

export function AccountPage() {
  const { state, signOut, signOutEverywhere, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(
    state.status === "authenticated" ? state.user.displayName : "",
  );
  const [nameMessage, setNameMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [sessionMessage, setSessionMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  if (state.status !== "authenticated") return null;
  const user = state.user;

  const saveDisplayName = async (event: FormEvent) => {
    event.preventDefault();
    const response = await apiFetch("/api/auth/display-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName }),
    });
    if (response.ok) {
      const body = (await response.json()) as { user: typeof user };
      setUser(body.user);
      setNameMessage({ ok: true, text: "Display name updated." });
    } else {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      setNameMessage({ ok: false, text: body?.detail ?? "That display name could not be saved." });
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    const response = await apiFetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setCurrentPassword("");
    setNewPassword("");
    if (response.ok) {
      // §3.36 — the change revoked every session INCLUDING this
      // one. Being signed out here is the rule working, and saying
      // so is better than letting the next click look broken.
      setPasswordMessage({ ok: true, text: "Password changed. Signing you out of every device…" });
      window.setTimeout(() => void signOut(), 1200);
    } else {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      setPasswordMessage({
        ok: false,
        text: body?.detail ?? "That password could not be changed.",
      });
    }
  };

  const everywhere = async () => {
    const revoked = await signOutEverywhere();
    if (revoked === null) {
      // Saying "signed out everywhere" when the call failed would be
      // a lie about security, and the sessions elsewhere really are
      // still live.
      setSessionMessage({ ok: false, text: "Those sessions could not be ended. Try again." });
      return;
    }
    setSessionMessage({ ok: true, text: `Signed out of ${revoked} session(s) everywhere.` });
    window.setTimeout(() => void signOut(), 1200);
  };

  return (
    <main className="pa-main">
      <div className="pa-column">
        <h1 className="pa-title">Account</h1>

        <section className="pa-section" aria-labelledby="identity">
          <div className="pa-section-head">
            <h2 id="identity">Identity</h2>
          </div>
          <div className="pa-row">
            <span className="pa-row-key">Username</span>
            <span className="pa-row-value">{user.username}</span>
          </div>
          <div className="pa-row">
            <span className="pa-row-key">Role</span>
            {/* Shown for information. The server never trusts it coming
                back -- authorisation is decided from the session (§3.19). */}
            <span className="pa-row-value">
              {user.role === "ADMIN" ? "Administrator" : "Player"}
            </span>
          </div>
        </section>

        <section className="pa-section" aria-labelledby="display">
          <div className="pa-section-head">
            <h2 id="display">Display name</h2>
          </div>
          <form
            className="pa-form pa-form-inline"
            onSubmit={(event) => void saveDisplayName(event)}
          >
            <input
              className="pa-input"
              aria-label="Display name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <button type="submit" className="pa-button">
              Save
            </button>
            <p className="pa-help">
              This is the name other players see in the lobby and across the table. Your username
              does not change.
            </p>
            {nameMessage && <Message {...nameMessage} />}
          </form>
        </section>

        <section className="pa-section" aria-labelledby="password-head">
          <div className="pa-section-head">
            <h2 id="password-head">Password</h2>
          </div>
          <form className="pa-form" onSubmit={(event) => void changePassword(event)}>
            <label className="pa-label" htmlFor="current">
              Current password
            </label>
            <input
              className="pa-input"
              id="current"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
            <label className="pa-label" htmlFor="new">
              New password
            </label>
            <input
              className="pa-input"
              id="new"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
            {/* The consequence stated before the button, not after it. */}
            <div className="pa-notice pa-notice-warn" style={{ marginBottom: 16 }}>
              <span aria-hidden="true" className="pa-notice-mark" />
              <span className="pa-notice-text">
                Changing your password ends every session on every device, including this one. You
                will be signed out here and will need to sign in again.
              </span>
            </div>
            <button type="submit" className="pa-button">
              Change password
            </button>
            {passwordMessage && <Message {...passwordMessage} />}
          </form>
        </section>

        <section className="pa-section" aria-labelledby="sessions">
          <div className="pa-section-head">
            <h2 id="sessions">Sessions</h2>
          </div>
          {/* §3.34 — signing out of THIS device is in the header on every
              page; this is the act you cannot do from there. */}
          <div className="pa-row">
            <span className="pa-row-key" style={{ flexBasis: 240 }}>
              <span className="pa-row-value" style={{ display: "block", color: "#eee2c4" }}>
                Sign out everywhere
              </span>
              <span className="pa-help" style={{ display: "block" }}>
                Ends every session on every device, including this one. Reach for this after using a
                shared computer, or if you think somebody else has your password.
              </span>
            </span>
            <button
              type="button"
              className="pa-button pa-button-warn"
              onClick={() => void everywhere()}
            >
              Sign out all
            </button>
          </div>
          {sessionMessage && (
            <div className="pa-form">
              <Message {...sessionMessage} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Message({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`pa-notice ${ok ? "pa-notice-ok" : "pa-notice-bad"}`}
      style={{ flexBasis: "100%", marginTop: 12 }}
    >
      <span aria-hidden="true" className="pa-notice-mark" />
      <span className="pa-notice-text">{text}</span>
    </div>
  );
}
