'use client'
import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useTranslations } from 'next-intl'

// magic-link landing — อ่าน token จาก URL แล้วแลก session ผ่าน credentials 'magic' (auth หลัก)
// อ่านจาก window.location (client) เลี่ยง useSearchParams ที่ต้อง Suspense boundary
export default function OrgVerifyPage() {
  const t = useTranslations('org')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) { setFailed(true); return }
    // callbackUrl ต้องเป็น path ภายในเท่านั้น (กัน open-redirect) · ไม่มี/ไม่ปลอดภัย → /org
    const cb = params.get('callbackUrl')
    const dest = cb && /^\/(?![/\\])/.test(cb) ? cb : '/org'
    signIn('magic', { token, redirect: false })
      .then(res => { if (res?.ok) window.location.href = dest; else setFailed(true) })
      .catch(() => setFailed(true))
  }, [])

  return (
    <div className="max-w-md mx-auto mt-16 text-center">
      {failed ? (
        <>
          <p className="text-gray-800 dark:text-disc-text">{t('verify.invalidLinkMsg')}</p>
          <a href="/org/login" className="mt-3 inline-block text-sm text-orange underline">{t('verify.backToLoginLink')}</a>
        </>
      ) : (
        <p className="text-gray-600 dark:text-disc-muted">{t('verify.signingInMsg')}</p>
      )}
    </div>
  )
}
