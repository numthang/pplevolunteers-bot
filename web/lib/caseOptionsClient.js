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
