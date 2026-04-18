ALTER TABLE act_event_cache ADD COLUMN event_date DATE NULL AFTER description;
-- 1. migrate busy records
UPDATE calling_logs SET status = 'no_answer' WHERE status = 'busy';

-- 2. remove busy from ENUM
ALTER TABLE calling_logs 
  MODIFY COLUMN status ENUM('answered','no_answer','wrong_number') NOT NULL;

-- 3. เพิ่ม rsvp column (ถ้ายังไม่ได้ทำ)
ALTER TABLE calling_assignments
  ADD COLUMN rsvp ENUM('yes','no','maybe') NULL AFTER assigned_by;