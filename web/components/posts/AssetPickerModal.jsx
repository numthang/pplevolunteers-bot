'use client'

// กล่องเลือกรูปจากคลัง — ครอบ AssetLibrary ในโหมด pick
// ใช้ 2 ที่: ปุ่ม "จากคลัง" ในกล่องสื่อของโพสต์ · เลือกพื้นหลังใน QuoteGeneratorModal
//
// ⚠️ ตัวที่หยิบรูปไปใช้จริงคือ API ฝั่ง server ที่ **คัดลอกไฟล์เป็น uuid ใหม่** — ห้ามเอา
//    path ของ asset มาใส่แถวโพสต์ตรงๆ (ดู /api/posts/[id]/media/from-asset)
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import AssetLibrary from './AssetLibrary.jsx'

export default function AssetPickerModal({ onClose, onPick }) {
  const t = useTranslations('posts.library')

  // ปิดได้ 3 ทาง (กฎ CLAUDE.md): ปุ่ม X · ESC · คลิกนอกกล่อง
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-4xl my-8 rounded-xl bg-card-bg border border-warm-200 dark:border-disc-border p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('pickTitle')}</h3>
          <button
            onClick={onClose}
            title={t('closeTitle')}
            className="w-8 h-8 flex items-center justify-center rounded-full text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            <X size={16} />
          </button>
        </div>

        <AssetLibrary mode="pick" onPick={onPick} />
      </div>
    </div>
  )
}
