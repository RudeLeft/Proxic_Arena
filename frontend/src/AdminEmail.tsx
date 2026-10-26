// The Email account tab — spec 0014 amendment 1 (owner 2026-10-25).
//
// The account invitations are sent from, filled in here instead of in the
// server's settings file, so changing provider is a form. The password goes
// one way: typed here, saved sealed on the server, never shown again (the
// page knows only that one is saved). A test email says whether it works,
// and if not, why.

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  fetchMailSettings,
  removeMailSettings,
  saveMailSettings,
  testMail,
  type MailSettingsView,
} from "./admin";

/** Where the settings in use come from, in words. */
function sourceText(view: MailSettingsView): string {
  switch (view.source) {
    case "ADMIN":
      return "Invitations are emailed with these settings.";
    case "SERVER":
      return "Invitations are emailed with the server's settings file. Saving here takes over from it.";
    default:
      return "Not set up: Invite gives you the link to send yourself until this is filled in.";
  }
}

export function EmailPanel() {
  const id = useId();
  const [view, setView] = useState<MailSettingsView | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [security, setSecurity] = useState<"starttls" | "ssl">("starttls");
  const [username, setUsername] = useState("");
  const [from, setFrom] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ sent: boolean; detail: string } | null>(null);

  const adopt = (next: MailSettingsView) => {
    setView(next);
    setHost(next.host);
    setPort(String(next.port || 587));
    setSecurity(next.security === "ssl" ? "ssl" : "starttls");
    setUsername(next.username);
    setFrom(next.from);
    setPassword("");
  };

  useEffect(() => {
    void fetchMailSettings().then((next) => {
      if (next) adopt(next);
    });
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const outcome = await saveMailSettings({
      host,
      port: Number(port),
      security,
      username,
      from,
      // Blank keeps the saved password (it is never shown to be edited).
      password: password === "" ? null : password,
    });
    setBusy(false);
    if (outcome.ok) {
      adopt(outcome.view);
      setNotice({ ok: true, text: "Saved. Send a test email to check it." });
    } else {
      setNotice({ ok: false, text: outcome.message });
    }
  };

  const remove = async () => {
    const outcome = await removeMailSettings();
    if (outcome.ok) {
      adopt(outcome.view);
      setNotice({ ok: true, text: "Removed." });
    } else {
      setNotice({ ok: false, text: outcome.message });
    }
  };

  const test = async (event: FormEvent) => {
    event.preventDefault();
    setTesting(true);
    setTestResult(await testMail(testTo));
    setTesting(false);
  };

  const gmail = () => {
    setHost("smtp.gmail.com");
    setPort("587");
    setSecurity("starttls");
  };

  return (
    <section className="pa-admin-panel pa-admin-email" aria-labelledby={`${id}-heading`}>
      <div className="pa-admin-panel-head">
        <h2 id={`${id}-heading`}>Email account</h2>
        {view && <span className="pa-admin-panel-note">{sourceText(view)}</span>}
      </div>

      <div className="pa-admin-email-body">
        <p className="pa-admin-email-help">
          The account invitations come from. For Gmail: a dedicated account (e.g.
          proxicarena@gmail.com) with 2-Step Verification on, and an <strong>app password</strong>{" "}
          (Google Account → Security → App passwords), never your normal password.
        </p>

        {/* Not before the saved settings have come: typing first and then
            having the load overwrite it lost what was typed. */}
        {!view && <p className="pa-group-empty">Loading the email settings…</p>}

        {notice && (
          <div
            className={`pa-notice ${notice.ok ? "pa-notice-ok" : "pa-notice-bad"}`}
            role={notice.ok ? "status" : "alert"}
          >
            <span aria-hidden="true" className="pa-notice-mark" />
            <span className="pa-notice-text">{notice.text}</span>
          </div>
        )}

        {view && (
          <>
            <form className="pa-admin-email-form" onSubmit={(event) => void save(event)}>
              <div className="pa-admin-email-row">
                <label className="pa-label" htmlFor={`${id}-host`}>
                  Email server
                </label>
                <div className="pa-admin-email-inline">
                  <input
                    id={`${id}-host`}
                    className="pa-input"
                    placeholder="smtp.gmail.com"
                    autoComplete="off"
                    value={host}
                    onChange={(event) => setHost(event.target.value)}
                    required
                  />
                  <button type="button" className="pa-small-button" onClick={gmail}>
                    Use Gmail's
                  </button>
                </div>
              </div>

              <div className="pa-admin-email-pair">
                <div className="pa-admin-email-row">
                  <label className="pa-label" htmlFor={`${id}-port`}>
                    Port
                  </label>
                  <input
                    id={`${id}-port`}
                    className="pa-input"
                    inputMode="numeric"
                    value={port}
                    onChange={(event) => setPort(event.target.value.replace(/\D/g, ""))}
                    required
                  />
                </div>
                <div className="pa-admin-email-row">
                  <span className="pa-label" id={`${id}-security`}>
                    Security
                  </span>
                  <div
                    className="pa-admin-invite-role"
                    role="radiogroup"
                    aria-labelledby={`${id}-security`}
                  >
                    {(
                      [
                        ["starttls", "STARTTLS (587)"],
                        ["ssl", "SSL (465)"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={security === value}
                        className="pa-admin-invite-role-option"
                        onClick={() => {
                          setSecurity(value);
                          setPort(value === "ssl" ? "465" : "587");
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pa-admin-email-row">
                <label className="pa-label" htmlFor={`${id}-user`}>
                  Username
                </label>
                <input
                  id={`${id}-user`}
                  className="pa-input"
                  placeholder="proxicarena@gmail.com"
                  autoComplete="off"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="pa-admin-email-row">
                <label className="pa-label" htmlFor={`${id}-password`}>
                  Password
                </label>
                <input
                  id={`${id}-password`}
                  className="pa-input"
                  type="password"
                  autoComplete="new-password"
                  placeholder={
                    view?.passwordSaved
                      ? "A password is saved. Type a new one to replace it."
                      : "The app password"
                  }
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <span className="pa-admin-email-hint">
                  Saved encrypted on the server and never shown again, here or anywhere.
                </span>
              </div>

              <div className="pa-admin-email-row">
                <label className="pa-label" htmlFor={`${id}-from`}>
                  From
                </label>
                <input
                  id={`${id}-from`}
                  className="pa-input"
                  placeholder="Proxic Arena <proxicarena@gmail.com>"
                  autoComplete="off"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  required
                />
                <span className="pa-admin-email-hint">
                  The name and address invitations come from. Usually the same address as the
                  username.
                </span>
              </div>

              <div className="pa-button-row">
                <button type="submit" className="pa-button pa-button-brass" disabled={busy}>
                  {busy ? "Saving…" : "Save"}
                </button>
                {view?.source === "ADMIN" && (
                  <button
                    type="button"
                    className="pa-button pa-button-quiet"
                    onClick={() => void remove()}
                  >
                    Remove these settings
                  </button>
                )}
              </div>
            </form>

            <form className="pa-admin-email-test" onSubmit={(event) => void test(event)}>
              <label className="pa-label" htmlFor={`${id}-test`}>
                Send a test email to
              </label>
              <div className="pa-admin-email-inline">
                <input
                  id={`${id}-test`}
                  className="pa-input"
                  type="email"
                  placeholder="you@example.com"
                  value={testTo}
                  onChange={(event) => setTestTo(event.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="pa-button"
                  disabled={testing || view?.source === "NONE"}
                >
                  {testing ? "Sending…" : "Send test"}
                </button>
              </div>
              {testResult && (
                <p
                  className={`pa-admin-email-result ${testResult.sent ? "pa-admin-email-good" : "pa-admin-email-bad"}`}
                  role={testResult.sent ? "status" : "alert"}
                >
                  {testResult.sent ? "✓ " : ""}
                  {testResult.detail}
                </p>
              )}
            </form>
          </>
        )}
      </div>
    </section>
  );
}
