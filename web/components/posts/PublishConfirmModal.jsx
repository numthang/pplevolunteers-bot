'use client'

// กล่องยืนยันก่อนสั่งเผยแพร่ — จังหวะหยุดสุดท้ายก่อนงานเข้าคิวจริง
//
// ทำไมถึงมี: ค่าเริ่มต้นลายน้ำผูกกับ "กลุ่มปลายทาง" อย่างเดียว (lib/watermarks.js `defaultFile`)
// โพสต์ประชาสัมพันธ์ที่รูปติดลายน้ำมาแล้วจึงได้ลายน้ำซ้อนทับโดยไม่มีอะไรทัก — เกิดจริงกับโพสต์ 1054
// (2026-09-07) ต้องไล่กดยกเลิกทีละใบ 5 งาน · หมวดโพสต์ก็พึ่งไม่ได้เพราะผู้ใช้ไม่ได้ตั้งทุกใบ
//
// ⚠️ บรรทัดลายน้ำคือหัวใจของกล่องนี้ ไม่ใช่รายการเฉยๆ → เน้นสี + มีปุ่มถอดลายน้ำในกล่องเลย
//    ถ้าต้องปิดกล่องออกไปแก้ dropdown แล้วกดใหม่ คนจะกดยืนยันผ่านๆ แทน (กล่องยืนยันตายด้วยความเคยชิน)
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { X, Loader2, Send, Droplet, DropletOff } from 'lucide-react'

export default function PublishConfirmModal({
  targets,          // [{ key, label }] — ชื่อแพลตฟอร์ม + บัญชีจริงต่อท้าย (คำนวณจากแผงแล้ว)
  groupName,
  watermark,        // { label, posLabel, imageCount } = จะติด · null = ไม่ติด
  hasVideo,
  imageCount,
  scheduledLabel,   // ข้อความเวลาที่ตั้งไว้ · null = โพสต์ทันที
  submitting,
  error,
  onClose,
  onRemoveWatermark,
  onConfirm,
}) {
  const t = useTranslations('posts.publishConfirm')

  // ปิดได้ 3 ทาง (กฎ CLAUDE.md): ปุ่ม X · ESC · คลิกนอกกล่อง
  // ⛔ ยกเว้นตอนกำลังส่ง — ปิดไปก็หยุดคำขอที่ยิงออกไปแล้วไม่ได้ ปล่อยให้จบก่อนชัดเจนกว่า
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !submitting) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, submitting])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={e => {
        if (submitting || e.target !== e.currentTarget) return
        // พื้นหลังนี้ scroll เอง → กดแถบ scroll ไม่ใช่การคลิกพื้นหลัง (แพทเทิร์นเดียวกับ AssetPickerModal)
        const { offsetX, offsetY } = e.nativeEvent
        if (offsetX > e.currentTarget.clientWidth || offsetY > e.currentTarget.clientHeight) return
        onClose()
      }}
    >
      <div className="w-full max-w-md my-8 rounded-xl bg-card-bg border border-warm-200 dark:border-disc-border p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('title')}</h3>
          <button
            onClick={onClose}
            disabled={submitting}
            title={t('closeTitle')}
            className="w-8 h-8 flex items-center justify-center rounded-full text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-40 transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* ปลายทาง — กางทุกใบ ไม่ยุบเป็นตัวเลข คนต้องอ่านได้ว่าใบไหนไปไหน */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-warm-700 dark:text-disc-muted">
            {t('targets', { count: targets.length })}
          </span>
          <ul className="flex flex-col gap-1">
            {targets.map(item => (
              <li
                key={item.key}
                className="text-sm text-warm-900 dark:text-disc-text rounded-lg border border-warm-200 dark:border-disc-border px-2.5 py-1.5"
              >
                {item.label}
                {groupName && <span className="text-warm-500 dark:text-disc-muted"> · {groupName}</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* ลายน้ำ — บรรทัดที่คนพลาดบ่อยที่สุด จึงเป็นบล็อกสีเดียวในกล่อง */}
        <div
          className={`flex flex-col gap-2 rounded-lg border px-3 py-2 ${
            watermark
              ? 'border-orange bg-orange/10'
              : 'border-warm-200 dark:border-disc-border'
          }`}
        >
          <span className="flex items-start gap-2 text-sm text-warm-900 dark:text-disc-text">
            {watermark ? <Droplet size={15} className="mt-0.5 shrink-0 text-orange" /> : <DropletOff size={15} className="mt-0.5 shrink-0 text-warm-500 dark:text-disc-muted" />}
            <span>
              {watermark
                ? t('watermarkOn', {
                    name: watermark.label,
                    pos: watermark.posLabel,
                    count: watermark.imageCount,
                  })
                : t('watermarkOff')}
            </span>
          </span>

          {/* แก้ได้ในกล่องเลย — ไม่ต้องปิดออกไปหา dropdown แล้วกดใหม่ */}
          {watermark && (
            <button
              onClick={onRemoveWatermark}
              disabled={submitting}
              className="self-start inline-flex items-center gap-1.5 px-2.5 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-40 transition"
            >
              <DropletOff size={13} />
              {t('removeWatermark')}
            </button>
          )}
        </div>

        {/* คลิปกินรูปทั้งโพสต์ — เตือนซ้ำตรงนี้เพราะแถบในแผงอาจถูกเลื่อนพ้นตาไปแล้ว */}
        {hasVideo && (
          <p className="text-sm rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 px-3 py-2">
            {imageCount > 0 ? t('videoDropsImages', { count: imageCount }) : t('videoPost')}
          </p>
        )}

        <p className="text-sm text-warm-900 dark:text-disc-text">
          {scheduledLabel ? t('scheduled', { time: scheduledLabel }) : t('now')}
        </p>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex items-center gap-2">
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-orange text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {t('confirm')}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-2 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-40 transition"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
