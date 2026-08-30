/**
 * หลักฐานการเงิน (สลิป/ใบเสร็จ) — เก็บ "นอก /public" เสิร์ฟผ่าน gated route เท่านั้น
 * convention path เดียวกับ cases (caseUploads.js) และ docs (cropDocument.js)
 *
 * ⚠️ เดิมไฟล์พวกนี้อยู่ `web/public/uploads/evidence/` = Next เสิร์ฟเป็น static
 *    ใครเดา/มี URL ก็เปิดดูสลิปได้โดยไม่ต้องล็อกอิน และ middleware กันไม่ได้ด้วย
 *    เพราะ matcher ยกเว้นทุก path ที่ลงท้ายด้วยนามสกุลไฟล์ (web/middleware.js)
 *
 * URL ที่เก็บใน DB ยังเป็น `/uploads/evidence/<filename>` เหมือนเดิม (ไม่ต้อง migrate ข้อมูล)
 * แต่ตอนนี้มันวิ่งไปที่ route web/app/uploads/evidence/[filename]/route.js ซึ่งเช็คสิทธิ์ก่อนส่งไฟล์
 */

import path from 'path'

/** โฟลเดอร์จริงบนดิสก์ — เว็บรันที่ web/ จึงต้องถอยขึ้นไปรากก่อน (บอทรันที่รากอยู่แล้ว) */
export function getFinanceUploadDir() {
  return process.env.FINANCE_UPLOAD_DIR ?? path.join(process.cwd(), '..', 'uploads', 'finance')
}

/** URL ที่เก็บลง DB (คงรูปเดิมไว้ ของเก่าในตารางจะได้ใช้ต่อได้เลย) */
export function financeEvidenceUrl(filename) {
  return `/uploads/evidence/${filename}`
}
