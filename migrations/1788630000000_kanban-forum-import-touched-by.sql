-- Up Migration
-- หลายมือช่วยกันคัด — ต้องรู้ว่า "ใบไหนมีคนตรวจ/แก้แล้ว" โดยไม่ต้องให้ใครกดปุ่มเพิ่ม
-- (user เคาะ 2026-09-05: ตรวจจับอัตโนมัติจากการแก้ ไม่เอาปุ่ม "ตรวจแล้ว" แยก)
--
-- "แก้แล้ว" = มี pick_* ตัวใดตัวหนึ่งไม่ว่าง — ค่านั้นบอกได้อยู่แล้วว่ามีคนแตะ แต่บอกไม่ได้ว่า **ใคร**
-- 2 คอลัมน์นี้จึงเก็บแค่ "คนล่าสุดที่แตะ + เมื่อไหร่" ไว้โชว์ป้ายบนใบ
-- ⚠️ ไม่ใช่ audit log — ทับกันได้ ใครแตะทีหลังชนะ · ถ้าต้องการประวัติเต็มค่อยทำตาราง log แยก
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS touched_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS touched_at TIMESTAMPTZ;

COMMENT ON COLUMN kanban_forum_import.touched_by IS
  'คนล่าสุดที่แก้ค่า pick_* / กดไม่เอา-เอากลับมา ในหน้าคัด (ไม่ใช่ audit log — ทับกันได้)';
COMMENT ON COLUMN kanban_forum_import.touched_at IS
  'เวลาที่มีคนแตะใบนี้ล่าสุด — ใช้โชว์ป้าย "แก้แล้วโดย …" ในหน้าคัด';

-- แถวที่คนแก้ไว้ก่อนมีคอลัมน์นี้ ยังต้องขึ้นป้าย "แก้แล้ว" (แค่ไม่รู้ว่าใคร)
UPDATE kanban_forum_import
   SET touched_at = updated_at
 WHERE touched_at IS NULL
   AND (pick_title IS NOT NULL OR pick_detail IS NOT NULL OR pick_workstreams IS NOT NULL
     OR pick_areas IS NOT NULL OR pick_assignees IS NOT NULL OR pick_status IS NOT NULL
     OR pick_event_date IS NOT NULL OR pick_no_event_date);

-- Down Migration
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS touched_by;
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS touched_at;
