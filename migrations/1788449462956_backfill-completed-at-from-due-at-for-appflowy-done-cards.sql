-- Up Migration
-- การ์ด AppFlowy import (scripts/import/kanbanFromAppflowy.mjs) ที่สร้างมาเป็น status='done' ตรงๆ
-- ตั้งแต่ตอน import — createCard() ไม่มีช่องรับ completed_at ตอน insert เลยไม่เคยถูกตั้ง (NULL)
-- ต่างจากการ์ดที่ผ่าน setCardStatus() ปกติซึ่งตั้ง completed_at=now() ให้เสมอ
-- user เคาะ (2026-09-03 ต่อจากที่แก้ created_at ให้กลุ่มเดียวกัน): ไม่มีข้อมูลจริงว่าปิดงานวันไหน
-- ก็ใช้ due_at แทน — เฉพาะการ์ดที่ไม่ผูก case/post (import ตรงๆ) อยู่กอง "เสร็จ" completed_at ยังว่าง
-- และมี due_at ให้ใช้ (41/44 ใบ · อีก 3 ใบทั้ง due/completed ไม่มีข้อมูลอะไรเลย ข้ามไว้)
UPDATE kanban_cards c
   SET completed_at = c.due_at
 WHERE c.id NOT IN (SELECT card_id FROM kanban_card_links)
   AND c.status_type = 'done'
   AND c.completed_at IS NULL
   AND c.due_at IS NOT NULL;

-- Down Migration
-- ย้อนไม่ได้ (ไม่เก็บค่าเดิม) — ค่าเดิมคือ NULL (ไม่รู้ว่าเสร็จเมื่อไหร่) แย่กว่าค่าประมาณนี้อยู่แล้ว