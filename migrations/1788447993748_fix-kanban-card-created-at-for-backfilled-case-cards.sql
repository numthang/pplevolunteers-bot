-- Up Migration
-- ต่อจาก scripts/migration/migration.sql รอบ 3 (โพสต์ — รันบน prod แล้ว) รอบนี้ฝั่งเคส:
-- kanban_cards.created_at ของการ์ดที่ mirror จาก cases เป็น "วัน mirror" ไม่ใช่วันเปิดเคสจริง
-- (cases.created_at เองถูกอยู่แล้ว, เดินสูตรเดียวกับ backfillCaseCreatedAt.js) ไม่มีผลข้างเคียง
UPDATE kanban_cards c
   SET created_at = cs.created_at
  FROM kanban_card_links l
  JOIN cases cs ON cs.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'case'
   AND c.created_at <> cs.created_at;

-- Down Migration
-- ย้อนไม่ได้ (ไม่เก็บค่าเดิม) — ค่าเดิมคือ "วัน mirror" ซึ่งผิดอยู่แล้ว ไม่มีเหตุผลจะย้อนกลับไปหา