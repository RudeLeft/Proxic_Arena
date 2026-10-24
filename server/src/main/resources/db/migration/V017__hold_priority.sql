-- Spec 0004 (owner 2026-10-23) — Hold priority: with it on, the game
-- asks a player after their OWN spell, ability or trigger goes on the
-- stack instead of passing for them. On until the player turns it off.
ALTER TABLE player_stops ADD COLUMN hold BOOLEAN NOT NULL DEFAULT false;
