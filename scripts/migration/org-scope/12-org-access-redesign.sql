-- ═══════════════════════════════════════════════════════════════════════════
-- org-access-redesign.sql — ขั้น 2: ย้ายข้อมูลสิทธิ์/พื้นที่ของ PPLE เข้าโครงใหม่
-- แบบเต็ม: md/ORG_ACCESS_REDESIGN.md · DDL อยู่ใน migration.sql (2026-07-22)
--
-- ⚠️ ขั้นนี้ "เขียนอย่างเดียว ยังไม่มีใครอ่าน" — resolveAccess ยังอ่านของเดิม
--    ของเดิมวิ่งปกติ ย้อนได้ด้วยการ TRUNCATE 3 ตารางใหม่
--
-- idempotent: รันซ้ำได้ (ON CONFLICT DO NOTHING/UPDATE ทุกจุด)
--
-- ที่มาของข้อมูล — ทั้งหมดมาจาก dc_guild_roles ของ guild ที่อยู่ใน org นั้น:
--   พื้นที่  = scope_node ('province:X' / 'subregion:Y' / 'region:Z')
--   ต้นไม้  = parent_role_id (ยืนยันแล้วว่าครบ 3 ชั้น ไม่ใช้ geography.js ที่ hardcode)
--   ตำแหน่ง = role_name + permission
--   ใครถือ  = org_members.roles (comma string ของชื่อยศ)
--
-- ยืนยันก่อนเขียน (2026-07-22): ไม่มี role_name ซ้ำข้าม guild ที่ permission/scope ต่างกัน
-- → ยุบเป็น org level ด้วยชื่อได้ปลอดภัย
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. พื้นที่: สร้าง node ทั้งหมดก่อน (ยังไม่ผูกพ่อ) ────────────────────────
-- key = ส่วนหลัง ':' ของ scope_node · label = เดียวกัน (org แก้ทีหลังได้)
INSERT INTO org_scope_nodes (org_id, key, label, sort_order)
SELECT DISTINCT g.org_id,
       split_part(r.scope_node, ':', 2),
       split_part(r.scope_node, ':', 2),
       CASE split_part(r.scope_node, ':', 1)
         WHEN 'region' THEN 10 WHEN 'subregion' THEN 20 ELSE 30 END
  FROM dc_guild_roles r
  JOIN dc_guilds g ON g.guild_id = r.guild_id
 WHERE r.scope_node IS NOT NULL
ON CONFLICT (org_id, key) DO NOTHING;

-- ── 2. พื้นที่: ผูกพ่อ จาก parent_role_id ของ dc_guild_roles ────────────────
UPDATE org_scope_nodes child
   SET parent_id = parent.id
  FROM dc_guild_roles cr
  JOIN dc_guilds g       ON g.guild_id = cr.guild_id
  JOIN dc_guild_roles pr ON pr.guild_id = cr.guild_id AND pr.role_id = cr.parent_role_id
  JOIN org_scope_nodes parent ON parent.org_id = g.org_id
                             AND parent.key = split_part(pr.scope_node, ':', 2)
 WHERE cr.scope_node IS NOT NULL
   AND pr.scope_node IS NOT NULL
   AND child.org_id = g.org_id
   AND child.key    = split_part(cr.scope_node, ':', 2)
   AND child.parent_id IS DISTINCT FROM parent.id;

-- ── 3. ตำแหน่ง: 1 แถวต่อ (org, ชื่อยศ) — ยุบข้าม guild ──────────────────────
-- คงโมเดลเดิมที่แยก 2 ใบ: ใบตำแหน่ง (scope_node_id NULL) + ใบพื้นที่ (permission NULL)
INSERT INTO org_role_defs (org_id, name, permission, scope_node_id)
SELECT DISTINCT ON (g.org_id, r.role_name)
       g.org_id, r.role_name, r.permission, n.id
  FROM dc_guild_roles r
  JOIN dc_guilds g ON g.guild_id = r.guild_id
  LEFT JOIN org_scope_nodes n ON n.org_id = g.org_id
                             AND n.key = split_part(r.scope_node, ':', 2)
 WHERE r.permission IS NOT NULL OR r.scope_node IS NOT NULL
 ORDER BY g.org_id, r.role_name, r.permission NULLS LAST
ON CONFLICT (org_id, name) DO UPDATE
   SET permission    = EXCLUDED.permission,
       scope_node_id = EXCLUDED.scope_node_id;

-- ── 4. ตารางแปล: dc_guild_roles → org_role_defs ─────────────────────────────
-- ⚠️ ผูกเฉพาะแถวที่ "guild นั้นแมปไว้จริง" — ห้ามผูกด้วยชื่ออย่างเดียว
--    เหตุ (เจอตอน diff test 2026-07-22): guild 1115613658408566844 มียศชื่อ 'Admin'
--    ที่ **จงใจไม่แมป** ส่วน guild อาสาประชาชนมี 'Admin' ที่แมป permission='admin'
--    ถ้าผูกด้วยชื่อ → 6 คนที่เป็นแค่ Admin ของอีกเซิร์ฟเวอร์ได้ admin ทั้ง org
UPDATE dc_guild_roles r
   SET org_role_def_id = d.id
  FROM dc_guilds g
  JOIN org_role_defs d ON d.org_id = g.org_id
 WHERE g.guild_id = r.guild_id
   AND d.name = r.role_name
   AND (r.permission IS NOT NULL OR r.scope_node IS NOT NULL)   -- ← guard
   AND r.org_role_def_id IS DISTINCT FROM d.id;

-- ── 5. ใครถือตำแหน่งอะไร — จาก org_members.roles (source='discord') ─────────
-- เดินผ่าน dc_guild_roles ของ **guild ที่ user อยู่จริง** → ได้ความหมายต่อ guild เป๊ะ
-- (ไม่ join org_role_defs ด้วยชื่อ — ชื่อเดียวกันคนละ guild อาจแมปคนละอย่าง/ไม่แมปเลย)
-- ยศที่ไม่มี permission และไม่มี scope (ยศสังคม/ตกแต่ง) ไม่ถูกย้าย — ไม่มีผลต่อสิทธิ์
INSERT INTO org_member_roles (org_id, user_id, role_def_id, source, granted_at)
SELECT DISTINCT om.org_id, om.user_id, r.org_role_def_id, 'discord', COALESCE(om.roles_assigned_at, NOW())
  FROM org_members om
  JOIN LATERAL unnest(string_to_array(COALESCE(om.roles, ''), ',')) AS rn(r2) ON TRUE
  JOIN dc_guild_roles r ON r.guild_id = om.guild_id AND r.role_name = trim(rn.r2)
 WHERE om.roles IS NOT NULL AND trim(rn.r2) <> ''
   AND r.org_role_def_id IS NOT NULL
ON CONFLICT (org_id, user_id, role_def_id, source) DO NOTHING;

-- ── 6. web_roles เดิม → source='web' ────────────────────────────────────────
-- web_roles เก็บ "permission key" ไม่ใช่ชื่อยศ → หา role_def ที่ permission ตรงและไม่ผูกพื้นที่
INSERT INTO org_member_roles (org_id, user_id, role_def_id, source, granted_at)
SELECT DISTINCT om.org_id, om.user_id, d.id, 'web', COALESCE(om.roles_assigned_at, NOW())
  FROM org_members om
  JOIN LATERAL unnest(string_to_array(COALESCE(om.web_roles, ''), ',')) AS wk(k) ON TRUE
  JOIN org_role_defs d ON d.org_id = om.org_id
                      AND d.permission = trim(wk.k)
                      AND d.scope_node_id IS NULL
 WHERE om.web_roles IS NOT NULL AND trim(wk.k) <> ''
ON CONFLICT (org_id, user_id, role_def_id, source) DO NOTHING;

COMMIT;
