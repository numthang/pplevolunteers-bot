'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

// ── แก้ไขข้อมูลเข้าสู่ระบบของสมาชิก (owner only) ──
// เบอร์: ต้องผ่าน OTP ที่ส่งถึงเบอร์ปลายทางจริง (owner ให้สมาชิกอ่านรหัสให้ฟัง แล้วมากรอก)
// email: owner ระบุ email ใหม่ → ระบบส่งลิงก์ยืนยันไปที่ inbox นั้น → เขียนจริงตอนสมาชิกกดลิงก์เอง
// ทั้งคู่ "พิสูจน์ว่าถึงมือเจ้าตัวจริง" ก่อนเขียนเสมอ — ไม่ใช่ owner พิมพ์แล้ว save ตรงๆ
// ใช้ร่วมกัน 2 ที่: web/components/org/OrgMembers.jsx (ค้นหาสมาชิก) และ
// web/components/org/PersonProfileModal.jsx (การ์ดโปรไฟล์คน) — ห้ามก็อปโค้ดซ้ำ
export default function IdentityEditor({ orgId, member, onNote, onPhoneBound, onEmailLinkSent }) {
  const t = useTranslations('org')
  const base = `/api/org/orgs/${orgId}/members/${member.user_id}`

  const [phone, setPhone] = useState(member.phone || '')
  const [otp, setOtp] = useState('')
  const [ref, setRef] = useState('')
  const [phoneStage, setPhoneStage] = useState('idle') // idle | sent
  const [phoneBusy, setPhoneBusy] = useState(false)

  // เติมอีเมลปัจจุบันไว้ในช่องเลย (ท่าเดียวกับ phone ข้างบน) — owner จะได้ "แก้ของเดิม" ได้
  // ไม่ใช่ต้องพิมพ์ใหม่ทั้งก้อนจากช่องว่าง และเห็นทันทีว่าตอนนี้ผูกอีเมลอะไรอยู่
  const [newEmail, setNewEmail] = useState(member.email || '')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [emailDevLink, setEmailDevLink] = useState('')

  async function sendOtp() {
    setPhoneBusy(true); onNote('')
    const r = await fetch(`${base}/phone/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }),
    })
    const d = await r.json().catch(() => ({}))
    setPhoneBusy(false)
    if (!r.ok) return onNote(d.error || t('members.identity.otpSendError'))
    setRef(d.ref); setPhoneStage('sent')
  }

  async function verifyOtp() {
    setPhoneBusy(true); onNote('')
    const r = await fetch(`${base}/phone/verify`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, otp }),
    })
    const d = await r.json().catch(() => ({}))
    setPhoneBusy(false)
    if (!r.ok) return onNote(d.error || t('members.identity.otpVerifyError'))
    setOtp(''); setPhoneStage('idle')
    onPhoneBound(phone)
    onNote(t('members.identity.phoneBoundMsg'))
  }

  async function sendEmailLink() {
    setEmailBusy(true); onNote(''); setEmailDevLink('')
    const r = await fetch(`${base}/email/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: newEmail }),
    })
    const d = await r.json().catch(() => ({}))
    setEmailBusy(false)
    if (!r.ok) return onNote(d.error || t('members.identity.emailSendError'))
    setEmailSent(true)
    // dev เท่านั้น (ไม่มี SMTP) — route คืน devLink มาให้กดทดสอบเอง ไม่งั้นเมลไม่ถูกส่งจริงและไม่มีทางกดยืนยันได้เลย
    if (d.devLink) setEmailDevLink(d.devLink)
    onEmailLinkSent()
  }

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-gray-200 dark:border-disc-border p-3">
      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-disc-text">{t('members.identity.phoneLabel')}</p>
        <p className="text-xs text-gray-400 dark:text-disc-muted">
          {member.phone_verified_at
            ? t('members.identity.phoneCurrentVerified', { phone: member.phone })
            : t('members.identity.phoneCurrentUnverified')}
        </p>
        <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('members.identity.phoneHint')}</p>
        <div className="mt-1.5 flex gap-2">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="0812345678"
            disabled={phoneStage === 'sent'}
            className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-1.5 text-xs text-gray-900 dark:text-disc-text disabled:opacity-60" />
          {phoneStage === 'idle' ? (
            <button onClick={sendOtp} disabled={phoneBusy || !phone}
              className="shrink-0 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {t('members.identity.sendOtpButton')}
            </button>
          ) : (
            <button onClick={() => setPhoneStage('idle')} className="shrink-0 text-xs text-gray-500 dark:text-disc-muted hover:underline">
              {t('members.identity.cancelButton')}
            </button>
          )}
        </div>
        {phoneStage === 'sent' && (
          <div className="mt-1.5 flex gap-2">
            <input value={otp} onChange={e => setOtp(e.target.value)}
              placeholder={t('members.identity.otpPlaceholder', { ref })}
              className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-1.5 text-xs text-gray-900 dark:text-disc-text" />
            <button onClick={verifyOtp} disabled={phoneBusy || otp.length !== 6}
              className="shrink-0 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {t('members.identity.confirmButton')}
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-gray-700 dark:text-disc-text">{t('members.identity.emailLabel')}</p>
        <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">{t('members.identity.emailHint')}</p>
        <div className="mt-1.5 flex gap-2">
          <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
            placeholder="name@example.com" disabled={emailSent}
            className="flex-1 rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-1.5 text-xs text-gray-900 dark:text-disc-text disabled:opacity-60" />
          <button onClick={sendEmailLink} disabled={emailBusy || !newEmail || emailSent}
            className="shrink-0 rounded-lg bg-orange px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
            {emailSent ? t('members.identity.linkSentButton') : t('members.identity.sendLinkButton')}
          </button>
        </div>
        {emailDevLink && (
          <div className="mt-1.5 rounded-lg border border-orange/30 bg-orange/5 p-2">
            <p className="mb-1 text-xs font-medium text-gray-700 dark:text-disc-text">{t('members.identity.emailDevLinkLabel')}</p>
            <a href={emailDevLink} className="break-all text-xs text-orange underline">{emailDevLink}</a>
          </div>
        )}
      </div>
    </div>
  )
}
