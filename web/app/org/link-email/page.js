'use client'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

// landing ของลิงก์ยืนยัน email ที่ owner ส่งให้สมาชิก — คลิกแล้วเขียน email จริง (พิสูจน์เข้าถึง inbox)
// อ่าน token จาก window.location (client) เลี่ยง useSearchParams ที่ต้อง Suspense boundary
export default function LinkEmailPage() {
  const t = useTranslations('org')
  const [state, setState] = useState('working') // working | ok | error
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setState('error'); setMsg(t('linkEmail.invalidLinkMsg')); return }
    fetch('/api/org/link-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
    })
      .then(async r => {
        const d = await r.json().catch(() => ({}))
        if (r.ok) setState('ok')
        else { setState('error'); setMsg(d.error || t('linkEmail.invalidLinkMsg')) }
      })
      .catch(() => { setState('error'); setMsg(t('linkEmail.invalidLinkMsg')) })
  }, [t])

  return (
    <div className="max-w-md mx-auto mt-16 text-center">
      {state === 'working' && <p className="text-gray-600 dark:text-disc-muted">{t('linkEmail.workingMsg')}</p>}
      {state === 'ok' && <p className="text-gray-800 dark:text-disc-text">{t('linkEmail.successMsg')}</p>}
      {state === 'error' && <p className="text-red-accent">{msg}</p>}
    </div>
  )
}
