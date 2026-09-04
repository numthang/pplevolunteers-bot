'use client'

import { useState, useCallback, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import Cropper from 'react-easy-crop'
import { X, RotateCw, ZoomIn } from 'lucide-react'

function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img))
    img.addEventListener('error', reject)
    img.src = url
  })
}

/** crop + rotate ภาพตาม croppedAreaPixels → JPEG blob */
async function getCroppedBlob(src, area, rotation = 0) {
  const image = await createImage(src)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const rot = (rotation * Math.PI) / 180

  const bW = Math.abs(Math.cos(rot) * image.width) + Math.abs(Math.sin(rot) * image.height)
  const bH = Math.abs(Math.sin(rot) * image.width) + Math.abs(Math.cos(rot) * image.height)
  canvas.width = bW
  canvas.height = bH
  ctx.translate(bW / 2, bH / 2)
  ctx.rotate(rot)
  ctx.translate(-image.width / 2, -image.height / 2)
  ctx.drawImage(image, 0, 0)

  const data = ctx.getImageData(area.x, area.y, area.width, area.height)
  canvas.width = area.width
  canvas.height = area.height
  ctx.putImageData(data, 0, 0)

  return new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/jpeg', 0.9))
}

/** ครอบรูปเอง — แทน auto-crop (cv2 edge detection) เดิมที่เบี้ยวบ่อย (เคาะ 2026-09-04) */
export default function DocImageCropper({ src, onCancel, onCropped }) {
  const t = useTranslations('docs')
  const [crop, setCrop]         = useState({ x: 0, y: 0 })
  const [zoom, setZoom]         = useState(1)
  const [rotate90, setRotate90] = useState(0)   // ปุ่มหมุน 90° — แก้ไฟล์วางผิดด้าน
  const [fineRotate, setFineRotate] = useState(0) // slider ±45° — แก้ภาพเบี้ยว/เอียง
  const rotation = rotate90 + fineRotate
  const [aspect, setAspect]     = useState(null)
  const [areaPixels, setAreaPixels] = useState(null)
  const [busy, setBusy]         = useState(false)

  // อัตราส่วนกรอบเริ่มต้น = อัตราส่วนรูปจริง (ให้ผู้ใช้ซูม/เลื่อนเองแบบอิสระ ไม่ล็อกสัดส่วนตายตัว)
  useEffect(() => {
    let cancelled = false
    createImage(src).then(img => { if (!cancelled) setAspect((img.naturalWidth || 1) / (img.naturalHeight || 1)) })
    return () => { cancelled = true }
  }, [src])

  const onComplete = useCallback((_area, areaPx) => setAreaPixels(areaPx), [])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onCancel])

  async function confirm() {
    if (!areaPixels) return
    setBusy(true)
    try {
      const blob = await getCroppedBlob(src, areaPixels, rotation)
      onCropped(blob)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-disc-border">
          <h2 className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('projectView.act.cropper.title')}</h2>
          <button type="button" onClick={onCancel} className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition">
            <X size={18} />
          </button>
        </div>

        <div className="relative h-[360px] bg-black">
          {aspect && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={r => setFineRotate(r - rotate90)}
              onCropComplete={onComplete}
              showGrid
            />
          )}
        </div>

        <div className="px-5 py-3 space-y-3">
          <p className="text-xs text-warm-500 dark:text-disc-muted">
            {t('projectView.act.cropper.instructions')}
          </p>
          <div className="flex items-center gap-2">
            <ZoomIn size={16} className="text-warm-400 dark:text-disc-muted shrink-0" />
            <input
              type="range" min={1} max={4} step={0.01}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="flex-1 accent-orange"
            />
            <button
              type="button"
              onClick={() => setRotate90(r => (r + 90) % 360)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm rounded-lg border border-warm-200 dark:border-disc-border text-warm-600 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover transition shrink-0"
            >
              <RotateCw size={14} /> {t('projectView.act.cropper.rotateButton')}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-warm-400 dark:text-disc-muted shrink-0 w-14">{t('projectView.act.cropper.fineRotateLabel')}</span>
            <input
              type="range" min={-45} max={45} step={0.5}
              value={fineRotate}
              onChange={e => setFineRotate(Number(e.target.value))}
              className="flex-1 accent-orange"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-base text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text transition">
            {t('projectView.act.cropper.cancelButton')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !areaPixels}
            className="px-5 py-2 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light disabled:opacity-50 transition"
          >
            {busy ? t('projectView.act.cropper.processing') : t('projectView.act.cropper.useThisPhoto')}
          </button>
        </div>
      </div>
    </div>
  )
}
