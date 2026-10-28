-- Spec 0026 (owner 2026-10-28) — password reset by email.
--
-- An administrator sends a reset; the player gets a link that works once,
-- for an hour, and chooses their own password. Nobody else ever sees it.

-- The address a reset goes to. Accounts made from an invitation take the
-- invitation's address (the newest, if there were several); the rest start
-- with none, and the player or an administrator adds one.
ALTER TABLE app_user ADD COLUMN email TEXT;

UPDATE app_user u
   SET email = i.email
  FROM (SELECT DISTINCT ON (used_by) used_by, email
          FROM account_invite
         WHERE used_by IS NOT NULL AND used_at IS NOT NULL
         ORDER BY used_by, used_at DESC) i
 WHERE i.used_by = u.user_id;

-- A reset link. Only the SHA-256 of its code is kept (as with sessions,
-- §3.21, and invitations): a copy of this table opens nothing. Ended once,
-- by whichever comes first: using it, a newer reset, or the password
-- changing some other way.
CREATE TABLE password_reset (
    reset_id      UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    token_hash    TEXT        NOT NULL UNIQUE,
    requested_by  UUID        REFERENCES app_user (user_id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at    TIMESTAMPTZ NOT NULL,
    used_at       TIMESTAMPTZ,
    cancelled_at  TIMESTAMPTZ,
    CONSTRAINT password_reset_ends_once CHECK (used_at IS NULL OR cancelled_at IS NULL)
);

-- The per-account sending limit counts recent rows.
CREATE INDEX password_reset_user_idx ON password_reset (user_id, created_at);
