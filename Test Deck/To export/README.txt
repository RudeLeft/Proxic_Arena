TEST DECKS (the lists; the exports stay on this computer only)
==============================================================

These decklists rebuild the real-picture test material in "Test Deck".
The pictures are Wizards card art, so the exported files are never put
in git (AGENTS GIT-001). CI does not need any of this: it builds its own
picture-free decks. The lists below are kept in git so the exports can
be made again at any time.

How to make them: Proxic Deck Builder 1.4.5 or later, File > Test Deck
Export. (Not 1.4.4: its export adds back faces and other printings, and
the tests count pictures exactly. Not "Send to Arena": that fills the
Deck Depot, not a file.)

The export is a .zip holding the decklist (named from the list's first
"// Name" line) and real_cards/, one PNG of the FRONT face of each
different card.


1. Basic_Mono_Red_65_Card_Deck.txt   (needed)
   Export to:  Proxic_Arena\Test Deck\Basic_Mono_Red_65_Card_Deck.zip
   Inside:     65 cards, 11 different, 11 PNGs (no Storm-Charged Slasher).
   Used by:    the server's deck tests (DeckList, PackageInspector,
               CardResolver, DeckImport, DeckApi), the Decks page browser
               test, and the game browser tests that prefer a real deck.

2. Basic_Mono_Green_60_Card_Deck.txt   (optional)
   Export to:  Proxic_Arena\Test Deck\Basic_Mono_Green_60_Card_Deck.zip
   Inside:     60 cards, 10 different, 10 PNGs.
   Used by:    hand-played checks and screenshots (red against green).
               No test reads it.

3. The Mechanics Lab pictures   (needed)
   List:       Proxic_Arena\Test Deck\Testing Deck\Proxic_Arena_Mechanics_Lab_SOURCE.txt
               (export it as it is; never edit or re-save this file, a
               test checks its exact contents)
   Export to:  the export's real_cards\ folder, unzipped, as
               Proxic_Arena\Test Deck\Testing Deck\real_cards\
   Inside:     exactly 275 PNGs, one per card, named by its front face;
               no back faces and no extras (MechanicsLabArtTest).

Everything else in Test Deck (ci-deck.zip, the numbers, loyalty, crop
decks and the rest) is built by the project itself, no export needed:
    node scripts/make-ci-deck.mjs "Test Deck/<name>.zip" protocol/fixtures/<folder> [flags]
with the exact pairs listed in .github/workflows/ci.yml.
