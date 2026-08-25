'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { X, Upload, Loader2, AlertTriangle, UserPlus } from 'lucide-react'
import IdCardCropper from './IdCardCropper'

const inputCls = 'h-8 w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text text-sm rounded px-2 focus:outline-none focus:ring-1 focus:ring-orange'
const labelCls = 'text-xs text-warm-600 dark:text-disc-text mb-1 block'

const EMPTY = {
  payee_type: 'person', title: '', first_name: '', last_name: '', entity_name: '',
  id_number: '', house_no: '', moo: '', road: '', subdistrict: '', district: '',
  province: '', zip_code: '', phone: '',
}

// ชื่อที่พิมพ์ค้างในช่องค้นหา — พาเข้ามาเป็นค่าตั้งต้น ไม่ต้องพิมพ์ซ้ำ
function seedName(base, name) {
  const parts = String(name || '').trim().split(/\s+/)
  if (!parts[0]) return base
  return { ...base, first_name: parts[0], last_name: parts.slice(1).join(' ') }
}

/**
 * เพิ่มผู้รับเงินคนนอก — ถ่ายบัตร → OCR เติมฟอร์มให้ → ตรวจ → กดบันทึก
 *
 * กฎ Create (CLAUDE.md): ไม่สร้างแถวใน DB จนกว่าจะกดบันทึก · OCR แค่เติมฟอร์ม ไม่แตะ DB
 * รูปบัตรถูกอัปหลังสร้างแถวเสร็จ (ต้องมี id ก่อนถึงจะรู้ว่าเก็บให้ใคร)
 */
export default function ExternalPayeeModal({ initialName = '', onClose, onCreated }) {
  const t = useTranslations('docs')
  const [form, setForm]       = useState(() => seedName(EMPTY, initialName))
  const [cropSrc, setCropSrc] = useState(null)
  const [cardBlob, setCardBlob] = useState(null)
  const [cardUrl, setCardUrl] = useState(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)
  const [idWarn, setIdWarn]   = useState(false)
  const [existing, setExisting] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  function pickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setErr(null)
    setCropSrc(URL.createObjectURL(f))
    e.target.value = ''
  }

  async function onCropped(blob) {
    setCropSrc(null)
    setCardBlob(blob)
    setCardUrl(URL.createObjectURL(blob))
    setReading(true)
    setErr(null)
    setExisting(null)
    try {
      const fd = new FormData()
      fd.append('file', blob, 'idcard.jpg')
      const res = await fetch('/api/docs/external-payees/ocr', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('externalPayee.readFailed'))
      // ค่าที่อ่านได้ = ค่าตั้งต้นให้ตรวจ ไม่ใช่ความจริง — ทุกช่องยังแก้ได้
      setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(d.data).map(([k, v]) => [k, v ?? ''])) }))
      setIdWarn(!!d.data.id_number && !d.idValid)
      if (d.existing) setExisting(d.existing)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setReading(false)
    }
  }

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch('/api/docs/external-payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) {
        if (res.status === 409 && d.existing) { setExisting(d.existing); return }
        throw new Error(d.error || t('externalPayee.saveFailed'))
      }
      // แนบสำเนาบัตรหลังได้ id — ล้มตรงนี้ไม่ควรทิ้งคนที่สร้างสำเร็จแล้ว แค่เตือน
      if (cardBlob) {
        const fd = new FormData()
        fd.append('file', cardBlob, 'idcard.jpg')
        await fetch(`/api/docs/external-payees/${d.data.id}/id-card`, { method: 'POST', body: fd })
          .catch(() => {})
      }
      onCreated(d.data)
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  const isEntity = form.payee_type === 'entity'
  const canSave = !saving && !reading && (isEntity ? !!form.entity_name.trim()
                                                   : !!form.first_name.trim() && !!form.last_name.trim())

  if (cropSrc) return <IdCardCropper src={cropSrc} onCancel={() => setCropSrc(null)} onCropped={onCropped} />

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-disc-border">
          <h2 className="flex items-center gap-2 text-base font-semibold text-warm-900 dark:text-disc-text">
            <UserPlus size={18} className="text-orange shrink-0" />
            {t('externalPayee.title')}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* ถ่ายบัตร → เติมฟอร์มให้ */}
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reading}
              className="w-full border border-dashed border-warm-200 dark:border-disc-border rounded-lg py-6 flex flex-col items-center gap-2 text-warm-500 dark:text-disc-muted hover:border-orange hover:text-orange transition disabled:opacity-50"
            >
              {reading
                ? <><Loader2 size={20} className="animate-spin" />{t('externalPayee.reading')}</>
                : <><Upload size={20} />{cardUrl ? t('externalPayee.retake') : t('externalPayee.uploadCard')}</>}
            </button>
            {cardUrl && <img src={cardUrl} alt="" className="mt-2 rounded-lg max-h-32 mx-auto" />}
            <p className="mt-1.5 text-xs text-warm-400 dark:text-disc-muted">{t('externalPayee.uploadHint')}</p>
          </div>

          {existing && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-3 text-sm">
              <p className="text-amber-800 dark:text-amber-300">{t('externalPayee.alreadyExists')}</p>
              <button type="button" onClick={() => onCreated(existing)} className="mt-2 text-orange hover:underline">
                {t('externalPayee.useExisting', { name: existing.entity_name || `${existing.first_name || ''} ${existing.last_name || ''}`.trim() })}
              </button>
            </div>
          )}

          {idWarn && (
            <p className="flex items-start gap-1.5 text-sm text-red-accent">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              {t('externalPayee.idChecksumWarning')}
            </p>
          )}

          <div className="flex gap-2">
            {['person', 'entity'].map(k => (
              <button
                key={k}
                type="button"
                onClick={() => setForm(f => ({ ...f, payee_type: k }))}
                className={`px-3 py-1 rounded-full text-sm transition ${form.payee_type === k
                  ? 'bg-orange text-white'
                  : 'bg-warm-100 text-warm-600 dark:bg-disc-hover dark:text-disc-text'}`}
              >
                {t(`externalPayee.type.${k}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isEntity ? (
              <Field className="col-span-2" label={t('externalPayee.fields.entityName')} value={form.entity_name} onChange={v => setForm(f => ({ ...f, entity_name: v }))} />
            ) : (
              <>
                <Field label={t('externalPayee.fields.title')}     value={form.title}      onChange={v => setForm(f => ({ ...f, title: v }))} />
                <Field label={t('externalPayee.fields.firstName')} value={form.first_name} onChange={v => setForm(f => ({ ...f, first_name: v }))} />
                <Field label={t('externalPayee.fields.lastName')}  value={form.last_name}  onChange={v => setForm(f => ({ ...f, last_name: v }))} />
              </>
            )}
            <Field label={t('externalPayee.fields.idNumber')} value={form.id_number} onChange={v => { setForm(f => ({ ...f, id_number: v })); setIdWarn(false) }} />
            <Field label={t('externalPayee.fields.houseNo')}     value={form.house_no}    onChange={v => setForm(f => ({ ...f, house_no: v }))} />
            <Field label={t('externalPayee.fields.moo')}         value={form.moo}         onChange={v => setForm(f => ({ ...f, moo: v }))} />
            <Field label={t('externalPayee.fields.road')}        value={form.road}        onChange={v => setForm(f => ({ ...f, road: v }))} />
            <Field label={t('externalPayee.fields.subdistrict')} value={form.subdistrict} onChange={v => setForm(f => ({ ...f, subdistrict: v }))} />
            <Field label={t('externalPayee.fields.district')}    value={form.district}    onChange={v => setForm(f => ({ ...f, district: v }))} />
            <Field label={t('externalPayee.fields.province')}    value={form.province}    onChange={v => setForm(f => ({ ...f, province: v }))} />
            <Field label={t('externalPayee.fields.zipCode')}     value={form.zip_code}    onChange={v => setForm(f => ({ ...f, zip_code: v }))} />
            {/* บัตรไม่มีเบอร์โทร — ช่องเดียวที่ต้องพิมพ์เองเสมอ */}
            <Field label={t('externalPayee.fields.phone')}       value={form.phone}       onChange={v => setForm(f => ({ ...f, phone: v }))} />
          </div>

          {err && <p className="text-sm text-red-accent">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-base text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text transition">
            {t('externalPayee.cancel')}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="px-4 py-2 text-base rounded-lg bg-orange text-white hover:bg-orange-light transition disabled:opacity-50"
          >
            {saving ? t('externalPayee.saving') : t('externalPayee.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, className = '' }) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}
