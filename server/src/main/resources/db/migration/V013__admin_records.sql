-- PHASE_07 §7.67, Amendment 9 — what the Admin page reads.
--
-- Sign-in activity: every attempt, with its time, the account it was
-- for, the result and the address it came from. Phase 3 wrote these
-- to the server log only (§3.94), which answers "did somebody try?"
-- for whoever can read the container's log and nobody else. The log
-- lines stay; this is the copy an administrator can see.
--
-- `username` is the NORMALIZED name that was tried, kept even when no
-- such account exists: a brute-force attempt is illegible without it
-- (§3.96). Never the password, in any form (§3.95).
CREATE TABLE sign_in_event (
    event_id    BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    kind        TEXT        NOT NULL
        CONSTRAINT sign_in_event_kind_known CHECK (kind IN ('SIGNED_IN', 'FAILED', 'THROTTLED')),
    username    TEXT        NOT NULL,
    -- Null when the name matched no account; SET NULL so deleting an
    -- account later does not delete the record of attempts on it.
    user_id     UUID
        REFERENCES app_user (user_id) ON DELETE SET NULL,
    address     TEXT
);
CREATE INDEX sign_in_event_at_idx ON sign_in_event (at);

-- §7.67 — every admin action is recorded: who, what, to which account
-- or room, when. Also written to the server log.
CREATE TABLE admin_action (
    action_id      BIGSERIAL PRIMARY KEY,
    at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    admin_user_id  UUID        NOT NULL
        REFERENCES app_user (user_id) ON DELETE RESTRICT,
    action         TEXT        NOT NULL,
    -- An account username or a room id: what it was done TO.
    target         TEXT        NOT NULL,
    detail         TEXT
);
CREATE INDEX admin_action_at_idx ON admin_action (at);
