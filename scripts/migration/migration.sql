ALTER TABLE finance_transactions
  DROP INDEX uq_ref,
  ADD UNIQUE KEY uq_ref (ref_id, account_id);


-- 1. Rename member_id → serial
ALTER TABLE dc_members CHANGE member_id serial VARCHAR(50) NULL;

-- 2. Add new member_id column (future link to ngs_member_cache.source_id)
ALTER TABLE dc_members ADD COLUMN member_id INT NULL AFTER serial;

-- 3. Add index on serial for join performance
ALTER TABLE dc_members ADD INDEX idx_serial (serial);

---

ALTER TABLE act_event_cache ADD COLUMN event_date DATE NULL AFTER description;
-- 1. migrate busy records
UPDATE calling_logs SET status = 'no_answer' WHERE status = 'busy';

-- 2. remove busy from ENUM
ALTER TABLE calling_logs 
  MODIFY COLUMN status ENUM('answered','no_answer','wrong_number') NOT NULL;

-- 3. เพิ่ม rsvp column (ถ้ายังไม่ได้ทำ)
ALTER TABLE calling_assignments
  ADD COLUMN rsvp ENUM('yes','no','maybe') NULL AFTER assigned_by;

-- 2026-05-03: เพิ่ม primary_province ใน dc_members สำหรับ user ที่ถือหลายจังหวัด ใช้เป็น default province ตอนเพิ่ม Contact ใหม่
ALTER TABLE dc_members ADD COLUMN primary_province VARCHAR(100) NULL AFTER province;

-- 2026-05-04: Contacts module — เพิ่ม specialty (รวม อาชีพ/ตำแหน่ง/ความสามารถ ใน field เดียว, ชื่อตาม dc_members.specialty)
ALTER TABLE calling_contacts ADD COLUMN specialty TEXT NULL AFTER note;

-- 2026-05-04: Contacts module — last_name optional (ฟอร์มไม่ใช้แล้ว แต่ column เก็บไว้ใน DB)
ALTER TABLE calling_contacts MODIFY COLUMN last_name VARCHAR(100) NULL;

-- 2026-05-04: Contacts module — เพิ่ม status 'met' ใน calling_logs (ใช้บันทึกการพบปะ in-person, signals + tier นับเหมือน answered)
ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called','met')
  COLLATE utf8mb4_unicode_ci NOT NULL;

-- 2026-05-04: calling_assignments — เปลี่ยน unique key ให้รวม campaign_id เพื่อให้แต่ละกิจกรรม assign คนชุดเดิมได้อิสระ
ALTER TABLE calling_assignments
  DROP INDEX uq_member_contact,
  ADD UNIQUE KEY uq_campaign_member_contact (campaign_id, member_id, contact_type);

-- 2026-05-07: dc_members — เพิ่มข้อมูลบัญชีธนาคาร สำหรับโอนเบี้ยเลี้ยง/เงินอุดหนุน
ALTER TABLE dc_members
  ADD COLUMN bank_name VARCHAR(50) NULL AFTER primary_province,
  ADD COLUMN account_no VARCHAR(50) NULL AFTER bank_name,
  ADD COLUMN account_holder VARCHAR(100) NULL AFTER account_no;

-- 2026-05-08: calling_logs — เพิ่ม SMS statuses สำหรับ bulk SMS ผ่าน ThaiBulkSMS
ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called','met','sms_sent','sms_delivered','sms_failed')
  COLLATE utf8mb4_unicode_ci NOT NULL;

-- 2026-05-09: act_event_cache — เปลี่ยน event_date เป็น DATETIME เพื่อเก็บเวลาจัดกิจกรรมด้วย
ALTER TABLE act_event_cache MODIFY COLUMN event_date DATETIME NULL;

