-- ============================================================================
-- calling-org-scope.sql — Calling feature: guild-scope → org-scope (full parity)
-- org-core branch · localhost only · 2026-07-19
--
-- หลักการ (grill เคาะ 2026-07-19 · ตาม finance-org-scope.sql):
--   scope  : guild_id (VARCHAR snowflake) → org_id (INT → orgs.id)   [in-place, คงตำแหน่ง]
--   person : called_by/assigned_to/assigned_by/override_by/created_by/updated_by/
--            user_discord_id (VARCHAR discord) → INT → users.id      [in-place, คงชื่อ+ตำแหน่ง]
--   roster : cache_pple_member = NGS data ของ org → guild_id→org_id ด้วย
--            ⚠️ แต่แปลง "แค่ guild_id" — created_by/approved_by ของมัน = user ระบบ NGS ภายนอก คงไว้
--   artifact: campaign_id (→ cache_pple_event = ACT/Discord event) คง INT เดิม ไม่แตะ
--             member_id (callee: source_id หรือ contact.id, polymorphic ด้วย contact_type) คง VARCHAR
--
-- data coverage verified 2026-07-19: guild 1340→org 1 · person map 100%
--   (called_by 14/14 · assigned_to 20/20 · assigned_by 2/2 · user_discord_id 1/1
--    · override_by/created_by/updated_by = 0 rows) → ไม่มี NULL surprise / NOT NULL violation
-- ไม่มี FK เดิม (แค่ PK) · ไม่มี DEFAULT (ไม่ต้อง DROP DEFAULT แบบ finance)
--
-- ⚠️ คู่กับงาน code: link-ngs docs 1 query (WHERE cache_pple_member.guild_id) ต้องแก้เป็น org_id
--    + 2 import script เขียน org_id + rewire calling org-native (registry/guard/stats-auth)
-- ⚠️ prod (master) = guild-based ยังไม่แตะ · รันตอน cutover
-- dry-run: ลงท้าย ROLLBACK · ผ่าน verify แล้วเปลี่ยนเป็น COMMIT
-- ============================================================================

BEGIN;

-- ===== 0. helper lookup (USING ห้าม subquery แต่เรียก function ได้) ============
CREATE FUNCTION pg_temp._g2o(text) RETURNS integer AS
  $$ SELECT org_id FROM dc_guilds WHERE guild_id = $1 $$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._d2u(text) RETURNS integer AS
  $$ SELECT id FROM users WHERE discord_id = $1 $$ LANGUAGE sql STABLE;

-- ===== 1. guild_id → org_id (in-place type convert, คงตำแหน่งคอลัมน์) =========
ALTER TABLE calling_logs         ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE calling_logs         RENAME COLUMN guild_id TO org_id;
ALTER TABLE calling_assignments  ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE calling_assignments  RENAME COLUMN guild_id TO org_id;
ALTER TABLE calling_member_tiers ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE calling_member_tiers RENAME COLUMN guild_id TO org_id;
ALTER TABLE calling_contacts     ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE calling_contacts     RENAME COLUMN guild_id TO org_id;
ALTER TABLE calling_starred      ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE calling_starred      RENAME COLUMN guild_id TO org_id;
ALTER TABLE cache_pple_member    ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE cache_pple_member    RENAME COLUMN guild_id TO org_id;

-- ===== 2. person : VARCHAR discord → INT users.id (in-place) =================
--  roster (cache_pple_member) ไม่แตะ person — created_by = NGS ภายนอก ไม่ใช่ user เรา
--
-- ⚠️ prod มี `DEFAULT NULL::character varying` บน 4 คอลัมน์นี้ (localhost ไม่มี) →
--    ALTER TYPE พังที่ `default for column "called_by" cannot be cast automatically
--    to type integer` · เจอตอนซ้อมกับ dump ของ prod 2026-07-23
--    DROP DEFAULT ก่อนเสมอ — default เป็น NULL อยู่แล้ว ทิ้งได้ ไม่เสียความหมาย
--    (กวาดครบทุกคอลัมน์ที่แปลงเป็น integer แล้ว — docs/cases/audit/finance ไม่มีปัญหานี้)
ALTER TABLE calling_logs         ALTER COLUMN called_by  DROP DEFAULT;
ALTER TABLE calling_contacts     ALTER COLUMN created_by DROP DEFAULT;
ALTER TABLE calling_contacts     ALTER COLUMN updated_by DROP DEFAULT;
ALTER TABLE calling_member_tiers ALTER COLUMN override_by DROP DEFAULT;

ALTER TABLE calling_logs         ALTER COLUMN called_by       TYPE integer USING pg_temp._d2u(called_by);
ALTER TABLE calling_assignments  ALTER COLUMN assigned_to     TYPE integer USING pg_temp._d2u(assigned_to);
ALTER TABLE calling_assignments  ALTER COLUMN assigned_by     TYPE integer USING pg_temp._d2u(assigned_by);
ALTER TABLE calling_member_tiers ALTER COLUMN override_by     TYPE integer USING pg_temp._d2u(override_by);
ALTER TABLE calling_contacts     ALTER COLUMN created_by      TYPE integer USING pg_temp._d2u(created_by);
ALTER TABLE calling_contacts     ALTER COLUMN updated_by      TYPE integer USING pg_temp._d2u(updated_by);
ALTER TABLE calling_starred      ALTER COLUMN user_discord_id TYPE integer USING pg_temp._d2u(user_discord_id);
-- rename ให้สื่อว่าเป็น user id ไม่ใช่ discord snowflake แล้ว
ALTER TABLE calling_starred      RENAME COLUMN user_discord_id TO user_id;

-- ===== 3. FK ใหม่ → canonical orgs(id) + users(id) ==========================
ALTER TABLE calling_logs         ADD CONSTRAINT calling_logs_org_id_fkey        FOREIGN KEY (org_id)    REFERENCES orgs(id),
                                 ADD CONSTRAINT calling_logs_called_by_fkey      FOREIGN KEY (called_by) REFERENCES users(id);
ALTER TABLE calling_assignments  ADD CONSTRAINT calling_assignments_org_id_fkey  FOREIGN KEY (org_id)      REFERENCES orgs(id),
                                 ADD CONSTRAINT calling_assignments_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id),
                                 ADD CONSTRAINT calling_assignments_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES users(id);
ALTER TABLE calling_member_tiers ADD CONSTRAINT calling_member_tiers_org_id_fkey FOREIGN KEY (org_id)      REFERENCES orgs(id),
                                 ADD CONSTRAINT calling_member_tiers_override_by_fkey FOREIGN KEY (override_by) REFERENCES users(id);
ALTER TABLE calling_contacts     ADD CONSTRAINT calling_contacts_org_id_fkey     FOREIGN KEY (org_id)     REFERENCES orgs(id),
                                 ADD CONSTRAINT calling_contacts_created_by_fkey  FOREIGN KEY (created_by) REFERENCES users(id),
                                 ADD CONSTRAINT calling_contacts_updated_by_fkey  FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE calling_starred      ADD CONSTRAINT calling_starred_org_id_fkey      FOREIGN KEY (org_id)  REFERENCES orgs(id),
                                 ADD CONSTRAINT calling_starred_user_id_fkey      FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE cache_pple_member    ADD CONSTRAINT cache_pple_member_org_id_fkey    FOREIGN KEY (org_id)  REFERENCES orgs(id);

-- ===== 4. VERIFY (ดูก่อน COMMIT) ============================================
\echo '--- column types (ควรเป็น integer หมด) ---'
SELECT table_name, column_name, data_type FROM information_schema.columns
WHERE column_name IN ('org_id','called_by','assigned_to','assigned_by','override_by','created_by','updated_by','user_id')
  AND table_name IN ('calling_logs','calling_assignments','calling_member_tiers','calling_contacts','calling_starred','cache_pple_member')
ORDER BY table_name, column_name;

\echo '--- org_id null count ต่อ table (ควร 0 ทั้งหมด) ---'
SELECT 'calling_logs' t, count(*) rows, count(*) FILTER (WHERE org_id IS NULL) org_null FROM calling_logs
UNION ALL SELECT 'calling_assignments', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM calling_assignments
UNION ALL SELECT 'calling_member_tiers', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM calling_member_tiers
UNION ALL SELECT 'calling_contacts', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM calling_contacts
UNION ALL SELECT 'calling_starred', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM calling_starred
UNION ALL SELECT 'cache_pple_member', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM cache_pple_member;

\echo '--- person mapped (non-null after convert) ---'
SELECT 'logs.called_by' k, count(called_by) n FROM calling_logs
UNION ALL SELECT 'assign.assigned_to', count(assigned_to) FROM calling_assignments
UNION ALL SELECT 'assign.assigned_by', count(assigned_by) FROM calling_assignments
UNION ALL SELECT 'starred.user_id', count(user_id) FROM calling_starred;

COMMIT;  -- dry-run verified 2026-07-19 (ROLLBACK) → applied localhost org-core
