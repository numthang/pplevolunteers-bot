// services/sms.js — ThaiBulkSMS (CJS สำหรับ bot)
// port จาก web/lib/sendSms.js (ESM) — bot require() ไฟล์ web ไม่ได้
const API_KEY    = process.env.THAIBULKSMS_API_KEY;
const API_SECRET = process.env.THAIBULKSMS_API_SECRET;
const SENDER     = process.env.THAIBULKSMS_SENDER;
const FORCE      = process.env.THAIBULKSMS_FORCE || 'corporate';

/** SMS gateway ตั้งค่าครบไหม */
function smsConfigured() {
  return !!(API_KEY && API_SECRET);
}

/** 66xxxxxxxxx → 0xxxxxxxxx · เก็บเฉพาะตัวเลข */
function normalizePhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('66')) return '0' + digits.slice(2);
  return digits;
}

/**
 * ส่ง SMS ผ่าน ThaiBulkSMS
 * @param {object} p
 * @param {string} p.msisdn  เบอร์ปลายทาง คั่นด้วย comma (≤500 ต่อครั้ง)
 * @param {string} p.message ข้อความ
 * @returns {Promise<object>} response body (มี phone_number_list / bad_phone_number_list / error)
 */
async function sendSms({ msisdn, message }) {
  // dev: SMS_DRY_RUN=1 → ไม่ยิงจริง log OTP ลง console แทน (prod ห้ามตั้ง)
  if (process.env.SMS_DRY_RUN === '1') {
    console.log(`[SMS DRY-RUN] to=${msisdn}: ${message}`);
    return { phone_number_list: [msisdn] };
  }
  if (!smsConfigured()) throw new Error('SMS gateway not configured');
  const auth = Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');
  const apiRes = await fetch('https://api-v2.thaibulksms.com/sms', {
    method: 'POST',
    headers: { 'Authorization': `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ msisdn, message, sender: SENDER, force: FORCE }),
  });
  return apiRes.json();
}

module.exports = { smsConfigured, normalizePhone, sendSms };
