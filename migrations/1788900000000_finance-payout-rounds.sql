-- Up Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE — ระบบจ่ายเบี้ยเลี้ยง ขั้นที่ 1: "รอบจ่าย" + รายการโอน
--
-- เป้าหมาย: เลิกทำรายชื่อ/ยอดบน Excel กระจัดกระจาย → รวมไว้ที่เดียว รู้ยอดรวมต่อรอบ
--           แล้วส่งรายการให้คนที่กดโอนไปทำได้ (ตัวเองหรือคนอื่น)
--
-- ⚠️ ตรวจแล้ว 2026-09-13: บัญชีบุคคลธรรมดาอัปโหลดไฟล์โอนกลุ่มกับธนาคารไม่ได้
--    K BIZ / K PLUS เพดาน 10 รายการต่อครั้ง · การนำเข้าไฟล์อยู่บน K-Cash Connect Plus (นิติบุคคล)
--    → ระบบนี้จึงเป็น "ตัวจัดรายการ + เช็กลิสต์" ไม่ใช่ตัวสั่งโอน · export ไว้ส่งต่อ/เก็บหลักฐาน
--
-- ทำไมผูกกับ finance_accounts (บัญชีต้นทาง):
--   1) header ของไฟล์โอนกลุ่มต้องมีเลขบัญชีผู้โอน
--   2) ได้สิทธิ์รายเขต/จังหวัดฟรีจาก canViewAccount/canEditAccount (web/lib/financeAccess.js)
--      — คนจ่ายแยกตามเขต/จังหวัด ไม่ใช่คลังกลางคนเดียว
--
-- ⚠️ ผู้รับเงินเป็น XOR: สมาชิก (users) หรือ คนนอก (docs_external_payees) อย่างใดอย่างหนึ่ง
--    ลอก pattern จาก docs_entry_recipient_xor ของโมดูล Docs — ที่นั่นเจ็บมาแล้วกับการ
--    ยืมบัญชีคนอื่นมาสวมแล้ว override ชื่อทับ
--
-- ⚠️ finance_payout_items เก็บ "snapshot" ข้อมูลรับเงินตอนกด export
--    สมาชิกแก้เลขบัญชีทีหลัง ประวัติรอบเก่าต้องไม่เพี้ยนตาม
--
-- Backfill: prod 2026-09-13 มีคนกรอกเลขบัญชีแค่ 3 / 7,704 แถว และ bank_name เป็น free text
--           ("กสิกรไทย" ×2, "กสิรกรไทย" ×1 สะกดผิด) → map เป็น bank_code '004' ให้เลย
--           (ตัวเลขนับก่อน/หลังอยู่ในคอมเมนต์ท้ายไฟล์)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ข้อมูลรับเงินของผู้รับ ────────────────────────────────────────────────
-- bank_code = รหัสธนาคาร 3 หลัก (มาตรฐาน ธปท.) — ไฟล์โอนกลุ่มใช้รหัส ไม่ใช่ชื่อไทยที่สะกดกันคนละแบบ
-- payment_method = 'bank' (เลขบัญชี) | 'promptpay' (เบอร์โทร/เลขบัตร ปชช.)
ALTER TABLE org_members
  ADD COLUMN IF NOT EXISTS bank_code      VARCHAR(3),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(12) NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS promptpay_id   VARCHAR(32);

ALTER TABLE org_members
  ADD CONSTRAINT org_members_payment_method_chk
  CHECK (payment_method IN ('bank', 'promptpay'));

-- ทะเบียนผู้รับเงินคนนอกใช้ร่วมกับ Docs — คนเดียวกันไม่ต้องกรอกสองที่
ALTER TABLE docs_external_payees
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(12) NOT NULL DEFAULT 'bank',
  ADD COLUMN IF NOT EXISTS bank_code      VARCHAR(3),
  ADD COLUMN IF NOT EXISTS bank_name      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS account_no     VARCHAR(64),
  ADD COLUMN IF NOT EXISTS account_holder VARCHAR(255),
  ADD COLUMN IF NOT EXISTS promptpay_id   VARCHAR(32);

ALTER TABLE docs_external_payees
  ADD CONSTRAINT docs_external_payees_payment_method_chk
  CHECK (payment_method IN ('bank', 'promptpay'));

-- ── รอบจ่าย ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finance_payout_rounds (
  id             SERIAL PRIMARY KEY,
  org_id         INTEGER       NOT NULL REFERENCES orgs(id),
  account_id     INTEGER       NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  title          TEXT          NOT NULL,
  -- ที่มาของรอบ: ผูกกิจกรรม หรือ ผูกงวดเดือน (user: "ปกติก็กิจกรรม แต่มีจ่ายเป็นรอบเดือนด้วย")
  source_type    VARCHAR(10)   NOT NULL DEFAULT 'event',
  event_id       INTEGER       REFERENCES cache_pple_event(id),
  period_ym      CHAR(7),
  default_amount NUMERIC(12,2),
  status         VARCHAR(10)   NOT NULL DEFAULT 'draft',
  note           TEXT,
  exported_at    TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  created_by     INTEGER       REFERENCES users(id),
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT finance_payout_rounds_source_chk CHECK (source_type IN ('event', 'period')),
  CONSTRAINT finance_payout_rounds_status_chk CHECK (status IN ('draft', 'exported', 'paid')),
  -- ที่มาแบบไหนต้องมีของของแบบนั้น
  CONSTRAINT finance_payout_rounds_source_ref_chk CHECK (
    (source_type = 'event'  AND event_id IS NOT NULL) OR
    (source_type = 'period' AND period_ym IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_finance_payout_rounds_org
  ON finance_payout_rounds (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_finance_payout_rounds_account
  ON finance_payout_rounds (account_id);

-- ── รายการในรอบ (1 บรรทัด = 1 คน = 1 บรรทัดในไฟล์โอน) ────────────────────
CREATE TABLE IF NOT EXISTS finance_payout_items (
  id                SERIAL PRIMARY KEY,
  round_id          INTEGER      NOT NULL REFERENCES finance_payout_rounds(id) ON DELETE CASCADE,
  member_user_id    INTEGER      REFERENCES users(id),
  external_payee_id INTEGER      REFERENCES docs_external_payees(id),
  amount            NUMERIC(12,2) NOT NULL,
  note              TEXT,
  -- snapshot ตอน export (ดูหัวไฟล์)
  payee_name        TEXT,
  payment_method    VARCHAR(12),
  bank_code         VARCHAR(3),
  account_no        VARCHAR(64),
  promptpay_id      VARCHAR(32),
  snapshot_at       TIMESTAMPTZ,
  -- ติ๊กรายคนตอนไล่กดโอน — ธนาคารไทยไม่เปิดให้บัญชีบุคคลธรรมดาอัปไฟล์โอนกลุ่ม
  -- (K BIZ/K PLUS เพดาน 10 คน/ครั้ง · การนำเข้าไฟล์อยู่บน K-Cash Connect Plus ฝั่งนิติบุคคล)
  -- → คนกดโอนทำทีละกลุ่ม ต้องรู้ว่าค้างใคร และส่งรายการให้คนอื่นไปกดแทนได้
  paid_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT finance_payout_items_recipient_xor
    CHECK ((member_user_id IS NULL) <> (external_payee_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_finance_payout_items_round
  ON finance_payout_items (round_id, id);

-- กันใส่คนเดิมซ้ำในรอบเดียวกัน (partial เพราะอีกฝั่งของ XOR เป็น NULL เสมอ)
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_payout_items_round_member
  ON finance_payout_items (round_id, member_user_id) WHERE member_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_payout_items_round_payee
  ON finance_payout_items (round_id, external_payee_id) WHERE external_payee_id IS NOT NULL;

-- ── Backfill bank_code จาก bank_name เดิม ─────────────────────────────────
-- นับก่อน (prod 2026-09-13): SELECT count(*) FROM org_members WHERE bank_code IS NOT NULL  → 0
UPDATE org_members SET bank_code = '004' WHERE bank_name IN ('กสิกรไทย', 'กสิรกรไทย');
UPDATE org_members SET bank_code = '014' WHERE bank_name IN ('ไทยพาณิชย์', 'ไทยพานิชย์');
UPDATE org_members SET bank_code = '002' WHERE bank_name IN ('กรุงเทพ');
UPDATE org_members SET bank_code = '006' WHERE bank_name IN ('กรุงไทย');
UPDATE org_members SET bank_code = '025' WHERE bank_name IN ('กรุงศรีอยุธยา', 'กรุงศรี');
UPDATE org_members SET bank_code = '011' WHERE bank_name IN ('ทหารไทยธนชาต', 'ทหารไทย', 'ธนชาต');
UPDATE org_members SET bank_code = '030' WHERE bank_name IN ('ออมสิน');
UPDATE org_members SET bank_code = '034' WHERE bank_name IN ('ธ.ก.ส.', 'ธกส');
-- นับหลัง: ต้องได้ 3 (ตัวเลข prod ตอนเขียน migration — local อาจต่าง)
--   SELECT bank_code, count(*) FROM org_members WHERE bank_code IS NOT NULL GROUP BY 1;
-- ⚠️ "Applied" ไม่ได้แปลว่าข้อมูลเปลี่ยน — ต้อง query นับจริงหลังรันบน prod

-- Down Migration
DROP TABLE IF EXISTS finance_payout_items;
DROP TABLE IF EXISTS finance_payout_rounds;

ALTER TABLE docs_external_payees
  DROP CONSTRAINT IF EXISTS docs_external_payees_payment_method_chk;
ALTER TABLE docs_external_payees
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS bank_code,
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS account_no,
  DROP COLUMN IF EXISTS account_holder,
  DROP COLUMN IF EXISTS promptpay_id;

ALTER TABLE org_members
  DROP CONSTRAINT IF EXISTS org_members_payment_method_chk;
ALTER TABLE org_members
  DROP COLUMN IF EXISTS bank_code,
  DROP COLUMN IF EXISTS payment_method,
  DROP COLUMN IF EXISTS promptpay_id;
