-- Up Migration
-- ย้ายบล็อกท้าย scripts/migration/migration.sql ("รอบ 2" + "รอบ 3" ของ 2026-09-03) เข้ามาเป็น
-- migration จริง — prod ยังไม่เคยรัน 2 บล็อกนี้ (marker "production ทำถึงตรงนี้" อยู่ก่อนหน้า)
-- และรัน psql ผ่าน ssh ตรงๆ ไม่ได้เพราะติด guard เรื่องไฟล์ตั้งค่าลับ → ให้เดินทาง
-- `npm run migrate up` แทน ซึ่งเป็น convention ใหม่ของโปรเจกต์อยู่แล้ว
--
-- ⚠️ dev รันมือไปแล้ว — ทั้ง 2 บล็อกเป็น DROP ... IF EXISTS / ON CONFLICT DO NOTHING /
--    UPDATE ที่มีเงื่อนไขกันตัวเอง → รันซ้ำได้ ไม่มีผลข้างเคียง
-- ⚠️ ลำดับ: ไฟล์นี้รันหลัง migrations/17884479… ทั้ง 5 ตัว (timestamp ใหม่กว่า) ตรวจแล้วไม่ชนกัน
--    เพราะคนละชุดการ์ด (นี่คือการ์ด "โพสต์ backfill" ส่วนอีก 5 ตัวเป็นการ์ดเคส/AppFlowy/โพสต์เผยแพร่)
--
-- user เคาะ: "เอากฎเรื่องชื่อคนจะมีหรือไม่มีจะอยู่กองไหนออกให้หมด มันเรื่องของผม
--            ไปดู notion appflowy มันมีกฎหยุมหยิมพวกนี้ไหม ไม่มีหรอก"
--
-- กฎนี้เราคิดขึ้นเอง (Notion/AppFlowy/Trello/Linear ไม่มีเจ้าไหนผูก assignee กับ status)
-- และมันสร้างความเสียหายมาแล้ว 2 รอบ:
--   1. เจ้าภาพปลอม 176 ใบ — ระบบต้องยัดชื่อคนลงไปเพื่อให้การ์ดอยู่กองที่ถูก
--   2. การ์ดโพสต์เก่า 953 ใบที่อยู่กอง "เสร็จ" มาตั้งแต่ 2026-08-28 **ตกกลับไปกอง "รอทำ"**
--      ตอนบล็อกเฟส B ลบเจ้าภาพปลอมทิ้ง → clamp ยิง → `SET status_type='backlog', completed_at=NULL`
--      (บล็อกนั้นเขียนคอมเมนต์ไว้เองว่า "ลบได้ตรงๆ เดี๋ยว trigger จัดการให้" — ไม่รู้ว่า
--       กำลังลากงานที่ **เสร็จแล้ว** กลับไปกองรอทำ · prod โดนด้วย)
--
-- ⭐ นิยามใหม่ที่ใช้ต่อจากนี้ — 2 แกนแยกกัน ห้ามแปลกันไปมาอีก:
--      ผู้รับผิดชอบ = "ใครเป็นเจ้าของงานนี้" (0..n คน)
--      กอง          = "งานเดินไปถึงไหน" — **มนุษย์ลากเท่านั้น ระบบห้ามตัดสินแทน**
--      "รอทำ" = ยังไม่ลงมือ (มีคนรับได้) ⛔ ไม่ใช่ "ยังไม่มีคนรับ" อีกต่อไป
--    "ยังไม่มีคนรับ" ยังดูได้จาก**ตัวกรอง** ในแถบ "แสดง" — เป็นมุมมอง ไม่ใช่กฎ
--
-- แก้คู่กับ: web/db/kanban/cards.js · web/db/kanban/links.js · web/lib/kanbanAccess.js
--            web/components/kanban/KanbanHome.jsx · db/kanbanCards.js (ฝั่งบอท)
--            + เทส web/lib/__tests__/kanbanAccess.test.js + สโมค 4 ไฟล์
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1) ทิ้ง trigger ทั้งคู่ + ฟังก์ชันของมัน (ไม่มี CHECK เก่าค้างแล้ว — ตายไปพร้อม owner_user_id)
DROP TRIGGER IF EXISTS trg_kanban_cards_require_assignee ON kanban_cards;
DROP TRIGGER IF EXISTS trg_kanban_assignees_clamp        ON kanban_card_assignees;
DROP FUNCTION IF EXISTS kanban_card_require_assignee();
DROP FUNCTION IF EXISTS kanban_card_clamp_unassigned();

-- 2) คืนการ์ดโพสต์ที่กวาดมาจากกระทู้ดิสฯ กลับกอง "เสร็จ" (สภาพเดิมก่อนเฟส B)
--    ⚠️ ต้องอยู่ **หลัง** DROP trigger ไม่งั้น trg_kanban_cards_require_assignee ตีกลับทั้งก้อน (23514)
--    ⚠️ completed_at = วันตั้งกระทู้จริง ไม่ใช่ now() — ไม่งั้นประวัติโกหกว่าเสร็จพร้อมกันวันนี้ 953 ใบ
--    (โพสต์ backfill ทุกใบเป็น status='draft' และไม่มี post_social_history → POST_STATUS คืน NULL
--     → คอลัมน์ status_type คือค่าที่ใช้แสดงจริง · ตรวจแล้วบน dev 2026-09-03)
UPDATE kanban_cards c
   SET status_type  = 'done',
       completed_at = pe.created_at,
       updated_at   = now()
  FROM kanban_card_links l
  JOIN post_episodes pe ON pe.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'post'
   AND pe.created_via = 'backfill'
   AND pe.archived_at IS NULL
   AND c.archived_at IS NULL
   AND c.status_type <> 'done';

-- 3) ใส่ชื่อคนทำกลับเข้าไปเป็น "ผู้รับผิดชอบ" (user สั่ง 2026-09-03)
--
-- ⛔ นี่คือ **ข้อยกเว้นที่ user เคาะเอง** ของกฎ "ห้าม seed <entity>_assignees จาก created_by"
--    เหตุผลที่ยกเว้นได้เฉพาะฝั่งโพสต์: `backfillPostThreads.js` เซ็ต created_by จาก
--    `t.owner_id` = **เจ้าของกระทู้ Discord ตัวจริง** (กระทู้ที่หาเจ้าของไม่เจอถูกข้ามทิ้ง)
--    → ข้อมูลยืนยัน: โพสต์ backfill 954 ใบมี 65 คนสร้าง ไม่ใช่คนเดียว = คนทำงานจริง ไม่ใช่คนนำเข้า
--    ต่างจากเคส ที่เจ้าของกระทู้คือผู้แจ้ง ไม่ใช่คนทำเคส (นั่นคือที่มาของเจ้าภาพปลอม 176 ใบ)
--    ⭐ และตอนนี้ "ผู้รับผิดชอบ" ไม่ดันการ์ดไปไหนแล้ว (ข้อ 1) จึงเป็นแค่ **ประวัติว่าใครทำ**
--
-- ⚠️ ต้องเขียน 2 ตาราง — บอร์ดอ่านชื่อจาก kanban_card_assignees ไม่ได้อ่าน post_assignees
-- ⚠️ assigned_at = วันตั้งกระทู้ ด้วยเหตุผลเดียวกับ completed_at
INSERT INTO post_assignees (org_id, episode_id, user_id, assigned_at)
SELECT p.org_id, p.id, p.created_by, p.created_at
  FROM post_episodes p
 WHERE p.created_by IS NOT NULL
   AND p.org_id IS NOT NULL
   AND p.archived_at IS NULL
   AND p.visibility = 'org'          -- ร่างส่วนตัวไม่มีผู้รับผิดชอบ (กติกาเฟส C — ประตูทั้งสองตอบ 400)
ON CONFLICT DO NOTHING;

INSERT INTO kanban_card_assignees (card_id, user_id, assigned_at)
SELECT l.card_id, pa.user_id, pa.assigned_at
  FROM post_assignees pa
  JOIN kanban_card_links l ON l.entity_type = 'post' AND l.entity_id = pa.episode_id
ON CONFLICT DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-03 (รอบ 3) — งานสื่อ backfill: kanban_cards.created_at ผิด → เรียงมั่ว
--
-- user ทัก: การ์ด KB-1093 (กระทู้ปีก่อน) โผล่บนสุดตอนเรียง "ใหม่ก่อน" ทั้งที่เนื้อหาเก่า
-- สาเหตุ: kanban_cards.created_at ของการ์ด backfill = **วัน mirror การ์ด** (นาทีเดียวกันเกือบ
-- ทุกใบ, 2026-08-27) ไม่ใช่วันตั้งกระทู้จริง — คนละคอลัมน์กับ post_episodes.created_at ที่ถูกอยู่แล้ว
-- (แกะ snowflake ใน backfillPostThreads.js) ไม่มีผลข้างเคียง เพราะการ์ด backfill ไม่มีใครอ้างอิง
-- created_at เดิมอยู่แล้ว (ไม่มี due date/reminder ผูกกับมัน)
--
-- แก้คู่กับ: web/db/posts/episodes.js (ORDER BY แยกตาม source='backfill' ให้ใช้ created_at
--            แทน updated_at — updated_at ยังคงความหมาย "แก้ล่าสุด" ไว้ตามเดิม ไม่แตะ)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE kanban_cards c
   SET created_at = pe.created_at
  FROM kanban_card_links l
  JOIN post_episodes pe ON pe.id = l.entity_id
 WHERE l.card_id = c.id
   AND l.entity_type = 'post'
   AND pe.created_via = 'backfill'
   AND c.created_at <> pe.created_at;

COMMIT;


-- Down Migration
-- ⛔ ย้อนกลับไม่ได้โดยตั้งใจ — บล็อกนี้เป็น "ถอดกฎ + backfill ข้อมูลเก่า" ไม่ใช่การเปลี่ยนโครงสร้าง
--   · trigger/ฟังก์ชันที่ DROP ไป = กฎ "ผู้รับผิดชอบผูกกับกอง" ที่ user เคาะให้เลิกใช้ถาวร
--     (ดู .wolf/cerebrum.md Do-Not-Repeat — ห้ามเอากลับมาในทุกรูปแบบ) การสร้างคืนจึงเป็นการ
--     ย้อนการตัดสินใจ ไม่ใช่ย้อน migration
--   · UPDATE/INSERT ที่เหลือเป็น backfill ค่าที่ "ควรจะถูกตั้งแต่แรก" (completed_at, created_at,
--     assignees ของงานสื่อ) — ไม่มีสำเนาค่าเดิมเก็บไว้ และค่าเดิมคือค่าที่ผิด
-- ถ้าต้องย้อนจริง ให้ทำเป็น migration ใหม่ที่เขียนเจตนาใหม่ อย่า rollback ตัวนี้
SELECT 1;
