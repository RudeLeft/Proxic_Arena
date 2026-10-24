-- Spec 0006 (owner 2026-10-24) — each player's avatar picture, chosen on
-- the Account page from the owner's set of 50. NULL is the default
-- picture. The app serves the pictures; this holds only which one.
ALTER TABLE app_user ADD COLUMN avatar TEXT
    CHECK (avatar IS NULL OR avatar ~ '^avatar-(0[1-9]|[1-4][0-9]|50)$');
