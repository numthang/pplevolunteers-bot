-- Up Migration
-- ให้คนแก้ "วันจัดงาน" เองได้ในหน้าคัด + แยก "ตั้งใจให้ว่าง" ออกจาก "ยังไม่แตะ"
--
-- ⚠️ ปัญหาที่คอลัมน์ 2 ตัวล่างแก้: pick_* ใช้ NULL แทน "ยังไม่แตะ → ใช้ค่าที่ AI เดา"
--    ช่องที่เป็นค่าเดี่ยว (วันจัดงาน / ผู้รับผิดชอบ) จึงไม่มีทางบอกว่า "คนดูแล้วและตั้งใจให้ว่าง"
--    → คนล้างค่าทิ้ง แล้วค่าที่ AI เดาเด้งกลับมาเงียบๆ = แก้ไม่ได้จริง
--    (ช่องที่เป็น array ไม่มีปัญหานี้ เพราะ [] ต่างจาก NULL อยู่แล้ว)
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS pick_event_date  DATE;
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS pick_no_event_date BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS pick_no_assignee   BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN kanban_forum_import.pick_event_date IS
  'วันจัดงานที่คนเคาะเอง — ชนะ ai_event_date · NULL = ยังไม่แตะ (ไม่ใช่ "ไม่มีวัน" — ดู pick_no_event_date)';
COMMENT ON COLUMN kanban_forum_import.pick_no_event_date IS
  'true = คนตั้งใจให้การ์ดใบนี้ไม่มีวันจัดงาน (ห้ามถอยไปใช้ค่าที่ AI เดา)';
COMMENT ON COLUMN kanban_forum_import.pick_no_assignee IS
  'true = คนตั้งใจให้การ์ดใบนี้ไม่มีผู้รับผิดชอบ (ห้ามถอยไปใช้ค่าที่ AI เดา)';

-- Down Migration
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS pick_event_date;
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS pick_no_event_date;
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS pick_no_assignee;
