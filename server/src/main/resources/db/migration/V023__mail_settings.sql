-- Spec 0014 amendment 1 (owner 2026-10-25) — the email account, set on the
-- Admin page's Email tab rather than in the server's settings file, so a
-- change of provider is a form, not an edit on Unraid.
--
-- One row. The password is never stored readable: AES-256-GCM under a key
-- derived from PROXIC_SESSION_SECRET (MailSettings.kt), so a copy of the
-- database alone opens nothing. It is never sent back to any page.
CREATE TABLE mail_settings (
    id                  INTEGER     PRIMARY KEY CHECK (id = 1),
    host                TEXT        NOT NULL,
    port                INTEGER     NOT NULL CHECK (port BETWEEN 1 AND 65535),
    security            TEXT        NOT NULL CHECK (security IN ('starttls', 'ssl')),
    username            TEXT,
    from_address        TEXT        NOT NULL,
    password_sealed     BYTEA,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by          UUID        REFERENCES app_user (user_id) ON DELETE SET NULL
);
