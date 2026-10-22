-- PHASE_07 §7.59, P7-W — the other faces' pictures.
--
-- The Proxic Deck Builder now bundles the back face of every card that
-- turns over (transform, modal double-faced, battle) as its own image,
-- filed under THAT face's name: real_cards/Insectile Aberration [M21].png
-- beside Delver of Secrets [M21].png. deck_entry.art_sha256 holds the
-- front face only, so a picture whose name is not any entry's front face
-- is kept here, by the face name Forge will use once the card has turned
-- over. Lowercase, as the importer reads names from filenames.
CREATE TABLE deck_face_art (
    deck_id     UUID     NOT NULL
        REFERENCES imported_deck (deck_id) ON DELETE CASCADE,
    face_name   TEXT     NOT NULL,
    art_sha256  CHAR(64) NOT NULL
        REFERENCES art_asset (content_sha256) ON DELETE RESTRICT,
    PRIMARY KEY (deck_id, face_name)
);
