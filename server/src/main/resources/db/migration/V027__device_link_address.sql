-- Spec 0027 (owner 2026-10-28) — the Admin page's Computers tab shows
-- where each linked computer last connected from, as the Sign-ins tab
-- shows addresses (owner decision 1). Written each time the computer uses
-- its link; null until it first does.
ALTER TABLE device_link ADD COLUMN last_used_from TEXT;
