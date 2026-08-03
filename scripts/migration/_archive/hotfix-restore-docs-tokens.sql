-- HOTFIX 2026-07-06: คืน pdf_token/export_token ให้โค้ดเก่า (ยัง deploy อยู่) ใช้งานต่อได้
-- สาเหตุ: migration ยุบ token (2026-07-05 block) DROP column เก่าไปแล้ว แต่โค้ดใหม่ที่ query
-- project_token ยังไม่ได้ deploy ขึ้น prod — โค้ดเก่าเลย query column ที่หายไปไม่เจอ
-- แก้โดย derive ค่ากลับจาก project_token (ตัวเดียวกัน 2 คอลัมน์ก็ไม่เป็นไร ใช้งานได้ปกติ)
ALTER TABLE docs_projects
  ADD COLUMN IF NOT EXISTS export_token         VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS export_token_expires TIMESTAMP  NULL,
  ADD COLUMN IF NOT EXISTS pdf_token            VARCHAR(8) NULL,
  ADD COLUMN IF NOT EXISTS pdf_token_expires    TIMESTAMP  NULL;

UPDATE docs_projects
   SET export_token         = project_token,
       export_token_expires = project_token_expires,
       pdf_token             = project_token,
       pdf_token_expires     = project_token_expires
 WHERE project_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_export_token
  ON docs_projects (export_token) WHERE export_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_docs_projects_pdf_token
  ON docs_projects (pdf_token) WHERE pdf_token IS NOT NULL;
