-- Up Migration
-- ผู้รับผิดชอบใส่ได้หลายคน (user ทัก 2026-09-04) — kanban_card_assignees รองรับอยู่แล้ว
-- และกติกาของโมดูลคือ "หลายคนเท่ากันหมด ไม่มีเจ้าภาพ" (เฟส B 2026-09-03) ช่องนี้จึงไม่ควรเป็นคนเดียว
--
-- ⭐ เป็น array แล้วไม่ต้องมีธง pick_no_assignee อีก — [] (ตั้งใจไม่มีใคร) ต่างจาก NULL (ยังไม่แตะ)
--    อยู่แล้ว จึงทิ้งธงไปเลย ไม่เก็บกลไกซ้ำซ้อน 2 ทางให้สับสนภายหลัง (คอลัมน์เพิ่งสร้าง ยังไม่มีข้อมูล)
-- ⚠️ ai_assignee_user_id ยังเป็นคนเดียวตามเดิม — AI เดาคนเดียวพอ (ไม่ต้องรัน AI ใหม่ทั้ง 255 ใบ)
--    ตอนอ่านค่าใช้: pick_assignees ?? [ai_assignee_user_id]
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS pick_assignees JSONB;
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS pick_no_assignee;

COMMENT ON COLUMN kanban_forum_import.pick_assignees IS
  'ผู้รับผิดชอบที่คนเคาะเอง (array ของ users.id) — NULL = ยังไม่แตะ (ใช้ที่ AI เดา) · [] = ตั้งใจไม่มีใคร';

-- Down Migration
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS pick_assignees;
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS pick_no_assignee BOOLEAN NOT NULL DEFAULT false;
