'use client'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'

function LoginForm() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const [qrUrl, setQrUrl] = useState('')

  useEffect(() => {
    const base = window.location.origin
    const encoded = encodeURIComponent(callbackUrl)
    setQrUrl(`${base}/api/auth/signin/discord?callbackUrl=${encoded}`)
  }, [callbackUrl])

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-8 text-center w-80">
        <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">เข้าสู่ระบบ</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">ใช้บัญชี Discord ของคุณ</p>

        <button
          onClick={() => signIn('discord', { callbackUrl })}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          เข้าสู่ระบบด้วย Discord
        </button>

        {qrUrl && (
          <div className="mt-5 flex flex-col items-center gap-2">
            <div className="bg-white p-3 rounded-lg inline-block">
              <QRCodeSVG value={qrUrl} size={180} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              จำรหัสไม่ได้? สแกน QR ด้วยมือถือ<br/>แล้วกด Authorize ใน Discord app
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
