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

