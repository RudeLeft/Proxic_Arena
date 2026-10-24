-- Spec 0008 (owner 2026-10-24) — the Deck Depot's zoom turns a card that
-- has two faces over, so an entry needs the name of the face it turns
-- to. Forge answers it with each resolved card at import (ARCH-001);
-- deck_face_art already holds that face's picture under its name.
ALTER TABLE deck_entry ADD COLUMN back_face_name TEXT NULL;

-- Whether Forge has been asked about this deck's faces. Decks imported
-- before this are asked once, in the background (DeckCategoryFill). A
-- deck with no back-face pictures has nothing to turn over, so it
-- counts as asked and costs no worker.
ALTER TABLE imported_deck ADD COLUMN faces_checked BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE imported_deck d SET faces_checked = TRUE
 WHERE NOT EXISTS (SELECT 1 FROM deck_face_art f WHERE f.deck_id = d.deck_id);
