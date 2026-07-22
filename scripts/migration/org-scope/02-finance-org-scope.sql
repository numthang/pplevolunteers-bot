-- ============================================================================
-- finance-org-scope.sql — Finance feature: guild-scope → org-scope
-- org-core branch · localhost only · 2026-07-17
--
-- หลักการ (grill เคาะ 2026-07-17):
--   scope  : guild_id (VARCHAR snowflake) → org_id (INT → orgs.id)   [in-place convert, คงตำแหน่งคอลัมน์]
--   person : owner_id/updated_by (VARCHAR discord) → INT → users.id  [in-place convert, คงชื่อ+ตำแหน่ง]
--   artifact: finance_transactions.discord_msg_id คงไว้ (Discord artifact)
--
-- tail column ที่เติมช่วงออกแบบ (org_id/owner_user_id/updated_by_user_id) = ลบทิ้งก่อน
-- (คอลัมน์หน้ามีค่าพอ recompute เอง: guild_id→dc_guilds, owner_id/updated_by discord→users)
--
-- ⚠️ prod (master) = guild-based ยังไม่แตะ · bot write-path ยังเขียน guild_id (แก้ก่อน cutover)
-- รันแบบ dry-run: ครอบ BEGIN … ROLLBACK ก่อน แล้วดู verify block; ผ่านค่อยเปลี่ยนเป็น COMMIT
-- ============================================================================

BEGIN;

-- ===== 0. helper lookup functions (USING ห้าม subquery แต่เรียก function ได้) ==
CREATE FUNCTION pg_temp._g2o(text) RETURNS integer AS
  $$ SELECT org_id FROM dc_guilds WHERE guild_id = $1 $$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._d2u(text) RETURNS integer AS
  $$ SELECT id FROM users WHERE discord_id = $1 $$ LANGUAGE sql STABLE;

-- ===== 1. ลบ tail column + FK (เติมช่วงออกแบบ, superseded) ====================
ALTER TABLE finance_accounts
  DROP CONSTRAINT IF EXISTS finance_accounts_owner_user_id_fkey,
  DROP CONSTRAINT IF EXISTS finance_accounts_updated_by_user_id_fkey,
  DROP CONSTRAINT IF EXISTS finance_accounts_org_id_fkey,
  DROP COLUMN IF EXISTS org_id,
  DROP COLUMN IF EXISTS owner_user_id,
  DROP COLUMN IF EXISTS updated_by_user_id;

ALTER TABLE finance_categories
  DROP CONSTRAINT IF EXISTS finance_categories_owner_user_id_fkey,
  DROP CONSTRAINT IF EXISTS finance_categories_org_id_fkey,
  DROP COLUMN IF EXISTS org_id,
  DROP COLUMN IF EXISTS owner_user_id;

ALTER TABLE finance_transactions
  DROP CONSTRAINT IF EXISTS finance_transactions_updated_by_user_id_fkey,
  DROP CONSTRAINT IF EXISTS finance_transactions_org_id_fkey,
  DROP COLUMN IF EXISTS org_id,
  DROP COLUMN IF EXISTS updated_by_user_id;

ALTER TABLE finance_incoming_log
  DROP CONSTRAINT IF EXISTS finance_incoming_log_org_id_fkey,
  DROP COLUMN IF EXISTS org_id;

-- ===== 2. guild_id → org_id (in-place type convert, คงตำแหน่ง) ===============
--  guild_id มี DEFAULT '' (Phase 0) → ต้อง DROP DEFAULT ก่อนแปลงเป็น int
--  global category guild_id='' → lookup ไม่เจอ → org_id NULL (ถูกต้อง, ใช้ is_global)
ALTER TABLE finance_accounts     ALTER COLUMN guild_id DROP DEFAULT;
ALTER TABLE finance_accounts     ALTER COLUMN guild_id TYPE integer
  USING pg_temp._g2o(guild_id);
ALTER TABLE finance_accounts     RENAME COLUMN guild_id TO org_id;

ALTER TABLE finance_categories   ALTER COLUMN guild_id DROP DEFAULT;
ALTER TABLE finance_categories   ALTER COLUMN guild_id TYPE integer
  USING pg_temp._g2o(guild_id);
ALTER TABLE finance_categories   RENAME COLUMN guild_id TO org_id;

ALTER TABLE finance_transactions ALTER COLUMN guild_id DROP DEFAULT;
ALTER TABLE finance_transactions ALTER COLUMN guild_id TYPE integer
  USING pg_temp._g2o(guild_id);
ALTER TABLE finance_transactions RENAME COLUMN guild_id TO org_id;

ALTER TABLE finance_incoming_log ALTER COLUMN guild_id DROP DEFAULT;
ALTER TABLE finance_incoming_log ALTER COLUMN guild_id TYPE integer
  USING pg_temp._g2o(guild_id);
ALTER TABLE finance_incoming_log RENAME COLUMN guild_id TO org_id;

-- ===== 3. owner_id / updated_by : VARCHAR discord → INT users.id (in-place) ===
--  owner_id = discord snowflake ตรงๆ → users.discord_id
--  sentinel ('statement_import'/'system') ไม่ match → NULL (ถูกต้อง ไม่ใช่คนแก้)
ALTER TABLE finance_accounts     ALTER COLUMN owner_id   DROP DEFAULT;
ALTER TABLE finance_accounts     ALTER COLUMN owner_id   TYPE integer
  USING pg_temp._d2u(owner_id);
ALTER TABLE finance_accounts     ALTER COLUMN updated_by DROP DEFAULT;
ALTER TABLE finance_accounts     ALTER COLUMN updated_by TYPE integer
  USING pg_temp._d2u(updated_by);

ALTER TABLE finance_categories   ALTER COLUMN owner_id   DROP DEFAULT;
ALTER TABLE finance_categories   ALTER COLUMN owner_id   TYPE integer
  USING pg_temp._d2u(owner_id);

ALTER TABLE finance_transactions ALTER COLUMN updated_by DROP DEFAULT;
ALTER TABLE finance_transactions ALTER COLUMN updated_by TYPE integer
  USING pg_temp._d2u(updated_by);

-- ===== 4. FK ใหม่ → canonical users(id) + orgs(id) ==========================
ALTER TABLE finance_accounts
  ADD CONSTRAINT finance_accounts_org_id_fkey     FOREIGN KEY (org_id)     REFERENCES orgs(id),
  ADD CONSTRAINT finance_accounts_owner_id_fkey   FOREIGN KEY (owner_id)   REFERENCES users(id),
  ADD CONSTRAINT finance_accounts_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE finance_categories
  ADD CONSTRAINT finance_categories_org_id_fkey   FOREIGN KEY (org_id)     REFERENCES orgs(id),
  ADD CONSTRAINT finance_categories_owner_id_fkey FOREIGN KEY (owner_id)   REFERENCES users(id);
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_org_id_fkey     FOREIGN KEY (org_id)     REFERENCES orgs(id),
  ADD CONSTRAINT finance_transactions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id);
ALTER TABLE finance_incoming_log
  ADD CONSTRAINT finance_incoming_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES orgs(id);

-- ===== 5. VERIFY (ดูก่อน COMMIT) ============================================
\echo '--- column types (ควรเป็น integer หมด) ---'
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name LIKE 'finance_%'
  AND column_name IN ('org_id','owner_id','updated_by')
ORDER BY table_name, column_name;

\echo '--- accounts: rows / org_id null / owner_id null ---'
SELECT count(*) rows, count(*) FILTER (WHERE org_id IS NULL) org_null,
       count(*) FILTER (WHERE owner_id IS NULL) owner_null FROM finance_accounts;
\echo '--- transactions: rows / org_id null / updated_by non-null (ควร=229) ---'
SELECT count(*) rows, count(*) FILTER (WHERE org_id IS NULL) org_null,
       count(updated_by) upd_nonnull FROM finance_transactions;
\echo '--- categories: rows / org_id null (=global) / owner_id null ---'
SELECT count(*) rows, count(*) FILTER (WHERE org_id IS NULL) org_null,
       count(*) FILTER (WHERE owner_id IS NULL) owner_null FROM finance_categories;
\echo '--- org distribution ---'
SELECT org_id, count(*) FROM finance_transactions GROUP BY org_id;

COMMIT;  -- dry-run verified 2026-07-17 (ROLLBACK) → applied localhost org-core
