-- ============================================================================
-- cases-org-scope.sql — Cases feature: guild-scope → org-scope (feature ที่ 4 = ก้อนสุดท้าย)
-- org-core branch · localhost only · 2026-07-21
--
-- หลักการ (ตาม finance/calling/docs-org-scope.sql):
--   scope  : guild_id (VARCHAR snowflake) → org_id (INT → orgs.id)  [in-place คงตำแหน่ง]
--   person : cases.created_by (VARCHAR discord)      → INT users.id
--            case_assignees.discord_id → **rename เป็น user_id** INT users.id
--   artifact: discord_thread_id / discord_message_id คงไว้ (ข้อความที่บอทโพสต์จริง)
--
--   ⚠️ case_config = OUT OF SCOPE คง guild_id — มีคอลัมน์เดียวคือ forum_channel_id
--      = Discord artifact ล้วน (ตรรกะเดียวกับ finance_config)
--   ✅ case_letter_config → org_id — เป็นหัวจดหมายขององค์กร (org_name/address/
--      signer_name/signer_position) ต่อ province ไม่ใช่ของ Discord server
--
-- ⚠️ **เคสอยู่ 2 guild ที่ยุบเป็น org เดียว** (อาสาฯ 1340…=1 เคส · ราชบุรี 1111…=2 เคส
--    ทั้งคู่ = org 1) → หลังแปลงจะรวมเป็นกองเดียว · **ไม่ regress** เพราะฝั่งอ่านใช้
--    getOrgGuildIds() มองข้าม guild ใน org เดียวกันอยู่แล้ว (caseGate)
--
-- data coverage verified 2026-07-21:
--   cases 3 แถว — created_by: NULL 2 (ผู้ร้องสาธารณะ ไม่มีบัญชี = ถูกต้อง) · map ได้ 1/1
--   case_assignees 1 แถว map 1/1 · case_timeline 6 · case_attachments 0 · case_config 0
--   case_letter_config 1 (ไม่มี province ซ้ำข้าม guild → unique (org_id, province) ปลอดภัย)
--
-- ⚠️ prod (master) = guild-based ยังไม่แตะ · รันตอน cutover
-- dry-run: ลงท้าย ROLLBACK · ผ่าน verify แล้วเปลี่ยนเป็น COMMIT
-- ============================================================================

BEGIN;

-- ===== 0. helper lookup (USING ห้าม subquery แต่เรียก function ได้) ============
CREATE FUNCTION pg_temp._g2o(text) RETURNS integer AS
  $$ SELECT org_id FROM dc_guilds WHERE guild_id = $1 $$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._d2u(text) RETURNS integer AS
  $$ SELECT id FROM users WHERE discord_id = $1 $$ LANGUAGE sql STABLE;

-- ===== 1. pre-check: ต้อง map ได้ 100% + ไม่มี unique ชนกันตอนยุบ guild =======
\echo '=== pre-check A: guild map fail (ต้องเป็น 0 ทุกตาราง) ==='
SELECT 'cases' t, count(*) FILTER (WHERE pg_temp._g2o(guild_id) IS NULL) fail FROM cases
UNION ALL SELECT 'case_timeline',      count(*) FILTER (WHERE pg_temp._g2o(guild_id) IS NULL) FROM case_timeline
UNION ALL SELECT 'case_assignees',     count(*) FILTER (WHERE pg_temp._g2o(guild_id) IS NULL) FROM case_assignees
UNION ALL SELECT 'case_attachments',   count(*) FILTER (WHERE pg_temp._g2o(guild_id) IS NULL) FROM case_attachments
UNION ALL SELECT 'case_letter_config', count(*) FILTER (WHERE pg_temp._g2o(guild_id) IS NULL) FROM case_letter_config;

\echo '=== pre-check B: person map fail (created_by/discord_id ที่ไม่ NULL แต่หา users ไม่เจอ — ต้อง 0) ==='
SELECT count(*) AS cases_created_by_unmappable
  FROM cases WHERE created_by IS NOT NULL AND pg_temp._d2u(created_by) IS NULL;
SELECT count(*) AS assignees_unmappable
  FROM case_assignees WHERE discord_id IS NOT NULL AND pg_temp._d2u(discord_id) IS NULL;

\echo '=== pre-check C: letter_config province ซ้ำข้าม guild ใน org เดียวกัน (ต้อง 0) ==='
SELECT pg_temp._g2o(guild_id) AS org_id, province, count(*)
  FROM case_letter_config GROUP BY 1, 2 HAVING count(*) > 1;

-- ===== 2. guild_id → org_id (in-place type convert, คงตำแหน่งคอลัมน์) =========
-- index ที่อ้าง guild_id ต้องทิ้งก่อนแปลงชนิด แล้วสร้างใหม่ด้วยชื่อที่ตรงความจริง
DROP INDEX IF EXISTS idx_cases_guild;
DROP INDEX IF EXISTS idx_cases_province;
DROP INDEX IF EXISTS idx_case_assignees_user;

ALTER TABLE cases              ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE cases              RENAME COLUMN guild_id TO org_id;
ALTER TABLE case_timeline      ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE case_timeline      RENAME COLUMN guild_id TO org_id;
ALTER TABLE case_assignees     ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE case_assignees     RENAME COLUMN guild_id TO org_id;
ALTER TABLE case_attachments   ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE case_attachments   RENAME COLUMN guild_id TO org_id;
ALTER TABLE case_letter_config ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE case_letter_config RENAME COLUMN guild_id TO org_id;

-- ===== 3. person → users.id ==================================================
-- cases.created_by: NULL ได้ (ผู้ร้องสาธารณะไม่มีบัญชี) — ไม่ใช่ข้อมูลหาย
ALTER TABLE cases ALTER COLUMN created_by TYPE integer USING pg_temp._d2u(created_by);

-- case_assignees.discord_id → user_id (อยู่ใน PK → ต้องรื้อ PK ก่อน)
ALTER TABLE case_assignees DROP CONSTRAINT case_assignees_pkey;
ALTER TABLE case_assignees ALTER COLUMN discord_id TYPE integer USING pg_temp._d2u(discord_id);
ALTER TABLE case_assignees RENAME COLUMN discord_id TO user_id;
ALTER TABLE case_assignees ADD CONSTRAINT case_assignees_pkey PRIMARY KEY (case_id, user_id);

-- ===== 4. FK ================================================================
ALTER TABLE cases              ADD CONSTRAINT cases_org_fkey              FOREIGN KEY (org_id)     REFERENCES orgs(id);
ALTER TABLE cases              ADD CONSTRAINT cases_created_by_fkey       FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE case_timeline      ADD CONSTRAINT case_timeline_org_fkey      FOREIGN KEY (org_id)     REFERENCES orgs(id);
ALTER TABLE case_assignees     ADD CONSTRAINT case_assignees_org_fkey     FOREIGN KEY (org_id)     REFERENCES orgs(id);
ALTER TABLE case_assignees     ADD CONSTRAINT case_assignees_user_fkey    FOREIGN KEY (user_id)    REFERENCES users(id);
ALTER TABLE case_attachments   ADD CONSTRAINT case_attachments_org_fkey   FOREIGN KEY (org_id)     REFERENCES orgs(id);
ALTER TABLE case_letter_config ADD CONSTRAINT case_letter_config_org_fkey FOREIGN KEY (org_id)     REFERENCES orgs(id);

-- ===== 5. index ใหม่ + unique ที่ยุบเป็น org ==================================
CREATE INDEX idx_cases_org          ON cases (org_id, status, created_at DESC);
CREATE INDEX idx_cases_province     ON cases (org_id, province);
CREATE INDEX idx_case_assignees_user ON case_assignees (org_id, user_id);

ALTER TABLE case_letter_config DROP CONSTRAINT case_letter_config_guild_id_province_key;
ALTER TABLE case_letter_config ADD  CONSTRAINT case_letter_config_org_id_province_key UNIQUE (org_id, province);

-- ===== 6. VERIFY =============================================================
\echo '=== ชนิดคอลัมน์หลังแปลง (org_id/created_by/user_id ต้องเป็น integer) ==='
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name LIKE 'case%'
   AND column_name IN ('org_id','guild_id','created_by','user_id')
 ORDER BY table_name, column_name;

\echo '=== data ไม่หาย + org_id ครบ (case_config ต้องยังเป็น guild — ไม่อยู่ในลิสต์นี้) ==='
SELECT 'cases' t, count(*) rows, count(*) FILTER (WHERE org_id IS NULL) org_null FROM cases
UNION ALL SELECT 'case_timeline',      count(*), count(*) FILTER (WHERE org_id IS NULL) FROM case_timeline
UNION ALL SELECT 'case_assignees',     count(*), count(*) FILTER (WHERE org_id IS NULL) FROM case_assignees
UNION ALL SELECT 'case_attachments',   count(*), count(*) FILTER (WHERE org_id IS NULL) FROM case_attachments
UNION ALL SELECT 'case_letter_config', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM case_letter_config;

\echo '=== เคสจาก 2 guild ยุบเป็น org เดียวแล้ว + person ชี้ users ได้จริง ==='
SELECT c.id, c.ref, c.org_id, o.name AS org, c.province, c.created_by, u.username AS creator
  FROM cases c LEFT JOIN orgs o ON o.id = c.org_id LEFT JOIN users u ON u.id = c.created_by
 ORDER BY c.id;

\echo '=== case_config ต้องยังเป็น guild-based (Discord artifact) ==='
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='case_config' ORDER BY ordinal_position;

COMMIT;
