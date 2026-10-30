// Choose a new password — spec 0026 (owner 2026-10-28).
//
// The page a password reset email opens (/reset#<code>). Like the join
// page it is open to a stranger and carries nothing of the signed-in
// pages. The code stays after the "#", so it never reaches the server's or
// Cloudflare's logs; the page hands it over itself. Every dead or wrong
// link reads the same, so a guesser learns nothing.

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { apiFetch, type AuthUser } from "./auth";
import {
  CheckRule,
  CheckedInput,
  StillMissing,
  againOk,
  passwordMissing,
  passwordOk,
  passwordRule,
} from "./fieldChecks";
import logo from "./assets/logo-840.webp";
import "./shell/base.css";

type Stage = { kind: "checking" } | { kind: "dead" } | { kind: "ready" };

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

export function ResetPage() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const token = window.location.hash.replace(/^#/, "");
  const [stage, setStage] = useState<Stage>({ kind: "checking" });
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setStage({ kind: "dead" });
      return;
    }
    void post("/api/auth/reset/peek", { token }).then((response) =>
      setStage({ kind: response?.ok ? "ready" : "dead" }),
    );
  }, [token]);

  const missing = passwordMissing(password, again);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (missing.length > 0) return;
    setBusy(true);
    setProblem(null);
    const response = await post("/api/auth/reset", { token, password });
    setBusy(false);
    if (response?.ok) {
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
    setProblem(answer?.detail ?? "Your password could not be saved. Try again.");
  };

  return (
    <main className="pa-signin">
      <div className="pa-signin-column">
        <h1 className="pa-signin-logo">
          <img src={logo} alt="Proxic Arena" width={420} height={140} />
        </h1>

        {stage.kind === "checking" ? (
          <p className="pa-visually-hidden" role="status">
            Checking your link…
          </p>
        ) : stage.kind === "dead" ? (
          <section className="pa-join-card" aria-labelledby="reset-dead">
            <h2 id="reset-dead" className="pa-join-title">
              This reset link no longer works
            </h2>
            <p className="pa-join-sub">
              It may have been used already, replaced by a newer one, or it expired after an hour.
              Ask the person who runs your Proxic Arena for a new one.
            </p>
            <Link className="pa-button pa-button-wide" to="/login">
              Go to sign in
            </Link>
          </section>
        ) : (
          <section className="pa-join-card" aria-labelledby="reset-title">
            <h2 id="reset-title" className="pa-join-title">
              Choose a new password
            </h2>
            {problem && (
              <div role="alert" className="pa-notice pa-notice-bad">
                <span aria-hidden="true" className="pa-notice-mark" />
                <span className="pa-notice-text">{problem}</span>
              </div>
            )}
            <form className="pa-signin-form" onSubmit={(event) => void submit(event)}>
              <label className="pa-label" htmlFor="reset-password">
                New password
              </label>
              <CheckedInput
                ok={passwordOk(password)}
                id="reset-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                aria-describedby="reset-password-check"
                required
              />
              <CheckRule id="reset-password-check" ok={passwordOk(password)}>
                {passwordRule(password)}
              </CheckRule>

              <label className="pa-label" htmlFor="reset-again">
                New password again
              </label>
              <CheckedInput
                ok={againOk(password, again)}
                id="reset-again"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(event) => setAgain(event.target.value)}
                aria-describedby="reset-again-check"
                required
              />
              <CheckRule
                id="reset-again-check"
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
                {busy ? "Saving…" : "Save password and sign in"}
              </button>
              <StillMissing lead="To save your new password, add:" items={missing} />
              <p className="pa-join-hint">
                Every other device signed in as you is signed out, and computers linked to the Deck
                Builder are unlinked.
              </p>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
