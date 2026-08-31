'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text'
const cardCls = 'rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 space-y-4'

const BLANK = { org_name: '', address: '', signer_name: '', signer_position: '', coordinator_name: '', coordinator_phone: '' }

/**
 * หัวจดหมายร้องเรียนต่อจังหวัด (case_letter_config)
 *
 * กฎ CLAUDE.md §กฎการบันทึก: หน้านี้ไม่มี autosave → **ต้องมีปุ่มบันทึก** ทั้งตอนเพิ่มและตอนแก้
 * เลือกแบบนี้เพราะเป็นค่าที่แตะปีละครั้ง และตอนเพิ่มจังหวัดใหม่คือ Create ซึ่งห้าม autosave อยู่แล้ว
 * (ยิง POST ตอนกด "เพิ่ม" = ได้แถวเปล่าค้าง DB ทุกครั้งที่กดเล่น)
 */
export default function OrgLetterConfig() {
  const t = useTranslations('org')
  const [configs, setConfigs] = useState(null)   // null=loading · false=ไม่มีสิทธิ์
  const [provinces, setProvinces] = useState([])
  const [logo, setLogo] = useState(null)         // path รูปที่อัปโหลดไว้ · null = ใช้ตราค่าเริ่มต้น
  const [adding, setAdding] = useState(null)     // { province, ...BLANK } | null

  useEffect(() => { load() }, [])

  function load() {
    return fetch('/api/case/letter-config')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(d => { setConfigs(d.configs); setProvinces(d.provinces); setLogo(d.logo || null) })
      .catch(() => setConfigs(false))
  }

  if (configs === null) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('letterConfig.loading')}</p>
  if (configs === false) return <p className="text-sm text-gray-400 dark:text-disc-muted">{t('letterConfig.noAccess')}</p>

  const taken = new Set(configs.map(c => c.province))
  const available = provinces.filter(p => !taken.has(p))

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-disc-muted">{t('letterConfig.description')}</p>

      <LogoCard logo={logo} onChanged={setLogo} />

      {configs.map(c => (
        <ConfigForm key={c.province} initial={c} province={c.province} onSaved={load} />
      ))}

      {configs.length === 0 && !adding && (
        <p className="text-sm text-gray-400 dark:text-disc-muted">{t('letterConfig.empty')}</p>
      )}

      {adding ? (
        <ConfigForm
          initial={adding}
          province={adding.province}
          isNew
          provinceOptions={available}
          onProvinceChange={p => setAdding(a => ({ ...a, province: p }))}
          onCancel={() => setAdding(null)}
          onSaved={() => { setAdding(null); load() }}
        />
      ) : available.length > 0 && (
        <button
          type="button"
          onClick={() => setAdding({ province: available[0], ...BLANK })}
          className="w-full py-3 text-base text-gray-500 dark:text-disc-muted hover:text-brand-orange border border-dashed border-gray-300 dark:border-disc-border rounded-2xl transition"
        >
          {t('letterConfig.addButton')}
        </button>
      )}
    </div>
  )
}

/**
 * โลโก้หัวจดหมาย — **ของ org ทั้งก้อน ไม่แยกจังหวัด** (ต่างจากการ์ดข้างล่างที่เป็นรายจังหวัด)
 *
 * ไม่มีปุ่มบันทึก: เลือกไฟล์ = อัปโหลดเลย เพราะเป็น action เดียวจบ ไม่ใช่ฟอร์มหลายช่อง
 * ยังไม่เคยอัปโหลด = ใช้ตราที่ฝังมากับ template.docx (ปุ่ม "ใช้ค่าเริ่มต้น" พากลับไปสถานะนั้น)
 */
function LogoCard({ logo, onChanged }) {
  const t = useTranslations('org')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(file) {
    if (!file) return
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/case/letter-config/logo', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) { setError(d.error || t('letterConfig.logoFailed')); return }
      onChanged(d.url)
    } catch {
      setError(t('letterConfig.logoFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function reset() {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/case/letter-config/logo', { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) { setError(d.error || t('letterConfig.logoFailed')); return }
      onChanged(null)
    } catch {
      setError(t('letterConfig.logoFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cardCls}>
      <div>
        <p className="text-base font-semibold text-gray-900 dark:text-disc-text">{t('letterConfig.logoHeading')}</p>
        <p className="text-sm text-gray-500 dark:text-disc-muted">{t('letterConfig.logoHint')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="w-24 h-24 shrink-0 rounded-lg border border-gray-200 dark:border-disc-border flex items-center justify-center overflow-hidden bg-white">
          {/* ไม่ใช้ next/image — ไฟล์อัปโหลดเปลี่ยนได้ตลอด ไม่ต้องผ่าน optimizer */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logo || '/letterhead-default.png'}
            alt=""
            className="max-w-full max-h-full object-contain"
            onError={e => { e.currentTarget.style.visibility = 'hidden' }}
          />
        </div>

        <div className="flex flex-col gap-2 min-w-0">
          <label className={`px-4 py-2 rounded-lg bg-brand-orange text-white text-base font-semibold text-center cursor-pointer hover:bg-brand-orange-light transition ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? t('letterConfig.logoUploading') : t('letterConfig.logoUploadButton')}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }}
            />
          </label>
          {logo && (
            <button
              type="button"
              onClick={reset}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text text-base disabled:opacity-50"
            >
              {t('letterConfig.logoResetButton')}
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}

function ConfigForm({ initial, province, isNew, provinceOptions, onProvinceChange, onCancel, onSaved }) {
  const t = useTranslations('org')
  const [form, setForm] = useState(() => ({ ...BLANK, ...initial }))
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setNote('') }

  async function save() {
    setSaving(true); setError(''); setNote('')
    try {
      const res = await fetch('/api/case/letter-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, province }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('letterConfig.saveError'))
      setNote(t('letterConfig.saveSuccess'))
      onSaved?.()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={cardCls}>
      {isNew && provinceOptions ? (
        <div>
          <label className={labelCls}>{t('letterConfig.provinceLabel')}</label>
          <select className={inputCls} value={province} onChange={e => onProvinceChange(e.target.value)}>
            {provinceOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      ) : (
        <p className="text-base font-semibold text-gray-900 dark:text-disc-text">{province}</p>
      )}

      <div>
        <label className={labelCls}>{t('letterConfig.orgNameLabel')}</label>
        <input className={inputCls} value={form.org_name} onChange={set('org_name')} placeholder={t('letterConfig.orgNamePlaceholder')} />
      </div>

      <div>
        <label className={labelCls}>{t('letterConfig.addressLabel')}</label>
        <input className={inputCls} value={form.address} onChange={set('address')} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('letterConfig.signerNameLabel')}</label>
          <input className={inputCls} value={form.signer_name} onChange={set('signer_name')} />
        </div>
        <div>
          <label className={labelCls}>{t('letterConfig.signerPositionLabel')}</label>
          <input className={inputCls} value={form.signer_position} onChange={set('signer_position')} />
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-disc-muted">{t('letterConfig.signerHint')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('letterConfig.coordinatorNameLabel')}</label>
          <input className={inputCls} value={form.coordinator_name} onChange={set('coordinator_name')} />
        </div>
        <div>
          <label className={labelCls}>{t('letterConfig.coordinatorPhoneLabel')}</label>
          <input className={inputCls} value={form.coordinator_phone} onChange={set('coordinator_phone')} placeholder="08x-xxx-xxxx" />
        </div>
      </div>
      <p className="text-sm text-gray-500 dark:text-disc-muted">{t('letterConfig.coordinatorHint')}</p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="button" onClick={save} disabled={saving}
          className="px-5 py-2 bg-brand-orange text-white rounded-lg text-base font-semibold hover:bg-brand-orange-light disabled:opacity-50 transition"
        >
          {saving ? t('letterConfig.savingButton') : t('letterConfig.saveButton')}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 text-base text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text transition">
            {t('letterConfig.cancelButton')}
          </button>
        )}
        {note && <span className="text-sm text-gray-600 dark:text-disc-muted">{note}</span>}
      </div>
    </div>
  )
}
