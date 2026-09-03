/**
 * Client-safe case labels (ไม่มี fs — ใช้ใน client components)
 * ต้องตรงกับ config/case-options.json statusLabels
 */
export const STATUS_LABELS = {
  open: 'รับเรื่องแล้ว',
  in_progress: 'กำลังดำเนินการ',
  resolved: 'แก้ไขแล้ว',
  closed: 'ปิดเรื่อง',
  rejected: 'ไม่รับดำเนินการ',
}

/**
 * ⛔ ต้องตรงกับ SELECTABLE_STATUSES ใน caseOptions.js เป๊ะ (ฝั่งนั้นอ่าน fs ไม่ได้ที่ client)
 *    `closed` ไม่อยู่ในนี้ = เลือกใหม่ไม่ได้ แต่ยังมีใน STATUS_LABELS ไว้อ่านเคสเก่า
 */
export const SELECTABLE_STATUSES = ['open', 'in_progress', 'resolved', 'rejected']

/** สถานะจบเคส — ต้องมีข้อความแจ้งผู้ร้องเรียนเสมอ (rejected ต้องมีเหตุผลเพิ่ม) */
export const NEEDS_PUBLIC_NOTE = ['resolved', 'rejected']
export const NEEDS_REJECT_REASON = ['rejected']
