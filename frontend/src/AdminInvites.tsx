// Invitations on the Admin page — spec 0014 (owner 2026-10-25).
//
// "Invite" replaces "New account": an email address and a role. The link is
// emailed when the server has an email account; either way it is shown here
// once, with Copy, so a link that did not arrive can be sent by hand. The
// list says who has not answered yet, with Send again and Cancel.

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  cancelInvite,
  fetchInvites,
  resendInvite,
  sendInvite,
  type Invite,
  type InviteOutcome,
  type InviteSent,
} from "./admin";
import { agoText } from "./lobbyView";

/** "in 46 h", "in 40 min". */
function untilText(at: string, now: number): string {
  const minutes = Math.max(0, Math.floor((Date.parse(at) - now) / 60_000));
  return minutes >= 60 ? `in ${Math.floor(minutes / 60)} h` : `in ${minutes} min`;
}

/** Spec 0019 (12) — the Status column: what became of it. */
function stateText(invite: Invite): string {
  switch (invite.state) {
    case "JOINED":
      return `Joined as ${invite.joinedAs ?? "a player"}`;
    case "CANCELLED":
      return "Cancelled";
    case "EXPIRED":
      return "Expired";
    default:
      return "Waiting";
  }
}

/** The Invite dialog (opened from the Accounts header) and the list of invitations. */
export function Invitations({
  now,
  open,
  onClosed,
}: {
  now: number;
  open: boolean;
  onClosed: () => void;
}) {
  const [list, setList] = useState<{ invites: Invite[]; emailReady: boolean } | null>(null);
  /** The link just made (by Invite or Send again), shown once. */
  const [sent, setSent] = useState<InviteSent | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setList(await fetchInvites());
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const answered = async (outcome: InviteOutcome) => {
    if (outcome.ok) {
      setSent(outcome.sent);
      setProblem(null);
    } else {
      setProblem(outcome.message);
    }
    await refresh();
    return outcome.ok;
  };

  const shown = (list?.invites ?? []).filter(
    (invite) =>
      invite.state === "WAITING" || invite.state === "EXPIRED" || invite.state === "JOINED",
  );

  return (
    <>
      {open && (
        <InviteDialog
          emailReady={list?.emailReady ?? false}
          onClose={onClosed}
          onSend={async (email, role) => answered(await sendInvite(email, role))}
        />
      )}
      {sent && <SentDialog sent={sent} onClose={() => setSent(null)} />}
      <InvitationList
        invites={shown}
        now={now}
        problem={problem}
        onResend={async (invite) => {
          await answered(await resendInvite(invite.inviteId));
        }}
        onCancel={async (invite) => {
          const outcome = await cancelInvite(invite.inviteId);
          setProblem(outcome.ok ? null : outcome.message);
          await refresh();
        }}
      />
    </>
  );
}

function InvitationList({
  invites,
  now,
  problem,
  onResend,
  onCancel,
}: {
  invites: Invite[];
  now: number;
  problem: string | null;
  onResend: (invite: Invite) => Promise<void>;
  onCancel: (invite: Invite) => Promise<void>;
}) {
  const waiting = invites.filter((invite) => invite.state === "WAITING").length;
  return (
    <section className="pa-admin-invites" aria-labelledby="invites-heading">
      <div className="pa-admin-panel-head">
        <h2 id="invites-heading">Invitations</h2>
        <span className="pa-admin-panel-note">{waiting} waiting</span>
      </div>
      {problem && (
        <p className="pa-field-problem" role="alert">
          {problem}
        </p>
      )}
      {invites.length === 0 ? (
        <p className="pa-group-empty">
          No invitations yet. Invite someone to give them an account.
        </p>
      ) : (
        <ul className="pa-admin-invite-list">
          {/* Spec 0019 (12) — named columns, as Accounts has. */}
          <li className="pa-admin-list-head pa-admin-invite" aria-hidden="true">
            <span>Email</span>
            <span>Role</span>
            <span>Status</span>
            <span>Expires</span>
            <span>Actions</span>
          </li>
          {invites.map((invite) => (
            <li key={invite.inviteId} className="pa-admin-invite">
              <span className="pa-admin-invite-email">{invite.email}</span>
              <span className="pa-admin-account-meta">
                {invite.role === "ADMIN" ? "Administrator" : "Player"}
              </span>
              <span className="pa-admin-invite-status">
                {stateText(invite)}
                <small>sent {agoText(invite.createdAt, now)}</small>
              </span>
              <span className="pa-admin-account-meta">
                {invite.state === "WAITING" ? untilText(invite.expiresAt, now) : "—"}
              </span>
              {invite.state === "JOINED" ? (
                <span className="pa-admin-invite-actions" />
              ) : (
                <span className="pa-admin-invite-actions">
                  <button
                    type="button"
                    className="pa-small-button"
                    aria-label={`Send ${invite.email} a new link`}
                    onClick={() => void onResend(invite)}
                  >
                    Send again
                  </button>
                  {invite.state === "WAITING" && (
                    <button
                      type="button"
                      className="pa-small-button pa-small-button-warn"
                      aria-label={`Cancel the invitation to ${invite.email}`}
                      onClick={() => void onCancel(invite)}
                    >
                      Cancel
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Dialog({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div
      className="pa-dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="pa-dialog pa-admin-new"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <section aria-labelledby={id}>
          <h2 id={id} className="pa-admin-new-title">
            {label}
          </h2>
          {children}
        </section>
      </section>
    </div>
  );
}

function InviteDialog({
  emailReady,
  onClose,
  onSend,
}: {
  emailReady: boolean;
  onClose: () => void;
  onSend: (email: string, role: "ADMIN" | "PLAYER") => Promise<boolean>;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"PLAYER" | "ADMIN">("PLAYER");
  const [busy, setBusy] = useState(false);
  const id = useId();
  const first = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const ok = await onSend(email.trim(), role);
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <Dialog label="Invite someone" onClose={onClose}>
      <form className="pa-form" onSubmit={(event) => void submit(event)}>
        <label className="pa-label" htmlFor={`${id}-email`}>
          Their email address
        </label>
        <input
          id={`${id}-email`}
          ref={first}
          className="pa-input"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <span className="pa-label" id={`${id}-role`}>
          They will be
        </span>
        <div className="pa-admin-invite-role" role="radiogroup" aria-labelledby={`${id}-role`}>
          {(["PLAYER", "ADMIN"] as const).map((choice) => (
            <button
              key={choice}
              type="button"
              role="radio"
              aria-checked={role === choice}
              className="pa-admin-invite-role-option"
              onClick={() => setRole(choice)}
            >
              {choice === "PLAYER" ? "A player" : "An administrator"}
            </button>
          ))}
        </div>
        <p className="pa-admin-invite-note">
          {emailReady
            ? "They get an email with a link that works once, for 48 hours. They choose their own username and password."
            : "Email isn't set up on this server yet, so you'll get the link to send yourself. It works once, for 48 hours."}
        </p>
        <div className="pa-button-row">
          <button type="submit" className="pa-button pa-button-brass" disabled={busy}>
            {busy ? "Sending…" : emailReady ? "Send invitation" : "Make the link"}
          </button>
          <button type="button" className="pa-button pa-button-quiet" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function SentDialog({ sent, onClose }: { sent: InviteSent; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement | null>(null);
  const copy = () => {
    navigator.clipboard.writeText(sent.link).then(
      () => setCopied(true),
      () => field.current?.select(),
    );
  };
  return (
    <Dialog label={sent.emailed ? "Invitation sent" : "Invitation link"} onClose={onClose}>
      <p className="pa-admin-invite-note" role="status">
        {sent.emailed
          ? `Emailed to ${sent.email}. If it doesn't arrive, send them this link yourself.`
          : sent.emailProblem
            ? `The email didn't go: ${sent.emailProblem} Send this link to ${sent.email} yourself.`
            : `Send this link to ${sent.email} yourself (a text, a message or an email).`}{" "}
        It works once, until{" "}
        {new Date(sent.expiresAt).toLocaleString([], {
          weekday: "long",
          day: "numeric",
          month: "long",
          hour: "2-digit",
          minute: "2-digit",
        })}
        , and is shown only now.
      </p>
      <div className="pa-admin-invite-link">
        <input
          ref={field}
          className="pa-input"
          readOnly
          value={sent.link}
          aria-label="The link to send"
          onFocus={(event) => event.target.select()}
        />
        <button type="button" className="pa-button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="pa-button-row">
        <button type="button" className="pa-button pa-button-brass" onClick={onClose}>
          Done
        </button>
      </div>
    </Dialog>
  );
}
