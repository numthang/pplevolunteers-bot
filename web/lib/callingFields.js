// allowlist ฟิลด์สมาชิกที่ payload ฝั่ง calling ส่งออกได้
//
// ทำไมต้อง allowlist ไม่ใช่ denylist:
// query ฝั่ง calling ใช้ `SELECT m.*` / `SELECT *` จาก cache_pple_member ซึ่งเป็น
// สำเนาทะเบียนสมาชิกพรรค "ทั้งแถว" — มี identification_number (เลขบัตร ปชช. 13 หลัก),
// date_of_birth, ที่อยู่บ้าน, ข้อมูลการชำระเงิน ติดมาด้วย ทั้งที่หน้า calling ไม่ได้ใช้เลย
// สักฟิลด์ (grep แล้ว ไม่มีไฟล์ใน app/calling หรือ components/calling อ้างถึง)
//
// denylist ไม่พอ เพราะพอ import เพิ่มคอลัมน์ใหม่เข้า cache_pple_member มันจะรั่วออกเงียบๆ
// โดยไม่มีใครต้องตัดสินใจอะไรเลย — ซึ่งคือสาเหตุที่เลขบัตรหลุดมาตั้งแต่แรก
//
// เทียบกับ app/api/docs/ngs-search/route.js ที่ตั้งใจไม่ส่ง identification_number
// ออกไปแล้วส่งแค่ boolean แทน — ฝั่ง calling ควรเข้มเท่ากัน

/** ฟิลด์ที่มาจากตาราง cache_pple_member โดยตรง */
const FROM_MEMBER_TABLE = [
  'source_id', 'first_name', 'last_name', 'full_name',
  'mobile_number', 'line_id', 'email', 'facebook_id',   // ช่องทางติดต่อ — UI แสดงจริงใน RecordCallModal
  'home_province', 'home_amphure', 'home_district',
  'membership_type', 'expired_at',
]

/** ฟิลด์ที่ query เติมเองตอน JOIN/aggregate (ไม่ได้มาจาก cache_pple_member) */
const FROM_QUERY = [
  'tier', 'flag', 'member_status', 'contact_type', 'member_id', 'phone_hidden',
  'assigned_to', 'assigned_by', 'assignment_date', 'assigned_at', 'rsvp',
  'last_called_at', 'last_status', 'last_note',
  'latest_called_at', 'latest_log_status', 'latest_note',
  'total_calls', 'answered_count', 'sms_count', 'all_time_calls', 'camp_calls', 'call_status',
  'campaign_id', 'campaign_name', 'campaign_description', 'event_date',
  'discord_id', 'discord_username', 'discord_avatar',
  // หน้าประวัติการโทร (pending?history=true)
  'log_id', 'status', 'note', 'called_at',
  'latest_status', 'latest_campaign_id', 'latest_campaign_name',
]

export const MEMBER_PUBLIC_FIELDS = [...FROM_MEMBER_TABLE, ...FROM_QUERY]

const ALLOWED = new Set(MEMBER_PUBLIC_FIELDS)

/** คัดเฉพาะฟิลด์ที่อนุญาต — key ที่ไม่มีในแถวจะไม่ถูกเติมเข้ามา */
export function pickMemberFields(row) {
  if (!row) return row
  const out = {}
  for (const key of Object.keys(row)) {
    if (ALLOWED.has(key)) out[key] = row[key]
  }
  return out
}

/** คัดทั้ง array */
export function pickMemberFieldsAll(rows) {
  return Array.isArray(rows) ? rows.map(pickMemberFields) : rows
}
