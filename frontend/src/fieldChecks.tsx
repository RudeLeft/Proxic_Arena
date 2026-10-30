// Every box says whether it's right — spec 0041 (owner 2026-10-30).
//
// A new player could not make an account: Create account stayed grey and
// nothing said why. Now each box on the account, reset and Account pages
// shows its rule under it, a green check inside it once the rule is met,
// and the button's own list says what is still missing. The rules are
// the server's (PasswordHasher, Usernames, DisplayNames); the server still
// decides.

import type { InputHTMLAttributes, ReactNode } from "react";

/** The server's password rule: at least 12 characters, not only spaces. */
export const MIN_PASSWORD = 12;
/** The server's display-name rule: required, at most 12 characters. */
export const MAX_DISPLAY_NAME = 12;

export const passwordOk = (password: string) =>
  password.length >= MIN_PASSWORD && password.trim().length > 0;
export const againOk = (password: string, again: string) => again.length > 0 && again === password;
export const displayNameOk = (name: string) =>
  name.trim().length > 0 && name.trim().length <= MAX_DISPLAY_NAME;
export const usernameOk = (username: string) => /^[A-Za-z0-9._-]{3,32}$/.test(username.trim());

/** The password's rule line: "At least 12 characters · 5 more". */
export function passwordRule(password: string): string {
  const rule = `At least ${MIN_PASSWORD} characters`;
  if (password.length > 0 && password.length < MIN_PASSWORD) {
    return `${rule} · ${MIN_PASSWORD - password.length} more`;
  }
  if (password.length >= MIN_PASSWORD && !passwordOk(password)) return "Not only spaces";
  return rule;
}

/** What a new password still needs, in words, for the list under the button. */
export function passwordMissing(password: string, again: string): string[] {
  const missing: string[] = [];
  if (password.length === 0) missing.push(`a password of at least ${MIN_PASSWORD} characters`);
  else if (password.length < MIN_PASSWORD)
    missing.push(`${MIN_PASSWORD - password.length} more password characters`);
  else if (!passwordOk(password)) missing.push("a password that isn't only spaces");
  if (again.length === 0) missing.push("the password again");
  else if (!againOk(password, again)) missing.push("the second password to match the first");
  return missing;
}

/** What a display name still needs, in words. */
export function displayNameMissing(name: string): string[] {
  const length = name.trim().length;
  if (length === 0) return ["a display name"];
  if (length > MAX_DISPLAY_NAME)
    return [`a shorter display name (${length - MAX_DISPLAY_NAME} too many characters)`];
  return [];
}

/** A box with a green check inside it once it's right. */
export function CheckedInput({
  ok,
  ...input
}: { ok: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={`pa-check-field${ok ? " pa-check-field-ok" : ""}`}>
      <input className="pa-input" {...input} />
      <span aria-hidden="true" className="pa-check-mark">
        ✓
      </span>
    </span>
  );
}

/** The rule under a box: grey, green with a check once met, red when wrong. */
export function CheckRule({
  id,
  ok,
  wrong = false,
  children,
}: {
  id: string;
  ok: boolean;
  wrong?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      id={id}
      className={`pa-check-rule${ok ? " pa-check-rule-ok" : wrong ? " pa-check-rule-wrong" : ""}`}
    >
      <span aria-hidden="true" className="pa-check-dot">
        {ok ? "✓" : ""}
      </span>
      <span>{children}</span>
    </span>
  );
}

/** Under a button that is off: exactly what's still missing. Gone once nothing is. */
export function StillMissing({ lead, items }: { lead: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="pa-still-missing" role="status">
      {lead}
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
