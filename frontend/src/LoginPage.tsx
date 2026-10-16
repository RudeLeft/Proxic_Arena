// Login and account pages — PHASE_03 §3.65–§3.71, §3.75.

import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { apiFetch, safeReturnPath } from "./auth";

export function LoginPage() {
  const { state, signIn } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const from = safeReturnPath(new URLSearchParams(location.search).get("from"));

  // §3.66 — an already-authenticated visitor goes to the app, not a
  // login form they do not need.
  if (state.status === "authenticated") return <Navigate to={from} replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const failure = await signIn(username, password);
    setBusy(false);
    if (failure) {
      setError(failure);
      // The password field is cleared and the username kept: a
      // mistyped password is the common case, and making someone
      // retype their username as well is a small punishment for it.
      setPassword("");
      return;
    }
    navigate(from, { replace: true });
  };

  return (
    <main>
      <h1>PROXIC ARENA</h1>
      <p className="sub">Sign in</p>

      {state.status === "anonymous" && state.reason === "expired" && (
        // §3.74 — "your session ended" rather than an error that
        // looks like the feature broke.
        <section className="panel">
          <p>Your session ended. Please sign in again.</p>
        </section>
      )}

      <section className="panel">
        <form onSubmit={(event) => void submit(event)}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && <p className="error-text">{error}</p>}
      </section>

      <p className="verdict">
        Accounts are created by an administrator. There is no self-registration.
      </p>
    </main>
  );
}

export function AccountPage() {
  const { state, signOut, setUser } = useAuth();
  const [displayName, setDisplayName] = useState(
    state.status === "authenticated" ? state.user.displayName : "",
  );
  const [message, setMessage] = useState<string | null>(null);
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
      setMessage("Display name updated.");
    } else {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      setMessage(body?.detail ?? "That display name could not be saved.");
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
      setMessage("Password changed. Signing you out of every device…");
      window.setTimeout(() => void signOut(), 1200);
    } else {
      const body = (await response.json().catch(() => null)) as { detail?: string } | null;
      setMessage(body?.detail ?? "That password could not be changed.");
    }
  };

  return (
    <main>
      <h1>PROXIC ARENA</h1>
      <p className="sub">Account</p>

      <section className="panel">
        <div className="row">
          <span className="name">Username</span>
          <span className="state">{user.username}</span>
        </div>
        <div className="row">
          <span className="name">Role</span>
          {/* Shown for information. The server never trusts it
              coming back — authorisation is decided from the
              session (§3.19). */}
          <span className="state">{user.role}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Display name</h2>
        <form onSubmit={(event) => void saveDisplayName(event)}>
          <input
            aria-label="Display name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <button type="submit">Save</button>
        </form>
      </section>

      <section className="panel">
        <h2>Change password</h2>
        <form onSubmit={(event) => void changePassword(event)}>
          <label htmlFor="current">Current password</label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
          <label htmlFor="new">New password</label>
          <input
            id="new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <button type="submit">Change password</button>
        </form>
        <p className="hint">Changing your password signs you out everywhere, including here.</p>
      </section>

      {message && <p className="verdict">{message}</p>}

      <section className="panel">
        <button type="button" onClick={() => void signOut()}>
          Sign out
        </button>
      </section>
    </main>
  );
}
