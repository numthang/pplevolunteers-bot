'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { X, Upload, Loader2, AlertTriangle, UserCheck } from 'lucide-react'
import IdCardCropper from './IdCardCropper'

const inputCls = 'h-8 w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text text-sm rounded px-2 focus:outline-none focus:ring-1 focus:ring-orange'
const labelCls = 'text-xs text-warm-600 dark:text-disc-text mb-1 block'

const EMPTY = {
  title: '', first_name: '', last_name: '', id_number: '', house_no: '', moo: '',
  road: '', subdistrict: '', district: '', province: '', zip_code: '', phone: '',
}

/**
 * ผู้ดูแลกรอกข้อมูลผู้รับเงิน (สมาชิก) แทนเจ้าตัว — ใช้ตอนคนนั้นยังไม่ผูกทะเบียนสมาชิก
 * หรือไม่มีในทะเบียนเลย ทำให้ใบพิมพ์ออกมาไม่มีชื่อ/ที่อยู่
 *
 * หน้าตาและ flow เหมือนฟอร์มคนนอกทุกอย่าง ต่างแค่ปลายทางที่บันทึก:
 * คนนอก → docs_external_payees · สมาชิก → users + override_data ของใบนี้ (ดู recipient-info route)
 */
export default function RecipientInfoModal({ entryId, token, initial = {}, hasIdCard = false, onClose, onSaved }) {
  const t = useTranslations('docs')
  const [form, setForm]       = useState({ ...EMPTY, ...initial })
  const [cropSrc, setCropSrc] = useState(null)
  const [cardBlob, setCardBlob] = useState(null)
  const [cardUrl, setCardUrl] = useState(null)
  const [reading, setReading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState(null)
  const [idWarn, setIdWarn]   = useState(false)
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
    try {
      const fd = new FormData()
      fd.append('file', blob, 'idcard.jpg')
      const res = await fetch('/api/docs/id-card/ocr', { method: 'POST', body: fd })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('externalPayee.readFailed'))
      setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(d.data).map(([k, v]) => [k, v ?? ''])) }))
      setIdWarn(!!d.data.id_number && !d.idValid)
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
      const res = await fetch(`/api/docs/entries/${entryId}/recipient-info`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('externalPayee.saveFailed'))

      // แนบบัตรให้ด้วยถ้าเพิ่งถ่ายมา — บัตรใช้ร่วมทุกใบของคนนั้น ถ้ามีอยู่แล้วต้องยืนยันก่อนทับ
      if (cardBlob) {
        const fd = new FormData()
        fd.append('file', cardBlob, 'idcard.jpg')
        let up = await fetch(`/api/docs/entries/${entryId}/id-card`, { method: 'POST', body: fd })
        if (up.status === 409 && confirm(t('recipientInfo.confirmOverwriteCard'))) {
          const fd2 = new FormData()
          fd2.append('file', cardBlob, 'idcard.jpg')
          up = await fetch(`/api/docs/entries/${entryId}/id-card?overwrite=1`, { method: 'POST', body: fd2 })
        }
      }
      onSaved()
    } catch (e2) {
      setErr(e2.message)
    } finally {
      setSaving(false)
    }
  }

  const canSave = !saving && !reading && !!form.first_name.trim() && !!form.last_name.trim()

  if (cropSrc) return <IdCardCropper src={cropSrc} onCancel={() => setCropSrc(null)} onCropped={onCropped} />

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
         onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-200 dark:border-disc-border">
          <h2 className="flex items-center gap-2 text-base font-semibold text-warm-900 dark:text-disc-text">
            <UserCheck size={18} className="text-orange shrink-0" />
            {t('recipientInfo.title')}
          </h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={pickFile} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={reading}
              className="w-full border border-dashed border-warm-200 dark:border-disc-border rounded-lg py-6 flex flex-col items-center gap-2 text-warm-500 dark:text-disc-muted hover:border-orange hover:text-orange transition disabled:opacity-50">
              {reading
                ? <><Loader2 size={20} className="animate-spin" />{t('externalPayee.reading')}</>
                : <><Upload size={20} />{cardUrl ? t('externalPayee.retake') : t('externalPayee.uploadCard')}</>}
            </button>
            {cardUrl && <img src={cardUrl} alt="" className="mt-2 rounded-lg max-h-32 mx-auto" />}
            <p className="mt-1.5 text-xs text-warm-400 dark:text-disc-muted">
              {hasIdCard && !cardBlob ? t('recipientInfo.alreadyHasCard') : t('externalPayee.uploadHint')}
            </p>
          </div>

          {idWarn && (
            <p className="flex items-start gap-1.5 text-sm text-red-accent">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              {t('externalPayee.idChecksumWarning')}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('externalPayee.fields.title')}       value={form.title}       onChange={v => setForm(f => ({ ...f, title: v }))} />
            <Field label={t('externalPayee.fields.firstName')}   value={form.first_name}  onChange={v => setForm(f => ({ ...f, first_name: v }))} />
            <Field label={t('externalPayee.fields.lastName')}    value={form.last_name}   onChange={v => setForm(f => ({ ...f, last_name: v }))} />
            <Field label={t('externalPayee.fields.idNumber')}    value={form.id_number}   onChange={v => { setForm(f => ({ ...f, id_number: v })); setIdWarn(false) }} />
            <Field label={t('externalPayee.fields.houseNo')}     value={form.house_no}    onChange={v => setForm(f => ({ ...f, house_no: v }))} />
            <Field label={t('externalPayee.fields.moo')}         value={form.moo}         onChange={v => setForm(f => ({ ...f, moo: v }))} />
            <Field label={t('externalPayee.fields.road')}        value={form.road}        onChange={v => setForm(f => ({ ...f, road: v }))} />
            <Field label={t('externalPayee.fields.subdistrict')} value={form.subdistrict} onChange={v => setForm(f => ({ ...f, subdistrict: v }))} />
            <Field label={t('externalPayee.fields.district')}    value={form.district}    onChange={v => setForm(f => ({ ...f, district: v }))} />
            <Field label={t('externalPayee.fields.province')}    value={form.province}    onChange={v => setForm(f => ({ ...f, province: v }))} />
            <Field label={t('externalPayee.fields.phone')}       value={form.phone}       onChange={v => setForm(f => ({ ...f, phone: v }))} />
          </div>

          {err && <p className="text-sm text-red-accent">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-warm-200 dark:border-disc-border">
          <button type="button" onClick={onClose} className="px-4 py-2 text-base text-warm-500 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text transition">
            {t('externalPayee.cancel')}
          </button>
          <button type="button" onClick={save} disabled={!canSave}
            className="px-4 py-2 text-base rounded-lg bg-orange text-white hover:bg-orange-light transition disabled:opacity-50">
            {saving ? t('externalPayee.saving') : t('externalPayee.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls} />
    </div>
  )
}
