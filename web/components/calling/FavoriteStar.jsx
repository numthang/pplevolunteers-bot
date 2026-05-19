'use client'

import { useState } from 'react'

const STAR_PATH = 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.601a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z'

export default function FavoriteStar({
  memberId,
  contactType = 'member',
  initialActive = false,
  size = 'md',
  onChange,
}) {
  const [active, setActive] = useState(initialActive)
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(false)

  const px = { sm: 18, md: 22, lg: 28 }[size] || 22
  const gid = `sg-${memberId}-${contactType}`

  const toggle = async (e) => {
    e.stopPropagation()
    e.preventDefault()
    if (busy || !memberId) return
    setBusy(true)
    const next = !active
    setActive(next)
    if (next) { setPop(true); setTimeout(() => setPop(false), 110) }
    try {
      if (next) {
        await fetch('/api/calling/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId: String(memberId), contactType }),
        })
      } else {
        const params = new URLSearchParams({ memberId: String(memberId), contactType })
        await fetch(`/api/calling/favorites?${params}`, { method: 'DELETE' })
      }
      onChange?.(next)
    } catch (err) {
      setActive(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy || !memberId}
      title={active ? 'เอาออกจาก Favorites' : 'เพิ่มเข้า Favorites'}
      className={`inline-flex items-center justify-center ${busy ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
      style={{
        transform: pop ? 'scale(1.5)' : 'scale(1)',
        transition: pop
          ? 'transform 0.08s ease-out'
          : 'transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1)',
        filter: active
          ? `drop-shadow(0 0 ${Math.round(px * 0.28)}px rgba(251,191,36,0.9))`
          : 'none',
      }}
    >
      <svg width={px} height={px} viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id={gid} x1="0.5" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path
          d={STAR_PATH}
          fill={active ? `url(#${gid})` : 'none'}
          stroke={active ? '#d97706' : '#9ca3af'}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transition: 'fill 0.15s ease, stroke 0.15s ease' }}
        />
      </svg>
    </button>
  )
}
