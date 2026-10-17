-- PHASE_05 §5.114 — an invalidated setup must not hold a deck.
--
-- `match_setup_player.deck_id` is ON DELETE RESTRICT, which is
-- right for a setup that could still launch and wrong for one that
-- never will. The seat rows of an INVALIDATED setup were left
-- behind, so a player who prepared a match once and cancelled it
-- could never delete that deck again: the Deck Depot delete simply
-- failed, permanently, for a reason nothing on screen explained.
--
-- Found by the end-to-end match-setup test on its second run. The
-- first run left an invalidated setup behind, the deck could not be
-- cleared, and the re-import was refused as a duplicate.
--
-- The code now removes these rows as part of invalidating. This
-- releases the ones already written, on any database that ran a
-- build between V006 and this one.
--
-- CONSUMED setups keep their seats, deliberately. That is a match
-- that was actually launched, and the deck it was played with is
-- part of that record rather than clutter.

DELETE FROM match_setup_player p
 USING match_setup s
 WHERE s.setup_id = p.setup_id
   AND s.status = 'INVALIDATED';
