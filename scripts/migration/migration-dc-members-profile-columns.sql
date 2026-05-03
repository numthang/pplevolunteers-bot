-- เพิ่ม profile columns ใน dc_members ที่เคยเพิ่มตรงๆ บน production โดยไม่มี migration
ALTER TABLE dc_members
  ADD COLUMN IF NOT EXISTS nickname    VARCHAR(100) NULL AFTER display_name,
  ADD COLUMN IF NOT EXISTS firstname   VARCHAR(100) NULL AFTER nickname,
  ADD COLUMN IF NOT EXISTS lastname    VARCHAR(100) NULL AFTER firstname,
  ADD COLUMN IF NOT EXISTS specialty   VARCHAR(255) NULL AFTER lastname,
  ADD COLUMN IF NOT EXISTS amphoe      VARCHAR(100) NULL AFTER specialty,
  ADD COLUMN IF NOT EXISTS phone       VARCHAR(20)  NULL AFTER amphoe,
  ADD COLUMN IF NOT EXISTS line_id     VARCHAR(100) NULL AFTER phone,
  ADD COLUMN IF NOT EXISTS google_id   VARCHAR(255) NULL AFTER line_id,
  ADD COLUMN IF NOT EXISTS referred_by VARCHAR(100) NULL AFTER google_id;
