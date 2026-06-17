'use client'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import Image from 'next/image'
import { startAuthentication } from '@simplewebauthn/browser'

const ERROR_MESSAGES = {
  NotLinked: 'บัญชีนี้ยังไม่ได้ผูกกับระบบ — กรุณา login ด้วย Discord ก่อน',
  OAuthSignin: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
  OAuthCallback: 'เกิดข้อผิดพลาด กรุณาลองใหม่',
}

function ProviderButton({ onClick, disabled, icon, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative w-full flex items-center px-4 py-2.5 rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover text-warm-900 dark:text-disc-text text-sm font-medium transition-colors disabled:opacity-40"
    >
      <span className="absolute left-4 flex items-center">{icon}</span>
      <span className="flex-1 text-center">{label}</span>
    </button>
  )
}

function LoginForm() {
  const searchParams  = useSearchParams()
  const callbackUrl   = searchParams.get('callbackUrl') || '/dashboard'
  const errorKey      = searchParams.get('error') || ''
  const [busy, setBusy]     = useState(false)
  const [pkError, setPkError] = useState(null)

  async function loginWithPasskey() {
    setBusy(true); setPkError(null)
    try {
      const optRes = await fetch('/api/link/passkey/authenticate')
      const { challengeKey, ...options } = await optRes.json()
      const authResp = await startAuthentication({ optionsJSON: options })
      const verRes = await fetch('/api/link/passkey/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...authResp, challengeKey }),
      })
      if (!verRes.ok) throw new Error((await verRes.json()).error)
      const { nonce } = await verRes.json()
      await signIn('passkey', { nonce, callbackUrl })
    } catch (err) {
      setPkError(err.message || 'ไม่สำเร็จ กรุณาลองใหม่')
    }
    setBusy(false)
  }

  const errorMsg = errorKey ? (ERROR_MESSAGES[errorKey] || 'เกิดข้อผิดพลาด') : null

  return (
    <div className="min-h-screen flex flex-col items-start justify-start bg-warm-50 dark:bg-[#0a0a0a] px-4 pt-16">
      <div className="w-full max-w-[360px] flex flex-col items-center mx-auto">
        {/* Logo + title */}
        <Image src="/logo.png" alt="PPLE" width={120} height={120} className="rounded-3xl mb-6" />
        <h1 className="text-warm-900 dark:text-disc-text text-2xl font-bold mb-1">เข้าสู่ระบบ</h1>
        <p className="text-warm-500 dark:text-disc-muted text-base mb-8">PPLE Volunteers</p>

        {errorMsg && (
          <div className="w-full mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <div className="w-full flex flex-col gap-2.5">
          <ProviderButton
            onClick={() => signIn('discord', { callbackUrl })}
            label="Continue with Discord"
            icon={
              <svg width="18" height="18" viewBox="0 0 127.14 96.36" fill="#5865F2">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
              </svg>
            }
          />

          <ProviderButton
            onClick={() => signIn('line', { callbackUrl })}
            label="Continue with LINE"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#06C755">
                <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
              </svg>
            }
          />

          <ProviderButton
            onClick={() => signIn('google', { callbackUrl })}
            label="Continue with Google"
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            }
          />

          <div className="flex items-center gap-3 my-1">
            <div className="flex-1 h-px bg-warm-200 dark:bg-disc-border" />
            <span className="text-warm-400 dark:text-disc-muted text-xs">หรือ</span>
            <div className="flex-1 h-px bg-warm-200 dark:bg-disc-border" />
          </div>

          <ProviderButton
            onClick={loginWithPasskey}
            disabled={busy}
            label={busy ? 'กำลังยืนยัน...' : 'Continue with Passkey'}
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" className="text-warm-400 dark:text-disc-muted">
                <circle cx="8" cy="15" r="4"/><path d="M10.85 12A7 7 0 0 1 23 13v1"/><path d="M18 12v5"/><path d="M21 15h-6"/>
              </svg>
            }
          />

          {pkError && <p className="text-xs text-red-500 dark:text-red-400 text-center">{pkError}</p>}
        </div>

        <p className="mt-8 text-warm-400 dark:text-disc-muted text-xs text-center">
          LINE / Google ต้องผูกบัญชีผ่าน Discord ก่อน
        </p>
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
