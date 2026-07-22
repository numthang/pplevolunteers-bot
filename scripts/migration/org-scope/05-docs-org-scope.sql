-- ============================================================================
-- docs-org-scope.sql — Docs feature: guild-scope → org-scope (feature ที่ 3)
-- org-core branch · localhost only · 2026-07-21
--
-- หลักการ (เหมือน finance-org-scope.sql / calling-org-scope.sql):
--   scope  : guild_id (VARCHAR snowflake) → org_id (INT → orgs.id)  [in-place, คงตำแหน่ง]
--   person : *_discord_id (VARCHAR) → INT users.id                  [in-place, rename ให้สื่อ]
--   artifact: docs_projects.act_event_cache_id → rename เป็น cache_pple_event_id
--             (ตัว cache_pple_event ยังคง guild-based = ACT/Discord artifact ไม่แตะ)
--
-- ⚠️ docs_activity_entries / docs_signatures **ไม่มี guild_id ของตัวเอง** —
--    scope ผ่าน project_id / entry_id (ทุก read join docs_projects อยู่แล้ว ตรวจแล้ว)
--
-- coverage ก่อนแปลง (นับ 2026-07-21):
--   projects 9 · payers 1 · attachments 3 · entries 29 · signatures 7 · guild เดียว
--   person map: payer 7/7 · entries.member 21/21 · entries.payer 21/21 ·
--               payers.discord 1/1 · signatures 7/7 · **projects.created_by 8/9**
--   → created_by 1 แถว map ไม่ได้ (คนหายจากระบบ) = ตั้งใจให้เป็น NULL, log ไว้ก่อนทิ้ง
--   → entries 8/29 ไม่มี member_discord_id เลย (ผู้รับเงินคนนอก เซ็นผ่านลิงก์) = คง NULL
--
-- ❗ id_card_image (org_members → users) **ไม่อยู่ในไฟล์นี้** — ต้องรอ access check
--    ระดับ org ขึ้นก่อน (scrutinize blocker 1) แล้วค่อยย้ายในไฟล์ถัดไป
--
-- dry-run: ลงท้าย ROLLBACK · ผ่าน verify แล้วเปลี่ยนเป็น COMMIT
-- prod cutover: รันหลัง identity-refactor + cache-rename (ต้องมี users/orgs ก่อน)
-- ============================================================================

BEGIN;

-- ===== 0. helper lookup (USING ห้าม subquery แต่เรียก function ได้) ============
CREATE FUNCTION pg_temp._g2o(text) RETURNS integer AS
  $$ SELECT org_id FROM dc_guilds WHERE guild_id = $1 $$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._d2u(text) RETURNS integer AS
  $$ SELECT id FROM users WHERE discord_id = $1 $$ LANGUAGE sql STABLE;

-- ===== 0.1 log person ref ที่ map ไม่ได้ ก่อนกลายเป็น NULL ====================
\echo '=== person ref ที่ map เข้า users ไม่ได้ (จะกลายเป็น NULL) ==='
SELECT 'docs_projects.created_by' AS col, id AS row_id, created_by AS discord_id_เดิม
  FROM docs_projects WHERE created_by IS NOT NULL AND pg_temp._d2u(created_by) IS NULL
UNION ALL
SELECT 'docs_projects.payer_discord_id', id, payer_discord_id
  FROM docs_projects WHERE payer_discord_id IS NOT NULL AND pg_temp._d2u(payer_discord_id) IS NULL
UNION ALL
SELECT 'docs_activity_entries.member_discord_id', id, member_discord_id
  FROM docs_activity_entries WHERE member_discord_id IS NOT NULL AND pg_temp._d2u(member_discord_id) IS NULL
UNION ALL
SELECT 'docs_activity_entries.payer_discord_id', id, payer_discord_id
  FROM docs_activity_entries WHERE payer_discord_id IS NOT NULL AND pg_temp._d2u(payer_discord_id) IS NULL
UNION ALL
SELECT 'docs_payers.discord_id', id, discord_id
  FROM docs_payers WHERE discord_id IS NOT NULL AND pg_temp._d2u(discord_id) IS NULL
UNION ALL
SELECT 'docs_signatures.signed_by_discord_id', id, signed_by_discord_id
  FROM docs_signatures WHERE signed_by_discord_id IS NOT NULL AND pg_temp._d2u(signed_by_discord_id) IS NULL;

-- ===== 1. guild_id → org_id (in-place type convert, คงตำแหน่งคอลัมน์) =========
ALTER TABLE docs_projects           ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE docs_projects           RENAME COLUMN guild_id TO org_id;
ALTER TABLE docs_payers             ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE docs_payers             RENAME COLUMN guild_id TO org_id;
ALTER TABLE docs_project_attachments ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE docs_project_attachments RENAME COLUMN guild_id TO org_id;

-- ===== 2. person : VARCHAR discord → INT users.id (in-place + rename) ========
--  ⚠️ ปลด NOT NULL ก่อน — โมเดลที่เคาะคือ "คนนอก (ไม่มีบัญชี) = NULL"
--     created_by: มี 1 แถวเป็น 'test-script' (placeholder ไม่ใช่คน) → NULL
--     payers.user_id / signatures.signed_by: วันนี้ map ครบ แต่ผู้รับเงิน/ผู้เซ็นผ่านลิงก์
--     อาจไม่มีบัญชีเลย = ต้อง nullable ไม่งั้น flow เซ็นของคนนอกเขียนไม่ลง
ALTER TABLE docs_projects   ALTER COLUMN created_by           DROP NOT NULL;
ALTER TABLE docs_payers     ALTER COLUMN discord_id           DROP NOT NULL;
ALTER TABLE docs_signatures ALTER COLUMN signed_by_discord_id DROP NOT NULL;

ALTER TABLE docs_projects         ALTER COLUMN created_by           TYPE integer USING pg_temp._d2u(created_by);
ALTER TABLE docs_projects         ALTER COLUMN payer_discord_id     TYPE integer USING pg_temp._d2u(payer_discord_id);
ALTER TABLE docs_projects         RENAME COLUMN payer_discord_id TO payer_user_id;

ALTER TABLE docs_activity_entries ALTER COLUMN member_discord_id    TYPE integer USING pg_temp._d2u(member_discord_id);
ALTER TABLE docs_activity_entries RENAME COLUMN member_discord_id TO member_user_id;
ALTER TABLE docs_activity_entries ALTER COLUMN payer_discord_id     TYPE integer USING pg_temp._d2u(payer_discord_id);
ALTER TABLE docs_activity_entries RENAME COLUMN payer_discord_id TO payer_user_id;

ALTER TABLE docs_payers           ALTER COLUMN discord_id           TYPE integer USING pg_temp._d2u(discord_id);
ALTER TABLE docs_payers           RENAME COLUMN discord_id TO user_id;

ALTER TABLE docs_signatures       ALTER COLUMN signed_by_discord_id TYPE integer USING pg_temp._d2u(signed_by_discord_id);
ALTER TABLE docs_signatures       RENAME COLUMN signed_by_discord_id TO signed_by_user_id;

-- ===== 3. rename column ที่ชี้ cache_pple_event (เว้นไว้ตอน calling rename) ====
ALTER TABLE docs_projects RENAME COLUMN act_event_cache_id TO cache_pple_event_id;

-- ===== 4. FK ใหม่ → canonical orgs(id) + users(id) ===========================
ALTER TABLE docs_projects            ADD CONSTRAINT docs_projects_org_id_fkey     FOREIGN KEY (org_id)  REFERENCES orgs(id);
ALTER TABLE docs_payers              ADD CONSTRAINT docs_payers_org_id_fkey       FOREIGN KEY (org_id)  REFERENCES orgs(id);
ALTER TABLE docs_project_attachments ADD CONSTRAINT docs_attachments_org_id_fkey  FOREIGN KEY (org_id)  REFERENCES orgs(id);
ALTER TABLE docs_projects            ADD CONSTRAINT docs_projects_created_by_fkey FOREIGN KEY (created_by)        REFERENCES users(id);
ALTER TABLE docs_projects            ADD CONSTRAINT docs_projects_payer_fkey      FOREIGN KEY (payer_user_id)     REFERENCES users(id);
ALTER TABLE docs_activity_entries    ADD CONSTRAINT docs_entries_member_fkey      FOREIGN KEY (member_user_id)    REFERENCES users(id);
ALTER TABLE docs_activity_entries    ADD CONSTRAINT docs_entries_payer_fkey       FOREIGN KEY (payer_user_id)     REFERENCES users(id);
ALTER TABLE docs_payers              ADD CONSTRAINT docs_payers_user_fkey         FOREIGN KEY (user_id)           REFERENCES users(id);
ALTER TABLE docs_signatures          ADD CONSTRAINT docs_signatures_signer_fkey   FOREIGN KEY (signed_by_user_id) REFERENCES users(id);

-- ===== 5. VERIFY =============================================================
\echo '=== ชนิดคอลัมน์หลังแปลง (ต้องเป็น integer ทุกตัว) ==='
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name LIKE 'docs%'
   AND column_name IN ('org_id','created_by','payer_user_id','member_user_id','user_id',
                       'signed_by_user_id','cache_pple_event_id')
 ORDER BY table_name, column_name;

\echo '=== ข้อมูลไม่หาย + org_id ครบ ==='
SELECT 'projects'    t, count(*) rows, count(*) FILTER (WHERE org_id IS NULL) org_null FROM docs_projects
UNION ALL SELECT 'payers',      count(*), count(*) FILTER (WHERE org_id IS NULL) FROM docs_payers
UNION ALL SELECT 'attachments', count(*), count(*) FILTER (WHERE org_id IS NULL) FROM docs_project_attachments
UNION ALL SELECT 'entries',     count(*), NULL FROM docs_activity_entries
UNION ALL SELECT 'signatures',  count(*), NULL FROM docs_signatures;

\echo '=== person ref หลังแปลง (mapped = ชี้ users ได้จริง) ==='
SELECT count(*) AS entries_member_notnull,
       count(u.id) AS entries_member_mapped
  FROM docs_activity_entries e JOIN users u ON u.id = e.member_user_id;
SELECT count(*) AS sig_signer_notnull,
       count(u.id) AS sig_signer_mapped
  FROM docs_signatures s JOIN users u ON u.id = s.signed_by_user_id;
SELECT count(*) AS projects_created_by_null_หลังแปลง FROM docs_projects WHERE created_by IS NULL;

COMMIT;  -- dry-run verified 2026-07-21 (ROLLBACK) → applied localhost org-core
