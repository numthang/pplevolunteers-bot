-- Up Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE — แจ้งผู้รับทาง Discord DM ว่าโอนเงินให้แล้ว (เคาะ 2026-09-19)
--
-- กติกา:
--   - ปุ่มแจ้งเตือน "แยกต่างหาก" จากการติ๊กจ่ายแล้ว · **กดส่งซ้ำได้ไม่จำกัด**
--     (user จะได้ยิงทดสอบข้อความหาตัวเองได้) → 3 คอลัมน์นี้เป็น "ร่องรอย" เฉยๆ
--     ⛔ ห้ามเอา notified_at ไปเป็นเงื่อนไขบล็อกการส่งซ้ำที่ไหนทั้งสิ้น
--   - เขียนหลังส่ง DM สำเร็จเท่านั้น — ส่งไม่ผ่าน (ผู้ใช้ปิด DM = Discord 50007)
--     แล้วเขียน จะได้ log ที่โกหกว่าแจ้งแล้ว
--   - โมดูลรอบจ่ายไม่มี audit log เลยสักเส้น และนี่คือการส่งข้อความ "ออกนอกระบบ"
--     จึงเก็บ notified_by ไว้ด้วยว่าใครเป็นคนกด (ยังไม่คุ้มทำตาราง log แยก)
--
-- notify_count = จำนวนครั้งสะสม (ไม่ reset) · notified_at = ครั้งล่าสุด
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE finance_payout_items
  ADD COLUMN IF NOT EXISTS notified_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notified_by  INT REFERENCES users(id);

-- Down Migration

ALTER TABLE finance_payout_items
  DROP COLUMN IF EXISTS notified_at,
  DROP COLUMN IF EXISTS notify_count,
  DROP COLUMN IF EXISTS notified_by;
