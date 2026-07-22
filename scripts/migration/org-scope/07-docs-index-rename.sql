-- ============================================================================
-- docs-index-rename.sql — 2026-07-21
-- เก็บกวาดหลัง docs → org migration: index/constraint 4 ตัวยังชื่อ "guild"/"discord_id"
-- ทั้งที่ตัวมันครอบ (org_id, user_id) ไปแล้วตั้งแต่ docs-org-scope.sql
-- ชื่อหลอกแบบนี้ทำให้ session หน้าอ่าน \d แล้วเข้าใจผิดว่า docs ยัง guild-scoped อยู่
--
-- ⚠️ rename อย่างเดียว ไม่แตะ data / ไม่แตะนิยาม index → ไม่มี downtime
-- idempotent: รันซ้ำได้ (เช็คชื่อเก่าก่อนทุกครั้ง)
--
-- prod cutover: รันหลัง docs-org-scope.sql
-- ============================================================================

BEGIN;

DO $$
BEGIN
  -- docs_payers: unique constraint (org_id, user_id)
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conname = 'docs_payers_guild_id_discord_id_key'
                AND conrelid = 'docs_payers'::regclass) THEN
    ALTER TABLE docs_payers
      RENAME CONSTRAINT docs_payers_guild_id_discord_id_key TO docs_payers_org_id_user_id_key;
  END IF;

  -- docs_payers: (org_id, sort_order)
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_docs_payers_guild') THEN
    ALTER INDEX idx_docs_payers_guild RENAME TO idx_docs_payers_org;
  END IF;

  -- docs_projects: (org_id)
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_docs_projects_guild') THEN
    ALTER INDEX idx_docs_projects_guild RENAME TO idx_docs_projects_org;
  END IF;

  -- docs_projects: unique (org_id, cache_pple_event_id)
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_docs_projects_guild_event') THEN
    ALTER INDEX idx_docs_projects_guild_event RENAME TO idx_docs_projects_org_event;
  END IF;
END $$;

\echo '=== index/constraint ของ docs หลัง rename (ต้องไม่เหลือคำว่า guild/discord) ==='
SELECT tablename, indexname, indexdef
  FROM pg_indexes
 WHERE tablename LIKE 'docs%'
 ORDER BY tablename, indexname;

COMMIT;
