-- Up Migration
-- การ์ดที่ import จาก scripts/import/kanbanFromAppflowy.mjs (backups/kanban/kanban_import.xlsx)
-- ไม่มีคอลัมน์ "วันสร้างจริง" ในไฟล์ต้นทาง — createCard() เลยปล่อยให้ created_at = เวลา import
-- (2026-08-19T18:59:40–42Z ทั้งชุด 50 ใบ) user เคาะ: ถ้าไม่มีข้อมูลจริงให้ใช้ due_at แทน
-- ระบุการ์ดกลุ่มนี้ด้วย 3 เงื่อนไข: ไม่ผูก case/post (import ตรงๆ ไม่ mirror) + created_at อยู่ในช่วง
-- batch import วินาทีเดียวกัน + มี due_at ให้ใช้แทนได้ (25 ใบที่ทั้ง due/start ว่างเลย ไม่มีอะไรให้แทน ข้ามไป)
UPDATE kanban_cards c
   SET created_at = c.due_at
 WHERE c.id NOT IN (SELECT card_id FROM kanban_card_links)
   AND c.due_at IS NOT NULL
   AND c.created_at >= '2026-08-19 18:59:40.332+00'
   AND c.created_at < '2026-08-19 18:59:42.778+00';

-- Down Migration
-- ย้อนไม่ได้ (ไม่เก็บค่าเดิม) — ค่าเดิมคือเวลา import ซึ่งผิดอยู่แล้ว ไม่มีเหตุผลจะย้อนกลับไปหา