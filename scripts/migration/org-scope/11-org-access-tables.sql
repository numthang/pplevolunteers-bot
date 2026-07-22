-- ============================================================================
-- 11 — ตาราง/คอลัมน์ของ org ที่เดิมอยู่ใน migration.sql
--
-- ยกมาจาก `../migration.sql` (ท้ายไฟล์) เพราะเป็นชุดเดียวกับ cutover นี้ และไฟล์ 12
-- ต้องการ 3 ตารางในบล็อกแรกอยู่ก่อน — เดิมต้องรัน migration.sql ทั้ง 94KB คั่นกลาง
-- ลำดับ ซึ่งอ่านไม่ออกว่าตรงไหนเกี่ยวกับ org
--
-- idempotent ทั้งไฟล์ (IF NOT EXISTS / ON CONFLICT) — รันซ้ำได้
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-22: ORG ACCESS REDESIGN ขั้น 1 — ปลดสิทธิ์/พื้นที่ออกจาก Discord
-- แบบเต็ม: md/ORG_ACCESS_REDESIGN.md
--
-- เป้า: 4 แอพ (finance/calling/docs/cases) ใช้งานได้โดยไม่ต้องมี Discord
-- แหล่งความจริงเดียว = org_member_roles · roles/web_roles เลิกใช้ตัดสินสิทธิ์
-- ขั้นนี้ "สร้างอย่างเดียว ยังไม่มีใครอ่าน" — ของเดิมวิ่งปกติ ไม่กระทบอะไร
-- ═══════════════════════════════════════════════════════════════════════════

-- พื้นที่ของ org — ต้นไม้ทั่วไป ซ้อนกี่ชั้นก็ได้ org ตั้งชื่อเอง (แทน hardcode ใน web/lib/geography.js)
-- PPLE ย้ายเข้าเป็น 3 ชั้น: ภาคใหญ่ → ภาคย่อย → จังหวัด · org อื่นสร้างเองกี่ชั้นก็ได้
CREATE TABLE IF NOT EXISTS org_scope_nodes (
  id         SERIAL PRIMARY KEY,
  org_id     INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  parent_id  INT REFERENCES org_scope_nodes(id) ON DELETE CASCADE,
  key        VARCHAR(80)  NOT NULL,          -- slug คงที่ ใช้อ้างใน grant (เช่น 'ราชบุรี')
  label      VARCHAR(120) NOT NULL,          -- ชื่อที่คนอ่าน
  sort_order INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_scope_nodes_key UNIQUE (org_id, key),
  CONSTRAINT ck_org_scope_nodes_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_org_scope_nodes_org    ON org_scope_nodes(org_id);
CREATE INDEX IF NOT EXISTS idx_org_scope_nodes_parent ON org_scope_nodes(parent_id);

-- ตำแหน่งของ org (แทน dc_guild_roles ที่ผูก guild) — permission มาจากคลังเดิม org_roles
-- คงโมเดลเดิมของ PPLE ที่แยก 2 ใบ: ใบตำแหน่ง (scope_node_id NULL) + ใบพื้นที่ (permission NULL)
CREATE TABLE IF NOT EXISTS org_role_defs (
  id            SERIAL PRIMARY KEY,
  org_id        INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          VARCHAR(100) NOT NULL,                      -- 'ผู้ประสานงานจังหวัด' / 'ทีมราชบุรี'
  permission    VARCHAR(40)  REFERENCES org_roles(key),     -- NULL = ใบนี้ให้แต่พื้นที่
  scope_node_id INT          REFERENCES org_scope_nodes(id) ON DELETE SET NULL,  -- NULL = ใบนี้ให้แต่ตำแหน่ง
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_org_role_defs_name UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_org_role_defs_org ON org_role_defs(org_id);

-- ใครถือตำแหน่งอะไร — **แหล่งความจริงเดียวของสิทธิ์** (แทน org_members.roles + web_roles)
-- source: 'discord' = บอทซิงค์เข้ามา · 'web' = ตั้งผ่านเว็บ
--   → ถอดยศ Discord ลบเฉพาะแถว source='discord' ของที่ตั้งในเว็บไม่หาย
CREATE TABLE IF NOT EXISTS org_member_roles (
  org_id      INT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_def_id INT NOT NULL REFERENCES org_role_defs(id) ON DELETE CASCADE,
  source      VARCHAR(20) NOT NULL DEFAULT 'web',
  granted_by  INT REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (org_id, user_id, role_def_id, source),
  CONSTRAINT ck_org_member_roles_source CHECK (source IN ('web','discord'))
);
CREATE INDEX IF NOT EXISTS idx_org_member_roles_lookup ON org_member_roles(org_id, user_id);

-- แปลยศ Discord → ตำแหน่งของ org (dc_guild_roles ลดบทบาทเหลือแค่ตารางแปล)
ALTER TABLE dc_guild_roles ADD COLUMN IF NOT EXISTS org_role_def_id INT REFERENCES org_role_defs(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-22 — รวมสวิตช์เปิด/ปิดฟีเจอร์มาไว้ที่ org ที่เดียว
--
-- เดิมมี 2 ระบบซ้อนกันแล้ว "guild ชนะ": org ที่มี guild → อ่าน dc_guild_config
-- (/bot/features) · org ที่ไม่มี guild → อ่าน org_config (/org/settings/features)
-- → หน้า /org/settings/features กดยังไงก็ไม่มีผลกับ PPLE
--
-- ย้ายค่าขึ้น org = union ของทุก guild ใน org (คนที่เคยเปิดที่ไหนสักที่ = ยังเปิด)
-- ai_mention ไม่ย้าย — ผูก Discord จริง (บอทอ่าน dc_guild_config เอง index.js:453)
--
-- ⚠️ เขียนแถวให้ทุก org ที่มี guild แม้ union จะว่าง — default ของสองที่ไม่เหมือนกัน
--    (guild ไม่มี config = ปิดหมด · org ไม่มี config = เปิดหมด) ถ้าไม่เขียนแถว
--    org ที่เคยปิดหมดจะกลายเป็นเปิดหมดเงียบๆ
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO org_config (org_id, key, value)
SELECT g.org_id, 'enabled_features',
       COALESCE(
         (SELECT jsonb_agg(f ORDER BY f)
            FROM (
              SELECT DISTINCT jsonb_array_elements_text(c.value::jsonb) AS f
                FROM dc_guilds g2
                JOIN dc_guild_config c ON c.guild_id = g2.guild_id AND c.key = 'enabled_features'
               WHERE g2.org_id = g.org_id
            ) u
           WHERE f IN ('finance','calling','docs','cases')
         )::text,
         '[]'
       )
  FROM dc_guilds g
 WHERE g.org_id IS NOT NULL
 GROUP BY g.org_id
ON CONFLICT (org_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-07-23 — ที่อยู่ในโปรไฟล์ (org-native) — ปูทางให้ org ที่ไม่มี Discord
--
-- ปัญหา: "พื้นที่ที่ตัวเองอยู่" มาจากยศ Discord ทางเดียว (handlers/provinceSelect.js
-- กดเลือกจังหวัด → ติดยศ → org_scope_nodes) org ที่ไม่มี Discord จึงมี scopeGrants
-- ว่างเปล่า → getUserScope() คืน [] → หน้า calling ตอบ noAccess ตั้งแต่ต้น ใช้ไม่ได้เลย
--
-- ⚠️ พื้นที่ = "เจ้าตัวบอกเอง" ไม่ใช่สิทธิ์ — ตรงกับ Discord ที่ใครกดก็ติดได้
--    การเห็นเบอร์ยังต้องมียศแต่งตั้ง (seeContacts = กรรมการจังหวัดขึ้นไป) เหมือนเดิม
--
-- amphoe / primary_province มีอยู่แล้ว — เพิ่มเฉพาะส่วนที่ขาด
-- primary_province คงเป็นช่อง "จังหวัด" ของที่อยู่ (แหล่งความจริงเดียว ไม่สร้างซ้ำ)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS house_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS moo      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS soi      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS road     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS tambon   VARCHAR(100),
  ADD COLUMN IF NOT EXISTS zipcode  VARCHAR(10);
