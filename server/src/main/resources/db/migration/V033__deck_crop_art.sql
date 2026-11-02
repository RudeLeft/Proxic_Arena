-- Spec 0051 — each picture's art crop, for the table.
--
-- The Proxic Deck Builder sends Scryfall's crop of each card's art beside
-- its picture: art_crops/<Name> [SET].jpg, named as the picture is
-- (a card's front face, a back face, a token). The table's art window
-- shows the crop instead of zooming into the whole card, which caught
-- slivers of frame on every card whose art box is not where a modern
-- frame keeps it. Kept by the face name the importer reads from the
-- filename, lowercase, as deck_face_art is; one per name, as a deck's
-- pictures are. A deck without crops (sent before 1.28.0) has no rows,
-- and the table zooms as before.
CREATE TABLE deck_crop_art (
    deck_id     UUID     NOT NULL
        REFERENCES imported_deck (deck_id) ON DELETE CASCADE,
    face_name   TEXT     NOT NULL,
    art_sha256  CHAR(64) NOT NULL
        REFERENCES art_asset (content_sha256) ON DELETE RESTRICT,
    PRIMARY KEY (deck_id, face_name)
);
