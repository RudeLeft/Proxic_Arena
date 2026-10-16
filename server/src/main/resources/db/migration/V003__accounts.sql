-- V003 — Accounts & Authentication (PHASE_03 §3.87–§3.89).
--
-- Two tables. §3.111 forbids user deletion in this phase, §3.112
-- forbids open registration, and §3.86 forbids assigning Phase 2
-- decks to anybody — so there is deliberately no ownership column
-- anywhere here. Phase 4 adds it.

-- One account.
--
-- The id is permanent and opaque (§3.3). A username can be changed
-- and a display name is cosmetic; neither is identity.
CREATE TABLE app_user (
    user_id             UUID PRIMARY KEY,

    -- §3.4, §3.5 — both forms are kept. `username` is what the
    -- person typed and is shown back to them; `username_normalized`
    -- is what uniqueness and login compare against.
    --
    -- Storing only the normalized form would mean greeting someone
    -- as "rudeleft" forever; storing only the typed form would let
    -- "RudeLeft" and "rudeleft" both exist, and §3.44's generic
    -- login failure would then hide which one you are failing
    -- against.
    username            TEXT        NOT NULL,
    username_normalized TEXT        NOT NULL UNIQUE,

    display_name        TEXT        NOT NULL,

    -- §3.11 — a hash, never a password. The encoded Argon2id form
    -- carries its own parameters, so raising the cost later does not
    -- invalidate existing rows (§3.105).
    password_hash       TEXT        NOT NULL,

    -- §3.7, §3.8. Constrained rather than free text: a typo in a
    -- role string is a silent privilege bug.
    role                TEXT        NOT NULL,
    status              TEXT        NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT app_user_role_known CHECK (role IN ('PLAYER', 'ADMIN')),
    CONSTRAINT app_user_status_known CHECK (status IN ('ACTIVE', 'DISABLED')),
    CONSTRAINT app_user_username_not_blank CHECK (length(trim(username)) > 0),
    CONSTRAINT app_user_normalized_matches CHECK (username_normalized = lower(username_normalized))
);

-- One login session.
--
-- §3.26 keeps two concepts apart:
--
--   session_id    a safe internal identifier, usable in logs
--   token         the secret the browser holds
--
-- Only the token's HASH is stored (§3.21). A database dump must not
-- hand over live sessions, which is exactly what storing raw tokens
-- would do — and that is a far more common breach than a password
-- file, because backups travel.
CREATE TABLE user_session (
    session_id      UUID PRIMARY KEY,
    user_id         UUID        NOT NULL
        REFERENCES app_user (user_id) ON DELETE CASCADE,

    token_sha256    CHAR(64)    NOT NULL UNIQUE,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- §3.29 — an absolute ceiling, independent of activity. Idle
    -- expiry (§3.28) is computed from last_active_at.
    expires_at      TIMESTAMPTZ NOT NULL,

    -- §3.33, §3.34, §3.36, §3.37 — revocation is a timestamp rather
    -- than a delete, so "this session ended at 14:02" survives for
    -- diagnosis instead of vanishing.
    revoked_at      TIMESTAMPTZ,

    CONSTRAINT user_session_expiry_after_creation CHECK (expires_at > created_at)
);

-- Login looks a session up by token hash, and that is the hot path.
CREATE INDEX user_session_token_idx ON user_session (token_sha256);

-- "Revoke everything for this user" (§3.34, §3.36) and the cleanup
-- sweep (§3.90) both scan by user and by expiry.
CREATE INDEX user_session_user_idx ON user_session (user_id);
CREATE INDEX user_session_expires_idx ON user_session (expires_at);
