import nodemailer from 'nodemailer'

// Email transport — SMTP (nodemailer) + dev stub fallback
// ใส่ env แล้วส่งจริงทันที · ไม่ใส่ = stub (log เนื้อหาเฉยๆ พฤติกรรมเดิม) → เดฟไม่ต้องตั้ง SMTP
//
// Gmail: SMTP_HOST=smtp.gmail.com · SMTP_PORT=465 · SMTP_USER=you@gmail.com
//        SMTP_PASS=<App Password 16 หลัก> (ต้องเปิด 2FA แล้วสร้าง App Password — ไม่ใช่รหัสผ่านปกติ)
//        EMAIL_FROM="PLATFOR{m} <you@gmail.com>" (ไม่ใส่ = ใช้ SMTP_USER)
let _tx = null
function transporter() {
  if (_tx) return _tx
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_USER || !SMTP_PASS) return null
  const port = Number(SMTP_PORT) || 465
  _tx = nodemailer.createTransport({
    host: SMTP_HOST || 'smtp.gmail.com',
    port,
    secure: port === 465, // 465 = SSL · 587 = STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  return _tx
}

export async function sendEmail({ to, subject, html, text }) {
  const tx = transporter()
  if (!tx) {
    // eslint-disable-next-line no-console
    console.log(`[email:stub] to=${to} · subject=${subject}\n${text || html}`)
    return { ok: true, stubbed: true }
  }
  try {
    const from = process.env.EMAIL_FROM || process.env.SMTP_USER
    await tx.sendMail({ from, to, subject, html, text })
    return { ok: true }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[email] send error', err)
    return { ok: false, error: 'email_transport_error' }
  }
}
