'use client'
import { useState } from 'react'
import { startRegistration } from '@simplewebauthn/browser'

export default function LinkAccountsBanner({ linkedProviders = [] }) {
  const hasLine    = linkedProviders.includes('line')
  const hasGoogle  = linkedProviders.includes('google')
  const hasPasskey = linkedProviders.includes('passkey')

  const [pkBusy, setPkBusy]   = useState(false)
  const [pkMsg, setPkMsg]     = useState(null)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed || (hasLine && hasGoogle && hasPasskey)) return null

  async function registerPasskey() {
    setPkBusy(true); setPkMsg(null)
    try {
      const optRes = await fetch('/api/link/passkey/register')
      if (!optRes.ok) throw new Error('ไม่สามารถเริ่มต้นได้')
      const options = await optRes.json()
      const attResp = await startRegistration({ optionsJSON: options })
      const verRes = await fetch('/api/link/passkey/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(attResp),
      })
      if (!verRes.ok) throw new Error((await verRes.json()).error || 'ไม่สำเร็จ')
      setPkMsg({ ok: true, text: 'ผูก Passkey สำเร็จ!' })
    } catch (err) {
      setPkMsg({ ok: false, text: err.message || 'เกิดข้อผิดพลาด' })
    }
    setPkBusy(false)
  }

  const providers = [
    {
      id: 'line',
      label: 'LINE',
      linked: hasLine,
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#06C755">
          <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
        </svg>
      ),
      action: () => window.location.href = '/api/link/line',
    },
    {
      id: 'google',
      label: 'Google',
      linked: hasGoogle,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
      action: () => window.location.href = '/api/link/google',
    },
    {
      id: 'passkey',
      label: 'Passkey',
      linked: hasPasskey || pkMsg?.ok,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" stroke="currentColor" className="text-warm-500 dark:text-disc-muted">
          <circle cx="8" cy="15" r="4"/><path d="M10.85 12A7 7 0 0 1 23 13v1"/><path d="M18 12v5"/><path d="M21 15h-6"/>
        </svg>
      ),
      action: registerPasskey,
      busy: pkBusy,
    },
  ]

  const allLinked = providers.every(p => p.linked)
  if (allLinked) return null

  return (
    <div className="bg-card-bg border border-brand-orange/30 rounded-xl px-5 py-4 relative">
      <button
        onClick={() => setDismissed(true)}
        className="absolute top-3 right-3 text-warm-400 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text transition"
        aria-label="ปิด"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>

      {/* mobile: stack, desktop: single row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-brand-orange/10 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-brand-orange">
              <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-warm-900 dark:text-disc-text">เพิ่มความปลอดภัย — ผูกบัญชี</p>
            <p className="text-xs text-warm-500 dark:text-disc-muted">login ด้วย LINE, Google หรือ Passkey โดยไม่ต้องใช้ Discord</p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto shrink-0">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={p.linked ? undefined : p.action}
              disabled={p.linked || p.busy}
              title={p.label}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                p.linked
                  ? 'border-green-500/30 bg-green-500/5 text-green-600 dark:text-green-400 cursor-default'
                  : 'border-warm-200 dark:border-disc-border bg-warm-50 dark:bg-disc-hover hover:border-brand-orange text-warm-800 dark:text-disc-text disabled:opacity-50'
              }`}
            >
              {p.icon}
              {p.label}
              {p.linked && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-green-500">
                  <path d="M5 13l4 4L19 7"/>
                </svg>
              )}
              {p.busy && <span className="text-xs text-warm-400">...</span>}
            </button>
          ))}
        </div>
      </div>

      {pkMsg && (
        <p className={`text-xs mt-2 ${pkMsg.ok ? 'text-green-500' : 'text-red-500'}`}>{pkMsg.text}</p>
      )}
    </div>
  )
}
