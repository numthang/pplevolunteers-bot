-- Up Migration
-- เลิกใช้สถานะ `closed` (ปิดเรื่อง) — ยุบเข้ากับ `resolved` (แก้ไขแล้ว)
--
-- ทำไม: `closed` กับ `resolved` แปลว่าอย่างเดียวกัน แต่ทีมใช้ `closed` + เหตุผล "แก้ไขสำเร็จ"
--   เป็นท่าปิดเคสมาตรฐาน (66 ครั้งในวันเดียว) ส่วน `resolved` ใช้ 4 ครั้งตลอดกาล
--   แถม `closed`/`rejected` เคยใช้ list เหตุผลชุดเดียวกัน จนเลือกข้ามความหมายได้
--   ("ไม่รับดำเนินการ → แก้ไขสำเร็จ" — เคสที่ user เจอเอง 2026-09-04)
--
-- ⛔ ย้ายเฉพาะใบที่เหตุผล = "แก้ไขสำเร็จ" เท่านั้น (65 ใบบน prod)
--    ที่เหลือ (ข้อมูลไม่พอ / นอกเหนืออำนาจ ~16 ใบ) **ตั้งใจไม่ย้าย** ไป rejected:
--    /complaint/[ref] เป็นหน้าติดตาม **สาธารณะ** ที่ผู้ร้องเห็นป้ายสถานะของตัวเอง การเปลี่ยน
--    "ปิดเรื่อง" (เทา) → "ไม่รับดำเนินการ" (แดง) ย้อนหลัง = แก้ประวัติที่ผู้ร้องเคยเห็นแล้ว
--    โดยไม่มีคำอธิบาย (migration ไม่ผ่าน addTimelineEvents จึงไม่มีรายการใหม่ในไทม์ไลน์)
--    → ปล่อยคาไว้เป็น closed · โค้ดอ่านได้ปกติ (STATUS_LABELS ยังมี · DONE_STATUSES ยังนับ)
--    แค่เลือกใหม่ไม่ได้แล้ว (SELECTABLE_STATUSES ใน web/lib/caseOptions.js)
--
-- ⚠️ ห้ามเขียน updated_at = now() เด็ดขาด — cases ไม่มี trigger (เช็คแล้ว) ค่าจึงคงเดิม
--    หน้า public โชว์ updated_at เป็น "อัปเดตล่าสุด" และการ์ดหน้าแรกนับ "เสร็จใน 30 วัน" จากค่านี้
--    ถ้าเผลอแตะ = ผู้ร้อง 65 คนเห็นว่าเคสมีความเคลื่อนไหววันนี้ทั้งที่ไม่มีอะไรเกิดขึ้น
--
-- ✅ kanban ไม่ขยับ: CASE_STATUS ใน db/kanban/statusSql.js แม็ป resolved/closed/rejected → 'done'
--    เหมือนกันหมด และ KANBAN_DONE_STATUSES ก็ครอบทั้ง 3 → ไม่มีการ์ดใบไหนย้ายกอง
--
-- ✅ ตัวเลขหน้า /complaint ไม่ขยับ: นับ (resolved + closed) รวมกันอยู่แล้ว
--
-- close_reason ถูกล้างเป็น NULL เพราะซ้ำซ้อนกับตัวสถานะเอง ("แก้ไขแล้ว · แก้ไขสำเร็จ")
UPDATE cases
   SET status = 'resolved', close_reason = NULL
 WHERE status = 'closed' AND close_reason = 'แก้ไขสำเร็จ';

-- Down Migration
-- ย้อนกลับไม่ได้แบบตรงตัว (ไม่รู้ว่าใบไหนเดิมเป็น closed ใบไหนเป็น resolved อยู่แล้ว)
-- resolved เดิมมีแค่ 1 ใบและ close_reason เป็น NULL เสมอ → ใบที่ close_reason NULL ทั้งหมด
-- ย้อนเป็น closed จะพลาด 1 ใบนั้น ยอมรับได้ถ้าต้อง rollback จริง
-- UPDATE cases SET status='closed', close_reason='แก้ไขสำเร็จ' WHERE status='resolved' AND close_reason IS NULL;
