'use client'

/**
 * DeleteChoiceDialog — กล่อง "ลบ" ที่ให้เลือกเอาเองว่า **ซ่อน/เก็บเข้ากรุ** หรือ **ลบถาวร**
 *
 * ลอกทรงจาก `components/posts/PostsHome.jsx` (กล่อง "ลบโพสต์") ตามที่ user สั่ง 2026-08-18
 * — ปุ่มเดียวในเมนู แล้วมาเลือกในกล่อง **ไม่บังคับให้ซ่อนก่อนแล้วค่อยลบ** (ของเดิมทำแบบนั้นแล้วงง)
 *
 * ⭐ ด่านกันพลาดคือ **ตัวเลขจริงในกล่อง** ไม่ใช่การจำกัดสิทธิ์หรือการบังคับ 2 จังหวะ
 *    (เส้นแบ่งลอก Notion: ย้อนได้ = ทุกคน · ย้อนไม่ได้ = admin — ดู md/kanban/KANBAN.md §ลบถาวร)
 *
 * ปุ่ม "ลบถาวร" โผล่เฉพาะ canPurge=true — คนอื่นเห็นแค่ซ่อน/ยกเลิก ไม่ใช่กดแล้วเด้ง 403
 * ปิดได้ 3 ทางตามกฎบ้าน: ปุ่ม X · ESC · คลิกนอกกล่อง
 */

import { useEffect } from 'react'
import { Loader2, X } from 'lucide-react'

export default function DeleteChoiceDialog({
  title,          // ชื่อของที่จะลบ (โชว์ในเครื่องหมายคำพูด)
  heading,        // หัวกล่อง เช่น "ลบช่องข้อมูล" / "ลบการบ้าน"
  impact,         // บรรทัดบอกความเสียหายจริง — null = ไม่มีตัวเลขให้โชว์
  hideLabel,      // ป้ายปุ่มทางเลือกที่ย้อนได้ เช่น "ซ่อน" / "เก็บเข้ากรุ"
  hideHint,       // อธิบายว่าซ่อนแล้วเป็นยังไง
  canPurge,
  busy,
  error,
  onHide,
  onPurge,
  onClose,
  t,
}) {
  /**
   * ⚠️ **ต้องดัก capture (`true`) + `stopPropagation`** — กล่องนี้ซ้อนอยู่ใน CardModal ซึ่งมี ESC
   *    listener ของตัวเองบน window เหมือนกัน และ **ของ CardModal ถูกผูกก่อน (mount ก่อน)**
   *    → ถ้าใช้ bubble ตามปกติ ของ CardModal จะทำงานก่อน = กด ESC ทีเดียวปิดทั้งกล่องนี้และการ์ดข้างหลัง
   *    capture ทำงานก่อน bubble เสมอไม่ว่าผูกทีหลังแค่ไหน จึงกิน ESC ไว้เองได้ (2026-08-20)
   */
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
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 w-full max-w-md flex flex-col gap-3"
      >
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">{heading}</h2>
          <button
            onClick={onClose}
            aria-label={t('actions.cancel')}
            className="p-1 rounded-lg text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-base text-warm-700 dark:text-disc-text break-words">“{title}”</p>

        {/* ตัวเลขจริงต้องมาก่อนคำอธิบาย — คนอ่านบรรทัดแรกแล้วกด */}
        {impact && <p className="text-sm text-red-500 font-medium break-words">{impact}</p>}
        <p className="text-sm text-warm-500 dark:text-disc-muted">{hideHint}</p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex flex-wrap gap-2 justify-end mt-1">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50"
          >
            {t('actions.cancel')}
          </button>
          {canPurge && (
            <button
              onClick={onPurge}
              disabled={busy}
              className="px-4 py-2 text-sm rounded-lg border border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-disc-hover disabled:opacity-50"
            >
              {t('actions.purge')}
            </button>
          )}
          <button
            onClick={onHide}
            disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-teal text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {hideLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
