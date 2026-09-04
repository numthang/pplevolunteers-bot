-- Up Migration
-- กำลังไล่ปิดเคสเก่าที่ backfill มาจากกระทู้ Discord (source='discord') ย้อนหลัง 3 ปีทีละใบผ่านหน้า
-- /cases — ทุกครั้งที่กด resolved/rejected, db/cases.js:updateStatus() (2026-09-03) จะเซ็ต
-- completed_at = now() ให้การ์ด kanban ที่ผูกเคสนั้น ซึ่งไม่ make sense สำหรับเคสเก่า (จะกลายเป็น
-- "ปิดวันนี้" ทั้งที่จริงเป็นเรื่องเก่าเป็นปี) — logic ของ updateStatus() ยังคงเดิม (ถูกแล้วสำหรับ
-- เคสจริงในอนาคตที่ใช้เวลาทำจริง) รอบนี้แค่แก้ค่าที่เพิ่งถูกตั้งผิดระหว่าง backfill
--
-- ใช้ cases.created_at เป็น proxy วันปิด (เหมือน migration ก่อนหน้า 1788454524874 ที่ backfill
-- ของเก่าที่ completed_at เป็น NULL ไปแล้ว) — ต่างกันตรงรอบนี้ต้อง overwrite ค่าที่ไม่ใช่ NULL ด้วย
-- เพราะถูก updateStatus() เขียนทับเป็น now() ไปแล้วระหว่างที่ user ทยอยปิดเคสเก่ามือ
--
-- ขอบเขต: จำกัดเฉพาะ source='discord' (นำเข้าจากกระทู้) กันไว้ไม่ให้กระทบเคสที่สร้างผ่านเว็บปกติ
-- ในอนาคต (ซึ่ง completed_at=now() ตอนปิดคือค่าที่ถูกต้องจริง ไม่ใช่ backfill)
UPDATE kanban_cards c
   SET completed_at = cs.created_at,
       updated_at = now()
  FROM kanban_card_links l
  JOIN cases cs ON cs.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'case'
   AND cs.source = 'discord'
   AND cs.status IN ('resolved', 'rejected')
   AND c.completed_at IS DISTINCT FROM cs.created_at;

-- Down Migration
-- ย้อนไม่ได้ (ไม่เก็บค่าเดิมก่อน overwrite) — เหมือน migration พี่น้อง 1788454524874