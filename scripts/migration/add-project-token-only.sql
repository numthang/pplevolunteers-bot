-- 2026-07-06: เพิ่ม project_token อย่างเดียว — ไม่ DROP column เก่า
-- ใช้ตอนอยากให้ DB มี project_token พร้อมก่อน deploy โค้ดใหม่ (โค้ดเก่ายังใช้ pdf_token/export_token ได้ต่อ)
-- DROP column เก่าค่อยรันทีหลัง "หลัง" deploy โค้ดใหม่ยืนยันว่าทำงานถูกแล้วเท่านั้น (ดู migration.sql บล็อก 2026-07-05)
ALTER TABLE docs_projects
  ADD COLUMN IF NOT EXISTS project_token         VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS project_token_expires TIMESTAMP  NULL;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'docs_projects' AND column_name = 'export_token') THEN
    UPDATE docs_projects
       SET project_token = export_token, project_token_expires = export_token_expires
     WHERE project_token IS NULL AND export_token IS NOT NULL;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_project_token
  ON docs_projects (project_token) WHERE project_token IS NOT NULL;
