-- Up Migration
-- การ์ดเคสที่ resolved/closed/rejected แล้ว (โชว์กอง "เสร็จ" จริงบนจอ เพราะ status_type คำนวณสด
-- จากต้นทางเสมอ — ดู LIVE_STATUS_SQL ใน db/kanban/statusSql.js) แต่ completed_at เป็นคอลัมน์ cache
-- ที่ไม่เคยมีใครเขียน (เขียนแค่ตอนลากการ์ดในหน้า kanban เอง หรือ unlinkCard) — บั๊กเดียวกับที่แก้ไป
-- forward แล้วที่ db/cases.js:updateStatus() (2026-09-03) รอบนี้ backfill ของเก่าที่ปิดไปแล้วให้ครบ
--
-- ⚠️ ไม่มี resolved_at/closed_at จริงเก็บไว้ (เช็คแล้ว — cases มีแค่ created_at/updated_at และ
--    updated_at ไม่น่าเชื่อถือ ถูกแตะจากงานอื่นบ่อย) เลยใช้ cases.created_at เป็น proxy เหมือนที่ทำกับ
--    posts ก่อนหน้า (ไม่ตรงวันปิดจริง แต่ดีกว่า NULL ที่ทำให้เรียงลำดับกอง "เสร็จ" มั่วเท่ากันหมด)
UPDATE kanban_cards c
   SET completed_at = cs.created_at
  FROM kanban_card_links l
  JOIN cases cs ON cs.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'case'
   AND cs.status IN ('resolved', 'closed', 'rejected')
   AND c.completed_at IS NULL;

-- Down Migration
-- ย้อนไม่ได้ (ไม่เก็บค่าเดิม) — ค่าเดิมคือ NULL (ไม่รู้ว่าเสร็จเมื่อไหร่) แย่กว่าค่าประมาณนี้อยู่แล้ว