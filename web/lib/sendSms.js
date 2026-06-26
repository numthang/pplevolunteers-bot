/**
 * ThaiBulkSMS — primitive ส่ง SMS (ใช้ร่วม calling bulk + case tracking link)
 * แยกจาก app/api/calling/sms/route.js (logic เดิมเป๊ะ) เพื่อ reuse
 */

const API_KEY    = process.env.THAIBULKSMS_API_KEY
const API_SECRET = process.env.THAIBULKSMS_API_SECRET
const SENDER     = process.env.THAIBULKSMS_SENDER
const FORCE      = process.env.THAIBULKSMS_FORCE || 'corporate'

/** SMS gateway ตั้งค่าครบไหม */
export function smsConfigured() {
  return !!(API_KEY && API_SECRET)
}

/** 66xxxxxxxxx → 0xxxxxxxxx · เก็บเฉพาะตัวเลข */
export function normalizePhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('66')) return '0' + digits.slice(2)
  return digits
}

/**
 * ส่ง SMS ผ่าน ThaiBulkSMS
 * @param {object} p
 * @param {string} p.msisdn  เบอร์ปลายทาง คั่นด้วย comma (≤500 ต่อครั้ง)
 * @param {string} p.message ข้อความ
 * @returns {Promise<object>} response body จาก ThaiBulkSMS (มี phone_number_list / bad_phone_number_list / error)
 */
export async function sendSms({ msisdn, message }) {
  if (!smsConfigured()) throw new Error('SMS gateway not configured')
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64')
  const urlsInMsg = message.match(/https?:\/\/[^\s]+/g) || []
  const shortenUrl = urlsInMsg.some(u => u.length > 40)

  const apiRes = await fetch('https://api-v2.thaibulksms.com/sms', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ msisdn, message, sender: SENDER, force: FORCE, Shorten_url: shortenUrl }),
  })
  return apiRes.json()
}
