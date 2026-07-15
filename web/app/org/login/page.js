'use client'
import { useState } from 'react'

export default function OrgLoginPage() {
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [devLink, setDevLink] = useState('')
  const [msg, setMsg] = useState('')

  async function requestMagic(e) {
    e.preventDefault()
    setSending(true); setMsg(''); setDevLink('')
    try {
      const r = await fetch('/api/org/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await r.json()
      if (!r.ok) { setMsg(data.error || 'เกิดข้อผิดพลาด'); return }
      if (data.devLink) setDevLink(data.devLink)
      else setMsg('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว')
    } catch {
      setMsg('เกิดข้อผิดพลาด')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="max-w-md mx-auto mt-10 rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6 shadow-sm">
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">เข้าสู่ระบบ</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">เข้าสู่ระบบด้วยอีเมล — ไม่ต้องมี Discord</p>

      {/* Google login เลื่อนไว้ (next-auth v4 ทำ OAuth บน instance แยก subpath ไม่ได้ — basePath ล็อกทั้ง process)
          จะกลับมาตอน unify auth เป็น instance เดียว · ตอนนี้ใช้ magic-link */}

      <form onSubmit={requestMagic} className="mt-5 space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-disc-text">อีเมล</label>
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)}
          placeholder="you@example.org"
          className="w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-bg2 px-3 py-2 text-sm text-gray-900 dark:text-disc-text"
        />
        <button
          type="submit" disabled={sending}
          className="w-full rounded-lg bg-orange py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {sending ? 'กำลังส่ง…' : 'ส่งลิงก์เข้าสู่ระบบ'}
        </button>
      </form>

      {msg && <p className="mt-3 text-sm text-gray-600 dark:text-disc-muted">{msg}</p>}
      {devLink && (
        <div className="mt-3 rounded-lg border border-orange/30 bg-orange/5 p-3 text-xs">
          <p className="mb-1 font-medium text-gray-700 dark:text-disc-text">dev: คลิกลิงก์เพื่อเข้าสู่ระบบ</p>
          <a href={devLink} className="break-all text-orange underline">{devLink}</a>
        </div>
      )}
    </div>
  )
}
