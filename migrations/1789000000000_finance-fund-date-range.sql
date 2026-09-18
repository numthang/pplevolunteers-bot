-- Up Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE — กองเงินตามช่วงวันที่ (เปิดรับบริจาครอบใหม่ → เงินเข้าช่วงนั้นเข้ากองเอง)
--
-- กติกา (เคาะ 2026-09-18):
--   - กองที่มี starts_at = "กองมีวันที่" · เงิน**เข้า** (type='income') ที่ txn_at อยู่ในช่วง
--     และยังไม่มีใครเลือกกองให้ → นับเป็นของกองนั้น · ends_at NULL = ยังเปิดรับอยู่
--   - คิด "ตอนอ่าน" ไม่เขียน fund_id → ไม่ต้องแตะทางเข้าเงินอัตโนมัติ 5 ทาง
--     (smsWebhook/emailPoller/financeOCR/parse-kbank-statement/web API) และแก้วันที่มีผลย้อนหลังทันที
--     กฎอยู่ที่เดียว: effectiveFundSql() ใน web/db/finance/funds.js
--   - รายจ่ายไม่ถูกจับอัตโนมัติ (กดเลือกกองเอง)
--   - ช่วงวันที่ของกองในบัญชีเดียวกันห้ามทับกัน — เช็คใน funds.js (ไม่ใช้ EXCLUDE constraint
--     เพราะต้องลง btree_gist)
--
-- fund_manual = มีคนกดเลือกกองให้รายการนี้เองแล้ว (รวมถึงเลือก "ไม่ระบุ")
--   ไม่มีคอลัมน์นี้ กด "ไม่ระบุ" บนรายการในช่วง → fund_id NULL → ถูกจับกลับเข้ากองทันที
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE finance_funds
  ADD COLUMN IF NOT EXISTS starts_at DATE,
  ADD COLUMN IF NOT EXISTS ends_at   DATE;

ALTER TABLE finance_funds
  ADD CONSTRAINT finance_funds_range_chk
  CHECK (ends_at IS NULL OR (starts_at IS NOT NULL AND ends_at >= starts_at));

ALTER TABLE finance_transactions
  ADD COLUMN IF NOT EXISTS fund_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- Down Migration
ALTER TABLE finance_transactions DROP COLUMN IF EXISTS fund_manual;
ALTER TABLE finance_funds DROP CONSTRAINT IF EXISTS finance_funds_range_chk;
ALTER TABLE finance_funds
  DROP COLUMN IF EXISTS ends_at,
  DROP COLUMN IF EXISTS starts_at;
