-- Up Migration
-- การ์ดโพสต์ที่ **ไม่ใช่** กลุ่ม backfill กระทู้ดิสฯ (created_via <> 'backfill' — เขียนโพสต์ปกติผ่านเว็บ/AI
-- หรือกวาดจากช่องดิสฯ แบบ live) แต่เผยแพร่ขึ้นโซเชียลไปแล้วจริง (post_social_history มีใบ posted_at)
-- ก็ไม่เคยมี completed_at เหมือนกัน — mirrorEntityCard() ตอน sync สถานะไม่เคยเขียนคอลัมน์นี้
-- (บั๊กเดียวกับที่แก้ไปแล้วรอบ backfill 953 ใบ + การ์ดเคส เมื่อ 2026-09-03 แค่คนละกลุ่ม)
--
-- ⚠️ ใช้ post_episodes.created_at เป็นค่า completed_at (ไม่ใช่ kanban_cards.created_at ของการ์ดเอง)
-- เพราะ 2 คอลัมน์นี้ไม่ตรงกันจริง แม้เป็นโพสต์กลุ่มไม่ backfill ก็ตาม (เช็คบน dev พบ 47 ใบเหลื่อมกัน
-- — การ์ดถูกสร้าง/mirror ทีหลังวันที่เขียนโพสต์จริง) ใช้ pe.created_at ตรงกับ pattern ทุก migration
-- ก่อนหน้านี้ที่ backfill completed_at (ใช้ created_at ของ "ต้นทาง" เสมอ ไม่ใช่ของการ์ด)
UPDATE kanban_cards c
   SET completed_at = pe.created_at
  FROM kanban_card_links l
  JOIN post_episodes pe ON pe.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'post'
   AND pe.created_via <> 'backfill'
   AND pe.archived_at IS NULL
   AND c.archived_at IS NULL
   AND c.completed_at IS NULL
   AND EXISTS (
     SELECT 1 FROM post_social_history h
      WHERE h.episode_id = pe.id AND h.posted_at IS NOT NULL
   );

-- Down Migration
-- ย้อนไม่ได้ (ไม่เก็บค่าเดิม) — ค่าเดิมคือ NULL (ไม่รู้ว่าเผยแพร่วันไหน) แย่กว่าค่าประมาณนี้อยู่แล้ว
