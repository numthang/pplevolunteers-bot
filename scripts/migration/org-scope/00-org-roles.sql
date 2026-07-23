-- ============================================================================
-- 00 — org_roles: คลังคำของ permission (ภาษากลาง เว็บ+bot อ่านร่วม)
--
-- ⚠️ ต้องรัน **ก่อน 11** — `org_role_defs.permission` เป็น FK → `org_roles(key)`
--    ถ้าไม่มีตารางนี้ ไฟล์ 11 พังที่ `relation "org_roles" does not exist`
--
-- เดิมอยู่ใน ../migration.sql (2026-07-16) และ **01-identity-refactor.sql ระบุไว้เองว่า
-- org_roles อยู่นอกขอบเขตของมัน** (หัวไฟล์: "OUT OF SCOPE (ไฟล์แยก): org_roles (RBAC)")
-- → prod ที่ไม่เคยรัน migration.sql จึงไม่มีตารางนี้ · ยกมาไว้ในลำดับ 2026-07-23
--
-- idempotent: CREATE IF NOT EXISTS + ON CONFLICT DO UPDATE + guard ของ FK
-- ============================================================================

-- 2026-07-16: org_roles — canonical role/permission vocabulary (ภาษากลาง เว็บ+bot อ่านร่วม)
-- = ยก PERMISSIONS array (web/lib/permissions.js) มาเป็นตาราง · behavior (CAPABILITIES matrix) ยังอยู่ในโค้ด
-- dc_guild_roles.permission → FK org_roles.key (กัน map ไป permission ที่ไม่มีจริง)
CREATE TABLE IF NOT EXISTS org_roles (
  key         VARCHAR(40)  PRIMARY KEY,
  label_th    VARCHAR(100) NOT NULL,
  label_en    VARCHAR(100),
  category    VARCHAR(30),                 -- 'core' | 'leadership' | 'geography' | 'feature'
  description TEXT,
  sort_order  INT          NOT NULL DEFAULT 100,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE
);

INSERT INTO org_roles (key, label_th, label_en, category, description, sort_order) VALUES
  ('admin',                'ผู้ดูแลระบบ',              'Admin',                'core',       'god-mode/technical — เห็นทุกอย่างรวม private ของคนอื่น', 10),
  ('secretary_general',    'เลขาธิการ',               'Secretary-General',    'leadership', 'หัวหน้าองค์กรสูงสุด คุมงานได้หมด แต่ดู private คนอื่นไม่ได้', 20),
  ('regional_coordinator', 'ผู้ประสานงานภาค',          'Regional Coordinator', 'geography',  'ผู้ประสานงานภาค / รองเลขาธิการ', 30),
  ('province_coordinator', 'ผู้ประสานงานจังหวัด',       'Province Coordinator', 'geography',  'ผู้ประสานงานจังหวัด', 40),
  ('district_coordinator', 'กรรมการจังหวัด',           'District Coordinator', 'geography',  'กรรมการจังหวัด (ตทอ.) — ปัจจุบันสิทธิ์เท่า province_coordinator', 50),
  ('treasurer',            'เหรัญญิก',                'Treasurer',            'feature',    'เหรัญญิก — จัดการการเงิน', 60),
  ('editor',               'บรรณาธิการ',              'Editor',               'feature',    'ทีมบรรณาธิการ / จัดการตะกร้าสื่อ', 70),
  ('caseworker',           'เจ้าหน้าที่เรื่องร้องเรียน',    'Caseworker',           'feature',    'ทีมเรื่องร้องเรียน — บริหารเคสใน scope จังหวัดตัวเอง', 80),
  ('moderator',            'ผู้ควบคุม',               'Moderator',            'core',       'action-only — ลบ log ได้ แต่ดูข้อมูลไม่ได้', 90),
  ('viewer',               'ผู้อ่าน',                 'Viewer',               'core',       'อ่านอย่างเดียว (read-only observer)', 100),
  ('member',               'สมาชิก',                 'Member',               'core',       'อยู่องค์กรแต่ไม่มี role พิเศษ', 110)
ON CONFLICT (key) DO UPDATE SET
  label_th=EXCLUDED.label_th, label_en=EXCLUDED.label_en, category=EXCLUDED.category,
  description=EXCLUDED.description, sort_order=EXCLUDED.sort_order;

-- normalize '' → NULL ก่อนผูก FK (กัน '' ที่ไม่ใช่ key จริง)
UPDATE dc_guild_roles SET permission = NULL WHERE permission = '';

-- FK: dc_guild_roles.permission ต้องเป็น key ที่มีจริง (NULL ได้ = role ไม่มี permission) · idempotent guard
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_dc_guild_roles_permission') THEN
    ALTER TABLE dc_guild_roles ADD CONSTRAINT fk_dc_guild_roles_permission
      FOREIGN KEY (permission) REFERENCES org_roles(key);
  END IF;
END $$;
