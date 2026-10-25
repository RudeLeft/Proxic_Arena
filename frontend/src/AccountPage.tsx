// The Account page — PHASE_07 §7.66, spec 0006 (the avatar).
//
// Its own file since 2026-10-24: it was in LoginPage.tsx, and so in the
// code a stranger receives with the sign-in screen, avatar pictures and
// all. Now it loads only after signing in (routes.tsx, lazily).

import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch } from "./auth";
import { AVATARS, Avatar } from "./avatars";
import { useLobbyConnection } from "./shell/LobbyConnection";

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
        {/* No title on screen (owner 2026-10-25): the menu already says it. */}
        <h1 className="pa-visually-hidden">Account</h1>

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

        <AvatarPicker />

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

/**
 * Spec 0006 (owner 2026-10-24) — your avatar, from the owner's set of 50.
 * Saved with your account; everybody's Players list is told at once, so
 * the lobby shows it without a reload. Your current one comes from that
 * same list.
 */
function AvatarPicker() {
  const { state } = useAuth();
  const { lobby } = useLobbyConnection();
  const me = state.status === "authenticated" ? state.user.userId : null;
  const saved = lobby.players.find((p) => p.userId === me)?.avatar ?? null;
  const [chosen, setChosen] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = chosen ?? saved;

  const choose = async (avatar: string) => {
    const before = chosen;
    setChosen(avatar);
    setMessage(null);
    const response = await apiFetch("/api/auth/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatar }),
    });
    if (response.ok) {
      setMessage({ ok: true, text: "Avatar saved." });
    } else {
      setChosen(before);
      setMessage({ ok: false, text: "That avatar could not be saved. Try again." });
    }
  };

  return (
    <section className="pa-section" aria-labelledby="avatar-head">
      <div className="pa-section-head">
        <h2 id="avatar-head">Avatar</h2>
      </div>
      <div className="pa-avatar-current">
        <Avatar avatar={current} size={72} label="Your avatar" />
        <p className="pa-help">
          Shown beside your name in the lobby, on your seat in a room, and in chat.
        </p>
      </div>
      <div className="pa-avatar-grid" role="group" aria-label="Choose your avatar">
        {AVATARS.map((avatar, index) => (
          <button
            key={avatar}
            type="button"
            className={`pa-avatar-choice${avatar === current ? " pa-avatar-chosen" : ""}`}
            aria-pressed={avatar === current}
            aria-label={`Avatar ${index + 1}`}
            onClick={() => void choose(avatar)}
          >
            <Avatar avatar={avatar} size={64} />
          </button>
        ))}
      </div>
      {message && <Message {...message} />}
    </section>
  );
}
