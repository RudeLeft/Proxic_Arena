-- Owner 2026-10-28 — a new set of 132 avatars replaces the first 50.
-- The names stay "avatar-NN": a player who chose avatar-07 now has the new
-- set's 07. Numbers past 99 have three digits ("avatar-132").
ALTER TABLE app_user DROP CONSTRAINT app_user_avatar_check;
ALTER TABLE app_user ADD CONSTRAINT app_user_avatar_check
    CHECK (avatar IS NULL OR avatar ~ '^avatar-(0[1-9]|[1-9][0-9]|1[0-2][0-9]|13[0-2])$');
