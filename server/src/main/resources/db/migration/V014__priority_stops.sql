-- PHASE_07 §7.53, AMENDMENT 13 — each player's priority stops.
--
-- The steps a player is ASKED at, on their own turn and on the
-- opponent's; everywhere else the game passes priority for them (and
-- only priority: targets, payments and blocks are always asked). No row
-- means the defaults (PriorityStops.kt). Forge's step names, comma-
-- separated; the server validates them before writing.
CREATE TABLE player_stops (
    user_id     UUID        PRIMARY KEY
        REFERENCES app_user (user_id) ON DELETE CASCADE,
    own         TEXT        NOT NULL,
    opponent    TEXT        NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
