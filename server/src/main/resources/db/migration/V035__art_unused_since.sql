-- Spec 0052 — when a picture stopped being used.
--
-- Pictures are shared by content hash, and deleting a deck never deleted
-- its pictures (the foreign keys are RESTRICT, and nothing swept), so the
-- art folder only grew. The weekly clean-up marks a picture no deck uses
-- with the day it found it so, clears the mark if a deck uses it again,
-- and deletes it once it has been unused for 30 days and no running game
-- shows it. NULL: in use, or not looked at yet.
ALTER TABLE art_asset ADD COLUMN unused_since TIMESTAMPTZ NULL;
