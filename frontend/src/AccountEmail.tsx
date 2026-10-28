// The Account page's "Email address" — spec 0026.
//
// Where a password reset goes. The old address is told when it changes
// (no password asked since owner 2026-10-28).

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "./auth";

export function AccountEmail() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void apiFetch("/api/auth/email")
      .then(async (response) =>
        response.ok ? ((await response.json()) as { email: string | null }) : null,
      )
      .catch(() => null)
      .then((body) => {
        setEmail(body?.email ?? null);
        setDraft(body?.email ?? "");
      });
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    let response: Response;
    try {
      response = await apiFetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: draft }),
      });
    } catch {
      setMessage({ ok: false, text: "The server could not be reached. Try again." });
      return;
    }
    const body = (await response.json().catch(() => null)) as {
      email?: string;
      detail?: string;
    } | null;
    if (response.ok && body?.email) {
      setEmail(body.email);
      setDraft(body.email);
      setMessage({ ok: true, text: "Email address saved." });
    } else {
      setMessage({ ok: false, text: body?.detail ?? "That email address could not be saved." });
    }
  };

  return (
    <section className="pa-section" aria-labelledby="email-head">
      <div className="pa-section-head">
        <h2 id="email-head">Email address</h2>
      </div>
      <form className="pa-form" onSubmit={(event) => void save(event)}>
        <p className="pa-help">
          {email === undefined
            ? " "
            : email
              ? "Password resets are sent here."
              : "You have no email address yet. Add one so a forgotten password can be reset."}
        </p>
        <label className="pa-label" htmlFor="account-email">
          Email address
        </label>
        <input
          className="pa-input"
          id="account-email"
          type="email"
          autoComplete="email"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          required
        />
        <button type="submit" className="pa-button" disabled={draft.trim() === (email ?? "")}>
          Save email address
        </button>
        {message && (
          <div
            role={message.ok ? "status" : "alert"}
            className={`pa-notice ${message.ok ? "pa-notice-ok" : "pa-notice-bad"}`}
            style={{ marginTop: 12 }}
          >
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">{message.text}</span>
          </div>
        )}
      </form>
    </section>
  );
}
