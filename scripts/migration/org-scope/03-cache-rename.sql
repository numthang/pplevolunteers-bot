-- ============================================================================
-- cache-rename.sql — rename 2 external-sync cache tables (ชื่อสื่อความ)
-- org-core branch · localhost only · 2026-07-19
--
--   ngs_member_cache → cache_pple_member   (roster จากระบบ NGS = สมาชิกพรรค PPLE)
--   act_event_cache  → cache_pple_event    (event จากระบบ ACT ของ PPLE)
--
-- rename เฉพาะ "ตาราง" · ⚠️ column docs_projects.act_event_cache_id คงชื่อเดิม
--   (rename column = docs scope creep — ไว้ทำตอน migrate docs) → เป็น cosmetic residue
-- idempotent (IF EXISTS ทุกบรรทัด) · rerun ปลอดภัย
-- prod cutover: บล็อกนี้ต้องรันตอน merge org-core→master (prod ยังชื่อเก่า)
-- ============================================================================

BEGIN;

-- ── tables ──────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS ngs_member_cache RENAME TO cache_pple_member;
ALTER TABLE IF EXISTS act_event_cache  RENAME TO cache_pple_event;

-- ── indexes/sequence ที่ฝังชื่อเก่า (ตัว idx_18xxx_* gibberish จาก DBeaver ปล่อยไว้) ──
ALTER INDEX    IF EXISTS idx_ngs_member_cache_guild        RENAME TO idx_cache_pple_member_guild;
ALTER INDEX    IF EXISTS idx_act_event_cache_act_event_id  RENAME TO idx_cache_pple_event_act_event_id;
ALTER SEQUENCE IF EXISTS act_event_cache_id_seq            RENAME TO cache_pple_event_id_seq;

-- ── FK constraint บน docs_projects (cosmetic — RENAME CONSTRAINT ไม่มี IF EXISTS) ──
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='docs_projects_act_event_cache_id_fkey') THEN
    ALTER TABLE docs_projects
      RENAME CONSTRAINT docs_projects_act_event_cache_id_fkey
                     TO docs_projects_cache_pple_event_id_fkey;
  END IF;
END $$;

-- ── VERIFY ──────────────────────────────────────────────────────────────────
\echo '=== ตารางใหม่ควรมี, ตารางเก่าควรหาย ==='
SELECT
  to_regclass('cache_pple_member') AS new_member,
  to_regclass('cache_pple_event')  AS new_event,
  to_regclass('ngs_member_cache')  AS old_member_should_be_null,
  to_regclass('act_event_cache')   AS old_event_should_be_null;

COMMIT;
