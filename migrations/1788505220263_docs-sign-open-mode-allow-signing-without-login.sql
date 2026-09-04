-- Up Migration
-- โหมด `open` ของใบสำคัญรับเงิน — ถือลิงก์ = เซ็นได้ ไม่ต้องล็อกอิน (เหมือนส่งกระดาษให้เซ็น)
--
-- ทำไม: ส่งลิงก์ให้ผู้รับเงิน 20 คน ทุกคนต้องล็อกอินก่อนถึงจะเซ็นได้ — คนส่วนใหญ่ไม่ได้ใช้เว็บนี้
--   เป็นประจำ การล็อกอินจึงยุ่งกว่าการเซ็นกระดาษที่ระบบนี้มาแทน (user แจ้ง 2026-09-04)
--   โหมด `flexible` เดิมไม่ช่วย — มันแค่ยอมให้ "คนที่ล็อกอินแล้วคนไหนก็เซ็นได้" คือยังต้องล็อกอิน
--
-- 1) signed_by_user_id → NULL ได้
--    โหมด open ไม่มีบัญชีให้ผูก · คอลัมน์ยังเป็น NOT NULL อยู่ = INSERT พังตอน COMMIT
--    (เซ็นเสร็จแล้วค่อย rollback ทั้งก้อน ผู้เซ็นเห็น error ทั้งที่วาดจบแล้ว)
--    หลักฐานที่เหลือในโหมดนี้ = signed_ip + created_at + ตัวลิงก์ (UUID ที่ส่งถึงตัวผู้รับ)
--
-- 2) signed_via ('login' | 'link') — คอลัมน์ใหม่
--    ⚠️ ห้ามยัดความหมายนี้ลง signed_on_behalf ที่มีอยู่: ในโหมด open ค่า session เป็น null
--    ทำให้เงื่อนไข `member_user_id !== session.user.userId` เป็นจริงทุกใบ → ทุกใบจะถูกบันทึกว่า
--    "คนอื่นเซ็นแทน" ทั้งที่เจ้าตัวเซ็นเอง = คอลัมน์ที่ไว้งัดมาดูตอนมีเรื่องใช้ไม่ได้เลย
--    แถวเก่าทั้งหมดเซ็นตอนบังคับล็อกอิน → DEFAULT 'login' ถูกต้องย้อนหลังทุกแถว
--
-- คู่กับโค้ด: web/db/orgConfig.js (DOCS_SIGN_POLICIES += 'open'),
--   web/app/api/docs/sign/route.js, .../sign/verify, .../sign/preview-img, .../sign/pdf,
--   web/app/docs/layout.js (ข้าม requireFeature เฉพาะ /docs/sign/*)
--
-- ค่าตั้งต้นยังเป็น 'strict' — org ที่ไม่ตั้งอะไรเลยพฤติกรรมไม่เปลี่ยน

ALTER TABLE docs_signatures ALTER COLUMN signed_by_user_id DROP NOT NULL;

ALTER TABLE docs_signatures
  ADD COLUMN IF NOT EXISTS signed_via VARCHAR(10) NOT NULL DEFAULT 'login';

ALTER TABLE docs_signatures
  DROP CONSTRAINT IF EXISTS docs_signatures_signed_via_chk;
ALTER TABLE docs_signatures
  ADD CONSTRAINT docs_signatures_signed_via_chk CHECK (signed_via IN ('login', 'link'));

-- Down Migration
-- ⚠️ ย้อนกลับได้เฉพาะตอนที่ยังไม่มีใบไหนถูกเซ็นแบบ open — ถ้ามีแล้ว การใส่ NOT NULL คืน
--    จะ error เอง (ตั้งใจ: ไม่ลบลายเซ็นจริงทิ้งเงียบๆ เพื่อให้ migration ย้อนผ่าน)
ALTER TABLE docs_signatures DROP CONSTRAINT IF EXISTS docs_signatures_signed_via_chk;
ALTER TABLE docs_signatures DROP COLUMN IF EXISTS signed_via;
ALTER TABLE docs_signatures ALTER COLUMN signed_by_user_id SET NOT NULL;
