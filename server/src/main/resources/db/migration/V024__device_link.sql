-- Spec 0021 (owner 2026-10-27) — a computer linked to an account.
--
-- The Deck Builder downloads the deck rules as a signed-in player. It is
-- not a browser, so it holds a device token rather than a session: the
-- player makes a one-time code on the Account page, the Deck Builder
-- trades it for the token, and the token may download the deck rules and
-- nothing else. Only SHA-256s are kept, of codes and tokens alike (as
-- with session tokens, §3.21): a copy of these tables opens nothing.

-- A code lives 10 minutes and works once. A new code replaces the
-- player's last unused one.
CREATE TABLE device_code (
    code_hash   TEXT        PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ
);

CREATE INDEX device_code_user_idx ON device_code (user_id);

-- A linked computer. Ended by Remove, by signing out everywhere, by an
-- administrator's sign-out and by a disabled account, as sessions are.
CREATE TABLE device_link (
    device_id     UUID        PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    token_hash    TEXT        NOT NULL UNIQUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);

CREATE INDEX device_link_user_idx ON device_link (user_id);
