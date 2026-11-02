-- Spec 0048 (owner 2026-11-01) -- Reset the Belt, from Admin.
--
-- The Belt is worked out from the finished games (spec 0018); a reset is
-- a dated event in that history: from reset_at nobody holds it, and the
-- next game's winner takes it. Kept, not applied once, so the history
-- replays the same way every time the Hall is built.
CREATE TABLE belt_reset (
    reset_id  BIGSERIAL   PRIMARY KEY,
    reset_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reset_by  UUID        REFERENCES app_user (user_id) ON DELETE SET NULL
);
