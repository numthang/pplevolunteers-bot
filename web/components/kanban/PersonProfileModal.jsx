'use client'

/**
 * PersonProfileModal — กล่องลอยแบบดิสคอร์ด เปิดตอนกดชื่อเจ้าภาพ/คนช่วยในการ์ด
 *
 * ก้อนแรกของ "การ์ดโปรไฟล์คน" (md/PENDING.md §👤) — โชว์ข้อมูลคร่าวๆ เท่านั้น
 * ⛔ ยังไม่มีกล่องแชท/DM ผ่านบอทรอบนี้ (user เคาะ 2026-08-20: บอทกับเว็บยังไม่มีเส้นเชื่อมกัน ทำก้อนถัดไป)
 *
 * ปิดได้ 3 ทางตามกฎบ้าน: ปุ่ม X · ESC · คลิกนอกกล่อง (ลอกทรงจาก DeleteChoiceDialog.jsx)
 */

import { useEffect, useState } from 'react'
import { Loader2, X } from 'lucide-react'

export default function PersonProfileModal({ userId, onClose, t }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    fetch(`/api/kanban/people/${userId}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}))
        if (!alive) return
        if (!res.ok) { setError(json.error || t('loadFailed')); return }
        setProfile(json.profile)
      })
      .catch(() => { if (alive) setError(t('loadFailed')) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [userId, t])

  // ⚠️ capture + stopPropagation ด้วยเหตุผลเดียวกับ DeleteChoiceDialog — กล่องนี้ซ้อนอยู่ใน CardModal
  //    ที่มี ESC listener ผูกไว้ก่อน ถ้าใช้ bubble จะกด ESC ทีเดียวปิดทั้งโปรไฟล์และการ์ดข้างหลัง
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 w-full max-w-sm flex flex-col gap-3"
      >
        <div className="flex items-start justify-end">
          <button
            onClick={onClose}
            aria-label={t('actions.cancel')}
            className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
          >
            <X size={18} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={20} className="animate-spin text-warm-400 dark:text-disc-muted" />
          </div>
        )}

        {!loading && error && <p className="text-sm text-red-500 text-center py-4">{error}</p>}

        {!loading && !error && profile && (
          <div className="flex flex-col items-center gap-2 -mt-4">
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-warm-100 dark:bg-disc-hover flex items-center justify-center text-xl font-semibold text-warm-500 dark:text-disc-muted">
                {(profile.name || '?').charAt(0)}
              </div>
            )}

            <div className="text-center">
              <p className="text-lg font-semibold text-warm-900 dark:text-disc-text">{profile.name}</p>
              {profile.username && profile.username !== profile.name && (
                <p className="text-sm text-warm-400 dark:text-disc-muted">@{profile.username}</p>
              )}
            </div>

            {profile.roles?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 justify-center">
                {profile.roles.map((r) => (
                  <span
                    key={r}
                    className="px-2.5 py-0.5 text-xs font-medium rounded-md border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text"
                  >
                    {r}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm text-warm-500 dark:text-disc-muted mt-1">
              {t('modal.profileCardCount', { count: Number(profile.cardCount) })}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
