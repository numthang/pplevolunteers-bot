-- Migrate wrong_number → not_called in calling_logs
-- ต้อง ALTER เพิ่ม not_called ก่อน แล้วค่อย UPDATE แล้วค่อยเอา wrong_number ออก

ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','wrong_number','not_called')
  COLLATE utf8mb4_unicode_ci NOT NULL;

UPDATE calling_logs SET status = 'not_called' WHERE status = 'wrong_number';

ALTER TABLE calling_logs
  MODIFY COLUMN status ENUM('answered','no_answer','not_called')
  COLLATE utf8mb4_unicode_ci NOT NULL;
