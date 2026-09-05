-- Up Migration
-- เลือกสถานะการ์ดตอนคัดได้ (user ทัก 2026-09-05: "หลายงานยังไม่เสร็จ อยากให้มีติ๊กสถานะด้วย")
--
-- เดิมยัด status_type = 'done' ให้ทุกใบตายตัว เพราะตั้งต้นจากสมมติฐานว่ากำลัง backfill ของเก่าที่จบแล้ว
-- พอเอาไปใช้จริงเจอกระทู้งานที่ยังทำอยู่ปนมาด้วย — การ์ดเลยไปกอง "เสร็จ" ทั้งที่ยังไม่เสร็จ
--
-- NULL = ยังไม่แตะ → ใช้ค่าตั้งต้น 'done' เหมือนเดิม (แถวเก่าที่คัดไว้แล้วพฤติกรรมไม่เปลี่ยน)
-- ⚠️ สถานะที่ยังไม่ปิดงาน (ไม่ใช่ done/cancelled) ตอนนำเข้าต้อง **ไม่เซ็ต completed_at**
--    ไม่งั้นการ์ด "กำลังทำ" จะมีวันเสร็จติดมาด้วย = ข้อมูลขัดกันเองตั้งแต่วันแรก
ALTER TABLE kanban_forum_import ADD COLUMN IF NOT EXISTS pick_status VARCHAR(12);

ALTER TABLE kanban_forum_import DROP CONSTRAINT IF EXISTS kanban_forum_import_pick_status_chk;
ALTER TABLE kanban_forum_import ADD CONSTRAINT kanban_forum_import_pick_status_chk
  CHECK (pick_status IS NULL OR pick_status IN ('backlog','doing','review','ready','done','cancelled'));

COMMENT ON COLUMN kanban_forum_import.pick_status IS
  'สถานะที่คนเลือกให้การ์ดตอนนำเข้า — NULL = ใช้ค่าตั้งต้น done';

-- Down Migration
ALTER TABLE kanban_forum_import DROP CONSTRAINT IF EXISTS kanban_forum_import_pick_status_chk;
ALTER TABLE kanban_forum_import DROP COLUMN IF EXISTS pick_status;
