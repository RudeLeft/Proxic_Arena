-- 2026-10-22 (owner) — why a match stopped, for the administrator.
--
-- A match that ends FAILED_RUNTIME recorded only failure_code
-- 'WORKER_STOPPED'; the worker's reason (an unbuilt question, and now the
-- card that asked it) reached the server log and the game record, but
-- the Admin page's list could not say it. Never shown to the players:
-- they are told only that the game stopped (§6.154).
ALTER TABLE match ADD COLUMN failure_detail TEXT;
