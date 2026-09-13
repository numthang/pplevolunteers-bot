/** ยอดรวมของรอบ — ใช้ทั้งในไฟล์ export และบนหน้าจอ ให้คิดที่เดียวกัน */
export const totalAmount = (items = []) =>
  items.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)

/**
 * เพดานผู้รับต่อการโอน 1 ครั้งของแอปธนาคาร (K PLUS / K BIZ = 10)
 *
 * ⚠️ ตรวจแล้ว 2026-09-13: บัญชีบุคคลธรรมดาอัปโหลดไฟล์โอนกลุ่มไม่ได้ (เป็นบริการฝั่งนิติบุคคล)
 *    → คนกดโอนต้องทำทีละกลุ่มไม่เกิน 10 คน ระบบจึงต้องแบ่งกลุ่มให้ตรงกับที่ตั้งไว้ในแอป
 */
export const GROUP_SIZE = 10

/** ชื่อกลุ่มของบรรทัดที่ index นี้ (0-based) → 'A', 'B', 'C' … */
export const groupLabel = index =>
  String.fromCharCode(65 + Math.floor(index / GROUP_SIZE))

/** แบ่งเป็นกลุ่มละ GROUP_SIZE พร้อมยอดรวมของกลุ่ม — ใช้บนหน้าจอ */
export function chunkIntoGroups(items = []) {
  const groups = []
  for (let i = 0; i < items.length; i += GROUP_SIZE) {
    const rows = items.slice(i, i + GROUP_SIZE)
    groups.push({ label: groupLabel(i), rows, total: totalAmount(rows) })
  }
  return groups
}
