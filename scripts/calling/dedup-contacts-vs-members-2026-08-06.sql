-- ============================================================
-- One-off: dedup calling_contacts against cache_pple_member
-- Date: 2026-08-06
-- Matches on normalized phone (digits only) within same org_id.
-- Skips:
--   - contacts whose normalized phone is empty (e.g. phone = '-')
--     to avoid false match against members with junk mobile_number
--     like 'ไม่ได้ให้เบอร์มา' (also normalizes to '')
--   - contacts that already have activity in calling_logs /
--     calling_assignments / calling_member_tiers / calling_starred
--     (contact_type = 'contact') to avoid orphaning references
-- Run once. Safe to re-run (second run will delete 0 rows).
-- ============================================================

BEGIN;

-- 1) Backup the rows about to be deleted
CREATE TABLE calling_contacts_dedup_backup_20260806 AS
WITH matched AS (
  SELECT DISTINCT c.id
  FROM calling_contacts c
  JOIN cache_pple_member m
    ON regexp_replace(c.phone, '[^0-9]', '', 'g') = regexp_replace(m.mobile_number, '[^0-9]', '', 'g')
   AND c.org_id = m.org_id
  WHERE c.phone IS NOT NULL
    AND regexp_replace(c.phone, '[^0-9]', '', 'g') <> ''
),
has_activity AS (
  SELECT member_id::int AS id FROM calling_logs WHERE contact_type = 'contact'
  UNION SELECT member_id::int FROM calling_assignments WHERE contact_type = 'contact'
  UNION SELECT member_id::int FROM calling_member_tiers WHERE contact_type = 'contact'
  UNION SELECT member_id::int FROM calling_starred WHERE contact_type = 'contact'
)
SELECT c.*
FROM calling_contacts c
WHERE c.id IN (SELECT id FROM matched)
  AND c.id NOT IN (SELECT id FROM has_activity);

-- sanity check: row count backed up
SELECT count(*) AS rows_to_delete FROM calling_contacts_dedup_backup_20260806;

-- 2) Delete them from calling_contacts
DELETE FROM calling_contacts
WHERE id IN (SELECT id FROM calling_contacts_dedup_backup_20260806);

-- 3) Verify
SELECT count(*) AS remaining_contacts FROM calling_contacts;

COMMIT;

-- ============================================================
-- Rollback (if run went wrong and you're inside the same session
-- before COMMIT): run ROLLBACK; instead of COMMIT;
--
-- Restore after commit (if needed later):
--   INSERT INTO calling_contacts
--   SELECT * FROM calling_contacts_dedup_backup_20260806;
--
-- Cleanup backup table once confirmed fine (manual, not included here):
--   DROP TABLE calling_contacts_dedup_backup_20260806;
-- ============================================================
