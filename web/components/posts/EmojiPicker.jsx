'use client'

// ปุ่มแทรกอิโมจิใน PostEditor — ชุดคัดมาเอง ไม่ใช้ lib ภายนอก (โปรเจกต์นี้แปะอิโมจิตรงๆ อยู่แล้ว
// เช่น label ข้อเสนอ AI ใน PostEditor.jsx) กันโหลดชุดอิโมจิเต็มรูปแบบที่หนักเกินความจำเป็น
import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'

const GROUPS = [
  {
    label: 'อารมณ์',
    emoji: [
      '😀', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍', '😘', '😎', '🤩', '🥰', '😇',
      '🤔', '🙄', '😏', '😅', '😬', '🥺', '😢', '😭', '😡', '😤', '😱', '🥵', '🥶',
      '😴', '🤗', '🥳', '🙏', '👀',
    ],
  },
  {
    label: 'มือ/ท่าทาง',
    emoji: ['👍', '👎', '👏', '🙌', '💪', '✌️', '🤝', '👋', '🤙', '🖐️', '✊', '🤲', '✅', '❌'],
  },
  {
    label: 'หัวใจ/สัญลักษณ์',
    emoji: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💖', '💗',
      '⭐', '🔥', '✨', '💯', '🎉', '❗', '❓', '‼️', '➡️', '✔️',
    ],
  },
  {
    label: 'งาน/สื่อ',
    emoji: [
      '📢', '📣', '📌', '📝', '📸', '🎥', '🎤', '🎙️', '🔗', '📅', '⏰', '📍',
      '📊', '📈', '💻', '📱', '📄', '🔍',
    ],
  },
  {
    label: 'กิจกรรม/ธง',
    emoji: ['🎊', '🎈', '🎁', '🏆', '🥇', '🎗️', '🚩', '🏳️', '🇹🇭', '🗳️', '🏛️', '🤝'],
  },
  {
    label: 'ธรรมชาติ/อื่นๆ',
    emoji: ['☀️', '⛅', '🌧️', '⛈️', '🌈', '🌙', '🌊', '🌱', '🌳', '🍀', '☕', '🎂'],
  },
]

export default function EmojiPicker({ onPick }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // ปิดได้ 3 ทาง — ปุ่ม (toggle) / ESC / คลิกนอกกล่อง (ตามแพทเทิร์น OrgSwitcherMenu.jsx)
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="แทรกอิโมจิ"
        className={`flex items-center justify-center h-9 w-9 rounded-lg border border-warm-200 dark:border-disc-border transition ${
          open ? 'bg-warm-100 dark:bg-disc-hover text-teal' : 'text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover'
        }`}
      >
        <Smile size={16} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-30 w-72 max-h-72 overflow-y-auto rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg shadow-lg p-2.5 flex flex-col gap-2">
          {GROUPS.map(g => (
            <div key={g.label} className="flex flex-col gap-1">
              <span className="text-xs text-warm-400 dark:text-disc-muted">{g.label}</span>
              <div className="grid grid-cols-8 gap-0.5">
                {g.emoji.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => onPick(e)}
                    className="h-8 w-8 flex items-center justify-center text-lg rounded-lg hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
