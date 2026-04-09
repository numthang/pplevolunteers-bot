-- =================================================
-- Migration: Old PHP Finance → pple_volunteers
-- ตรวจสอบแล้วค่อยรัน:
--   mysql --no-defaults -u pple_dcbot -pDFDACccd654 pple_volunteers < scripts/migration-old-finance.sql
-- =================================================

-- ขยาย description column ให้รองรับข้อความยาว
ALTER TABLE finance_transactions MODIFY description TEXT DEFAULT NULL;

START TRANSACTION;

-- --------------------------------------------------
-- Step 1: สร้าง accounts ใหม่ 5 รายการ
-- (TFB_BKK=1, TFB_RB=2, CASH=4 มีอยู่แล้ว)
-- --------------------------------------------------
INSERT INTO finance_accounts (guild_id, owner_id, name, bank, account_no, visibility, created_at) VALUES
  ('1340903354037178410', '1098111730015543386', 'อรรณพ ศรีเจริญชัย (ลาดพร้าว 59)', 'ไทยพาณิชย์', '0102850050',  'private', NOW()),
  ('1340903354037178410', '1098111730015543386', 'อรรณพ ยศโสภณ (โชคชัย 4)',         'กรุงเทพ',    '2300449861',  'private', NOW()),
  ('1340903354037178410', '1098111730015543386', 'อรรณพ ยศโสภณ (ฉะเชิงเทรา)',       'กรุงไทย',    '2010114744',  'private', NOW()),
  ('1340903354037178410', '1098111730015543386', 'บัวหลวง VISA',                     'กรุงเทพ',     NULL,           'private', NOW()),
  ('1340903354037178410', '1098111730015543386', 'PayPal',                            'PayPal',      NULL,           'private', NOW());

-- --------------------------------------------------
-- Step 1b: สร้าง categories ใหม่ที่ยังไม่มี
-- --------------------------------------------------
INSERT INTO finance_categories (guild_id, owner_id, name, icon, is_global) VALUES
  ('1340903354037178410', '1098111730015543386', 'ค่าเลี้ยงดูลูก',      'GraduationCap', 0),
  ('1340903354037178410', '1098111730015543386', 'ให้แม่ตูน',            'Handshake',     0),
  ('1340903354037178410', '1098111730015543386', 'ธุรกิจแม่ตูน',         'Building2',     0),
  ('1340903354037178410', '1098111730015543386', 'นำทางฟาร์ม',           'Map',           0),
  ('1340903354037178410', '1098111730015543386', 'หนังสือ',              'BookOpen',      0),
  ('1340903354037178410', '1098111730015543386', 'สัตว์เลี้ยง',          'Heart',         0),
  ('1340903354037178410', '1098111730015543386', 'โอนระหว่างบัญชี',     'Banknote',      0);

-- --------------------------------------------------
-- Step 2: Import transactions
-- ข้าม: PAYPAL, PAYSBUY, KTB_CRI, SCB_KBI, SCB_BKK_FX, SCB_KBI2, GSB_KBI
-- ข้าม: date = 0000-00-00 (มี 2 rows)
-- type: statement > 0 = income, < 0 = expense
-- --------------------------------------------------
INSERT INTO finance_transactions
  (guild_id, account_id, type, amount, description, category_id, txn_at, created_at)
SELECT
  '1340903354037178410',

  -- account mapping
  CASE s.account_id
    WHEN 'CASH'    THEN 4
    WHEN 'TFB_BKK' THEN 1
    WHEN 'TFB_RB'  THEN 2
    WHEN 'SCB_BKK' THEN (SELECT id FROM finance_accounts WHERE name = 'อรรณพ ศรีเจริญชัย (ลาดพร้าว 59)' LIMIT 1)
    WHEN 'BBL_BKK' THEN (SELECT id FROM finance_accounts WHERE name = 'อรรณพ ยศโสภณ (โชคชัย 4)'         LIMIT 1)
    WHEN 'KTB_CHA' THEN (SELECT id FROM finance_accounts WHERE name = 'อรรณพ ยศโสภณ (ฉะเชิงเทรา)'       LIMIT 1)
    WHEN 'BBL_VISA' THEN (SELECT id FROM finance_accounts WHERE name = 'บัวหลวง VISA'  LIMIT 1)
    WHEN 'PAYPAL'   THEN (SELECT id FROM finance_accounts WHERE name = 'PayPal'         LIMIT 1)
  END,

  IF(s.statement > 0, 'income', 'expense'),
  ABS(s.statement),
  s.detail,

  -- category mapping
  CASE s.category
    WHEN 'Food'              THEN 1   -- ค่าอาหาร
    WHEN 'Snack'             THEN 1   -- ค่าอาหาร
    WHEN 'Fruit'             THEN 1   -- ค่าอาหาร
    WHEN 'Transportation'    THEN 2   -- ค่าเดินทาง
    WHEN 'Travel'            THEN 2   -- ค่าเดินทาง
    WHEN 'Donation'          THEN 6   -- บริจาค
    WHEN 'Investment'        THEN 9   -- ลงทุน
    WHEN 'Lost'              THEN 11  -- สูญหาย
    WHEN 'Telecommunication' THEN 17  -- โทรศัพท์/คอมพิวเตอร์
    WHEN 'Computer'          THEN 17  -- โทรศัพท์/คอมพิวเตอร์
    WHEN 'Clothing'          THEN 15  -- เสื้อผ้า/เครื่องแต่งกาย
    WHEN 'Cosmetic'          THEN 14  -- เครื่องสำอางค์
    WHEN 'Medical'           THEN 13  -- ค่ายา/สุขภาพ
    WHEN 'Electric'          THEN 16  -- ค่าน้ำ/ค่าไฟ
    WHEN 'MFP'               THEN 19  -- งบเขต/งบจังหวัด (Move Forward Party)
    WHEN 'Political'         THEN 18  -- ค่าเบี้ยเลี้ยง
    WHEN 'Freelance'         THEN 18  -- ค่าเบี้ยเลี้ยง
    WHEN 'Insurance'         THEN 9   -- ลงทุน
    WHEN 'Baby'              THEN (SELECT id FROM finance_categories WHERE name = 'ค่าเลี้ยงดูลูก'    LIMIT 1)
    WHEN 'Homeschool'        THEN (SELECT id FROM finance_categories WHERE name = 'ค่าเลี้ยงดูลูก'    LIMIT 1)
    WHEN 'Salary'            THEN (SELECT id FROM finance_categories WHERE name = 'ให้แม่ตูน'          LIMIT 1)
    WHEN 'Business'          THEN (SELECT id FROM finance_categories WHERE name = 'ธุรกิจแม่ตูน'       LIMIT 1)
    WHEN 'Business2'         THEN (SELECT id FROM finance_categories WHERE name = 'ธุรกิจแม่ตูน'       LIMIT 1)
    WHEN 'Business3'         THEN (SELECT id FROM finance_categories WHERE name = 'ธุรกิจแม่ตูน'       LIMIT 1)
    WHEN 'Business4'         THEN (SELECT id FROM finance_categories WHERE name = 'ธุรกิจแม่ตูน'       LIMIT 1)
    WHEN 'Home'              THEN (SELECT id FROM finance_categories WHERE name = 'นำทางฟาร์ม'         LIMIT 1)
    WHEN 'Library'           THEN (SELECT id FROM finance_categories WHERE name = 'นำทางฟาร์ม'         LIMIT 1)
    WHEN 'Farming'           THEN (SELECT id FROM finance_categories WHERE name = 'นำทางฟาร์ม'         LIMIT 1)
    WHEN 'Farming-3'         THEN (SELECT id FROM finance_categories WHERE name = 'นำทางฟาร์ม'         LIMIT 1)
    WHEN 'Book'              THEN (SELECT id FROM finance_categories WHERE name = 'หนังสือ'             LIMIT 1)
    WHEN 'Pet'               THEN (SELECT id FROM finance_categories WHERE name = 'สัตว์เลี้ยง'        LIMIT 1)
    WHEN 'Cash Flow'         THEN (SELECT id FROM finance_categories WHERE name = 'โอนระหว่างบัญชี'   LIMIT 1)
    ELSE                     8        -- อื่นๆ
  END,

  s.date,
  NOW()

FROM Statement s
WHERE s.account_id IN ('CASH','TFB_BKK','TFB_RB','SCB_BKK','BBL_BKK','KTB_CHA','BBL_VISA','PAYPAL')
  AND YEAR(s.date) > 1000
  AND s.statement IS NOT NULL;

-- --------------------------------------------------
-- Step 3: อัพเดท usage_count ของ categories
-- --------------------------------------------------
UPDATE finance_categories c
SET usage_count = (SELECT COUNT(*) FROM finance_transactions t WHERE t.category_id = c.id);

-- --------------------------------------------------
-- ตรวจสอบก่อน COMMIT
-- --------------------------------------------------
SELECT 'accounts' as tbl, COUNT(*) as `rows` FROM finance_accounts
UNION ALL
SELECT 'transactions', COUNT(*) FROM finance_transactions;

-- ถ้าโอเค → COMMIT
-- ถ้าไม่โอเค → ROLLBACK
COMMIT;
