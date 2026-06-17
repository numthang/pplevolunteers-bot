'use client'
import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { startAuthentication } from '@simplewebauthn/browser'

export default function LoginButton() {
  const [busy, setBusy] = useState(false)
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
      await signIn('passkey', { nonce, callbackUrl: '/' })
    } catch (err) {
      setPkError(err.message || 'ไม่สำเร็จ กรุณาลองใหม่')
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => signIn('discord', { callbackUrl: '/' })}
        className="inline-flex items-center gap-2.5 bg-brand-orange hover:bg-brand-orange-light active:bg-brand-orange-dark text-white font-semibold px-7 py-3.5 rounded-xl transition-colors text-base shadow-lg"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
          <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
        </svg>
        เข้าสู่ระบบด้วย Discord
      </button>

      <div className="flex items-center gap-2">
        <div className="h-px w-10 bg-warm-200 dark:bg-disc-border" />
        <span className="text-xs text-warm-400 dark:text-disc-muted">หรือ</span>
        <div className="h-px w-10 bg-warm-200 dark:bg-disc-border" />
      </div>

      <div className="flex items-center gap-3">
        {/* LINE */}
        <button
          onClick={() => signIn('line', { callbackUrl: '/' })}
          title="Continue with LINE"
          className="w-10 h-10 rounded-full border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover flex items-center justify-center transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#06C755">
            <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
          </svg>
        </button>

        {/* Google */}
        <button
          onClick={() => signIn('google', { callbackUrl: '/' })}
          title="Continue with Google"
          className="w-10 h-10 rounded-full border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover flex items-center justify-center transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        </button>

        {/* Passkey */}
        <button
          onClick={loginWithPasskey}
          disabled={busy}
          title="Continue with Passkey"
          className="w-10 h-10 rounded-full border border-warm-200 dark:border-disc-border bg-card-bg hover:bg-warm-50 dark:hover:bg-disc-hover flex items-center justify-center transition-colors disabled:opacity-40"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" className="text-warm-500 dark:text-disc-muted">
            <circle cx="8" cy="15" r="4"/><path d="M10.85 12A7 7 0 0 1 23 13v1"/><path d="M18 12v5"/><path d="M21 15h-6"/>
          </svg>
        </button>
      </div>

      {pkError && <p className="text-xs text-red-500 dark:text-red-400">{pkError}</p>}
    </div>
  )
}
