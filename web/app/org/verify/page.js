'use client'
import { useEffect, useState } from 'react'
import { orgSignIn } from '@/lib/orgSignIn.js'

// magic-link landing — อ่าน token จาก URL แล้วแลก session ผ่าน credentials 'magic'
// อ่านจาก window.location (client) เลี่ยง useSearchParams ที่ต้อง Suspense boundary
export default function OrgVerifyPage() {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) { setFailed(true); return }
    orgSignIn('magic', { token, callbackUrl: '/org' }).catch(() => setFailed(true))
  }, [])

  return (
    <div className="max-w-md mx-auto mt-16 text-center">
      {failed ? (
        <>
          <p className="text-gray-800 dark:text-disc-text">ลิงก์ไม่ถูกต้องหรือหมดอายุ</p>
          <a href="/org/login" className="mt-3 inline-block text-sm text-orange underline">กลับไปเข้าสู่ระบบ</a>
        </>
      ) : (
        <p className="text-gray-600 dark:text-disc-muted">กำลังเข้าสู่ระบบ…</p>
      )}
    </div>
  )
}
