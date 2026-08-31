'use client'

import { useTranslations } from 'next-intl'
import { Loader2, Check } from 'lucide-react'

/**
 * ป้ายสถานะการบันทึกของหน้าเคส — บังคับมีทุกการ์ดที่ autosave (กฎ CLAUDE.md §กฎการบันทึก)
 * ไม่จองที่ว่างตอนไม่ได้เซฟ · error ค้างไว้จนกว่าจะเซฟผ่าน (ของยังอยู่ในกล่อง ไม่หาย)
 */
export default function CaseSaveBadge({ saveState, error }) {
  const t = useTranslations('case')
  if (error) return <span className="text-sm text-red-500">{error}</span>
  if (saveState === 'idle') return null
  return (
    <span className="text-sm text-gray-400 dark:text-disc-muted flex items-center gap-1.5 shrink-0">
      {saveState === 'saving' && <><Loader2 size={14} className="animate-spin" /> {t('edit.savingBadge')}</>}
      {saveState === 'saved' && <><Check size={14} className="text-green-600" /> {t('edit.savedBadge')}</>}
    </span>
  )
}
