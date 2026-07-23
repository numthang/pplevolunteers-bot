-- ============================================================================
-- docs-id-card-to-users.sql — สำเนาบัตรประชาชน: org_members (per-guild) → users (per-คน)
-- org-core branch · localhost only · 2026-07-21
--
-- ทำไม: คนมีบัตรใบเดียว — ที่มันอยู่ org_members เป็นมรดกจาก identity split ที่ลาก
--   คอลัมน์ตามสูตร (เอกสาร/bank → org_members) ไม่ได้ตัดสินใจใหม่ · ของเดิมสมัย docs
--   เคาะไว้ที่ dc_members per-guild โดยรู้ว่าซ้ำ (ตอนนั้นยังไม่มีโลก org)
--   ผลตอนนี้: org 1 มี 3 guild → คนเดียวต้องอัปบัตร 3 รอบถึงจะครบทุกที่
--
-- ⛔ PREREQ ที่ต้องมีก่อนรันไฟล์นี้ (scrutinize blocker 2026-07-21):
--   การเช็ค "ผู้ขอดูกับเจ้าของบัตรอยู่ org เดียวกัน" **ไม่เคยมีในระบบ**
--   ทุกวันนี้รอดเพราะ storage เป็น per-guild (คนดูแล guild A เห็นได้แค่สำเนาใน guild A)
--   พอรวมเป็นใบเดียวตัวกันนี้หายทันที → โค้ดเช็คต้องขึ้นก่อน ไฟล์นี้ตามหลัง
--
-- dry-run: ลงท้าย ROLLBACK · ผ่าน verify แล้วเปลี่ยนเป็น COMMIT
-- ============================================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS id_card_image BYTEA;

-- ย้ายรูป: 1 คนอาจมีหลายแถว (guild ละแถว) → เอาแถวที่มีรูปแถวใดก็ได้ (รูปเดียวกันของคนคนนั้น)
UPDATE users u
   SET id_card_image = src.img
  FROM (
    SELECT DISTINCT ON (om.user_id) om.user_id, om.id_card_image AS img
      FROM org_members om
     WHERE om.id_card_image IS NOT NULL
     ORDER BY om.user_id, om.id DESC          -- แถวล่าสุดถ้ามีหลายใบ
  ) src
 WHERE u.id = src.user_id;

\echo '=== ย้ายครบไหม (ต้องเท่ากัน) ==='
SELECT (SELECT count(DISTINCT user_id) FROM org_members WHERE id_card_image IS NOT NULL) AS คนที่เคยมีบัตร,
       (SELECT count(*) FROM users WHERE id_card_image IS NOT NULL)                      AS คนที่มีบัตรหลังย้าย;

-- ทิ้งของเดิม — เก็บไว้ 2 ที่ = ดริฟต์แน่นอน (โค้ดสลับมาที่ users พร้อมกันในคอมมิตเดียว)
ALTER TABLE org_members DROP COLUMN IF EXISTS id_card_image;

\echo '=== org_members ต้องไม่มีคอลัมน์นี้แล้ว ==='
SELECT count(*) AS ต้องเป็น_0
  FROM information_schema.columns
 WHERE table_name='org_members' AND column_name='id_card_image';

COMMIT;  -- dry-run verified 2026-07-21 (ROLLBACK) → applied localhost org-core
