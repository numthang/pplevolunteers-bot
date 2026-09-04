-- Up Migration
-- วันที่ "งานจัดจริง" ที่ AI ดึงจากเนื้อกระทู้ (user เคาะ 2026-09-04)
--
-- ใช้เป็น **ทั้ง `due_at` และ `completed_at`** ของการ์ดตอนนำเข้า — วันจัดงานคือวันที่งานนั้นจบจริง
-- แม่นกว่า "วันตั้งกระทู้" (ตั้งกระทู้เตรียมงานล่วงหน้าเป็นเดือนเป็นเรื่องปกติ)
-- หา่ไม่เจอ → due_at ว่าง · completed_at ถอยไปใช้วันตั้งกระทู้ตามที่ตกลงไว้เดิม
--
-- ⚠️ ค่าที่ AI ตอบมาผ่านด่านช่วงเวลาก่อนเสมอ (วันตั้งกระทู้ −30 วัน ถึง +2 ปี) — กันปี พ.ศ.
--    ถูกอ่านเป็น ค.ศ. (68 → 2068) ซึ่งเป็นความผิดพลาดที่ "ดูเหมือนถูก" ที่สุดของงานนี้
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS ai_event_date DATE;

COMMENT ON COLUMN kanban_forum_import.ai_event_date IS
  'วันจัดงานที่ AI ดึงจากเนื้อกระทู้ (ผ่านด่านช่วงเวลาแล้ว) — ตอนนำเข้าใช้เป็น due_at + completed_at';

-- Down Migration
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS ai_event_date;
