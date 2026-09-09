-- Up Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- CALLING — index 2 ตัวที่ขาด ทำให้หน้า /calling/assignments/[id] โหลด 2.6 วินาที
--
-- อาการ: user แจ้งว่าหน้า assignment 70 โหลดช้าจนสลับ tab แล้วข้อมูลสลับกัน
--        (race condition แก้ไปแล้วที่ commit a25ace1 — ไฟล์นี้แก้ "ช้า" ซึ่งเป็นต้นเรื่อง)
--
-- วัดด้วย EXPLAIN (ANALYZE, BUFFERS) บน getMembersInCampaign(org 1, campaign 70):
--   2,646 ms · shared hit 928,012 blocks เพื่อดึงแค่ 100 แถวแรก
--   ├─ LATERAL หา org_members ตาม serial → Seq Scan ทั้งตาราง × 1,233 รอบ = 777,700 blocks (~1.55s)
--   │    เพราะ org_members ไม่มี index บน serial เลย (มีแต่ user_id / org_id)
--   └─ LATERAL หาสายล่าสุดใน calling_logs → Seq Scan × 1,233 รอบ = 144,261 blocks (~0.81s)
--        เพราะ calling_logs มี index ตัวเดียวคือ (org_id)
--   หลังลง index 2 ตัวนี้: 2,646 ms → 38-54 ms (~50-70 เท่า) ผลลัพธ์เท่าเดิม
--
-- ⚠️ ทั้งสองตารางเล็ก (prod 2026-09-10: calling_logs 6,737 แถว · org_members 7,704 แถว)
--    จึงใช้ CREATE INDEX ธรรมดา ไม่ต้อง CONCURRENTLY — สร้างเสร็จในเสี้ยววินาที
--    (node-pg-migrate ห่อ .sql ไว้ใน transaction อยู่แล้ว ซึ่ง CONCURRENTLY ใช้ไม่ได้)
--    ถ้าวันหลังตารางโตถึงหลักล้าน ต้องเปลี่ยนเป็น CONCURRENTLY + แยกออกจาก transaction
-- ═══════════════════════════════════════════════════════════════════════════

-- ปิด LATERAL "สายล่าสุดของคนนี้ใน campaign นี้" ให้จบด้วย index เดียว
-- called_at DESC อยู่ท้าย = ORDER BY ... DESC LIMIT 1 อ่านแถวแรกแล้วหยุด ไม่ต้อง sort
CREATE INDEX IF NOT EXISTS idx_calling_logs_campaign_member
  ON calling_logs (campaign_id, member_id, contact_type, called_at DESC);

-- ปิด LATERAL ที่ map สมาชิก → บัญชีผู้ใช้ ด้วย serial
CREATE INDEX IF NOT EXISTS idx_org_members_serial_org
  ON org_members (serial, org_id);

-- Down Migration
DROP INDEX IF EXISTS idx_calling_logs_campaign_member;
DROP INDEX IF EXISTS idx_org_members_serial_org;
