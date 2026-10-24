-- Spec 0005 (owner 2026-10-23) replaces spec 0004's Hold button: a
-- player's own spell or trigger is now always offered as a short response
-- window, so there is no Hold setting to keep.
ALTER TABLE player_stops DROP COLUMN hold;
