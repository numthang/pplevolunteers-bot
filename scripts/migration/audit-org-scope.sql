-- ============================================================================
-- audit-org-scope.sql — audit_logs: guild-scope → org-scope
-- org-core branch · localhost only · 2026-07-21
--
-- ทำไมต้องทำ (ไม่ใช่แค่ความสวยงาม): finance/calling/docs เป็น org แล้ว แต่ audit
-- ยัง key ด้วย guild_id NOT NULL → **log หายเงียบ 2 จุด** เพราะ logAction เป็น
-- fire-and-forget (`.catch(() => {})`) กลืน error ทิ้ง:
--   1. calling/dial ส่ง { orgId } แต่ฟังก์ชันรับ guildId → undefined → ชน NOT NULL
--      → ไม่เคยมี log app='calling' สักแถวตั้งแต่ calling migrate เสร็จ
--   2. org/appoint ส่ง guild_id ของสมาชิก — คนล็อกอิน email มี guild_id NULL
--      → แต่งตั้งยศคนเว็บไม่ถูก audit เลย
--
-- หลักการ (ตาม finance/calling/docs-org-scope.sql):
--   scope  : guild_id (VARCHAR snowflake) → org_id (INT → orgs.id)  [in-place คงตำแหน่ง]
--   person : actor_id (VARCHAR discord)   → INT → users.id          [in-place คงชื่อ+ตำแหน่ง]
--   ⚠️ target_id คง VARCHAR — **polymorphic โดยตั้งใจ**: case ref ('70-69-2D8E') /
--      'u<id>' ของคนที่ถูกตั้งยศ / member_id ของ calling · ห้ามแปลงเป็น INT
--
-- data coverage verified 2026-07-21 (12 แถว): guild 1340903354037178410 → org 1
--   actor_id 1098111730015543386 → users.id 1 · map 100% ไม่มี NULL surprise
--
-- ⚠️ คู่กับงาน code: web/db/auditLog.js รับ orgId + call sites 10 จุด
-- ⚠️ prod (master) = guild-based ยังไม่แตะ · รันตอน cutover
-- dry-run: ลงท้าย ROLLBACK · ผ่าน verify แล้วเปลี่ยนเป็น COMMIT
-- ============================================================================

BEGIN;

-- ===== 0. helper lookup (USING ห้าม subquery แต่เรียก function ได้) ============
CREATE FUNCTION pg_temp._g2o(text) RETURNS integer AS
  $$ SELECT org_id FROM dc_guilds WHERE guild_id = $1 $$ LANGUAGE sql STABLE;
CREATE FUNCTION pg_temp._d2u(text) RETURNS integer AS
  $$ SELECT id FROM users WHERE discord_id = $1 $$ LANGUAGE sql STABLE;

-- ===== 1. pre-check: ต้อง map ได้ 100% ก่อนแปลง =============================
\echo '=== pre-check: แถวที่ map ไม่ได้ (ต้องเป็น 0 ทั้งคู่) ==='
SELECT count(*) FILTER (WHERE pg_temp._g2o(guild_id) IS NULL)              AS guild_map_fail,
       count(*) FILTER (WHERE actor_id IS NOT NULL
                          AND pg_temp._d2u(actor_id) IS NULL)             AS actor_map_fail
  FROM audit_logs;

-- ===== 2. guild_id → org_id (in-place type convert, คงตำแหน่งคอลัมน์) =========
ALTER TABLE audit_logs ALTER COLUMN guild_id TYPE integer USING pg_temp._g2o(guild_id);
ALTER TABLE audit_logs RENAME COLUMN guild_id TO org_id;

-- ===== 3. actor_id → users.id ================================================
ALTER TABLE audit_logs ALTER COLUMN actor_id TYPE integer USING pg_temp._d2u(actor_id);

-- ===== 4. FK + index (ชื่อ index เดิมมีคำว่า guild = ชื่อหลอก → rename ด้วย) ===
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_org_fkey   FOREIGN KEY (org_id)   REFERENCES orgs(id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_actor_fkey FOREIGN KEY (actor_id) REFERENCES users(id);

ALTER INDEX idx_audit_logs_guild RENAME TO idx_audit_logs_org;
-- idx_audit_logs_app ครอบ (guild_id, app, created_at) → คอลัมน์แรกกลายเป็น org_id แล้ว ชื่อยังใช้ได้

-- ===== 5. VERIFY =============================================================
\echo '=== ชนิดคอลัมน์หลังแปลง (org_id/actor_id ต้องเป็น integer) ==='
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='audit_logs'
 ORDER BY ordinal_position;

\echo '=== data ไม่หาย + ชี้ users/orgs ได้จริง ==='
SELECT count(*) AS rows_total,
       count(*) FILTER (WHERE org_id IS NULL)   AS org_null,
       count(DISTINCT org_id)                   AS distinct_orgs,
       count(DISTINCT actor_id)                 AS distinct_actors
  FROM audit_logs;

SELECT a.org_id, o.name AS org_name, a.app, a.action, a.actor_id, u.username AS actor, a.target_id
  FROM audit_logs a
  LEFT JOIN orgs  o ON o.id = a.org_id
  LEFT JOIN users u ON u.id = a.actor_id
 ORDER BY a.id;

COMMIT;
