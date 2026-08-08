// services/email.js — ส่งอีเมลจากฝั่งบอท (CommonJS)
// คู่แฝดของ web/lib/sendEmail.js — ตั้งค่าเดียวกัน (SMTP_*) แต่ฝั่ง web เป็น ESM เลย require ข้ามไม่ได้
// ⚠️ แก้ตัวใดตัวหนึ่งแล้วต้องดูอีกตัวด้วย
//
// ไม่ตั้ง SMTP_USER/SMTP_PASS = stub (log เนื้อหาลง console) → เดฟไม่ต้องตั้ง SMTP ก็เทสต์ flow ได้
const nodemailer = require('nodemailer');

let _tx = null;
function transporter() {
  if (_tx) return _tx;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_USER || !SMTP_PASS) return null;
  const port = Number(SMTP_PORT) || 465;
  _tx = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // 465 = SSL · 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return _tx;
}

function emailConfigured() {
  return !!(process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function sendEmail({ to, subject, html, text }) {
  const tx = transporter();
  if (!tx) {
    console.log(`[email:stub] to=${to} · subject=${subject}\n${text || html}`);
    return { ok: true, stubbed: true };
  }
  try {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
    await tx.sendMail({ from, to, subject, html, text });
    return { ok: true };
  } catch (err) {
    console.error('[email] send error', err.message);
    return { ok: false, error: 'email_transport_error' };
  }
}

// เทียบเท่า normalizeEmail ฝั่งเว็บ (db/orgMembers.js) — ต้องตรงกันเป๊ะ ไม่งั้นหา users ไม่เจอ
function normalizeEmail(e) {
  return String(e || '').trim().toLowerCase() || null;
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
}

module.exports = { sendEmail, emailConfigured, normalizeEmail, isValidEmail };
