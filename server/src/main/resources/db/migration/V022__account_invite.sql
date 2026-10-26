-- Spec 0014 (owner 2026-10-25) — accounts by invitation.
--
-- An administrator invites an email address; the person gets a link that
-- works once, for 48 hours, and chooses their own username and password.
-- Only the SHA-256 of the link's code is kept (as with session tokens,
-- §3.21): a copy of this table opens nothing.
CREATE TABLE account_invite (
    invite_id        UUID        PRIMARY KEY,
    token_hash       TEXT        NOT NULL UNIQUE,
    email            TEXT        NOT NULL,
    role             TEXT        NOT NULL CHECK (role IN ('PLAYER', 'ADMIN')),
    invited_by       UUID        NOT NULL REFERENCES app_user (user_id) ON DELETE RESTRICT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL,
    -- Set once, by whichever ends it: joining, cancelling, or a resend
    -- that replaced it.
    used_at          TIMESTAMPTZ,
    used_by          UUID        REFERENCES app_user (user_id) ON DELETE SET NULL,
    cancelled_at     TIMESTAMPTZ,
    CONSTRAINT account_invite_ends_once CHECK (used_at IS NULL OR cancelled_at IS NULL)
);

CREATE INDEX account_invite_created_idx ON account_invite (created_at);
