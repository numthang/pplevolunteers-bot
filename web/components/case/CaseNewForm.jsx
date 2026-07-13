'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import ProvinceCombobox from '@/components/case/ProvinceCombobox.jsx'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-base font-semibold mb-1.5 text-gray-700 dark:text-disc-text'

const MAX_FILES = 3
const MAX_SIZE = 10 * 1024 * 1024 // 10MB
const ACCEPT = 'image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg'

export default function CaseNewForm({ fixedProvince, provinces, categories }) {
  const t = useTranslations('case')
  const [province, setProvince] = useState(fixedProvince || '')
  const [locating, setLocating] = useState(false)

  useEffect(() => {
    if (fixedProvince || !navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lon } }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=th`,
            { headers: { 'User-Agent': 'pple-volunteers/1.0' } },
          )
          const data = await res.json()
          const raw = data.address?.state || data.address?.county || ''
          const p = raw.replace(/^จังหวัด/, '').trim()
          if (p && provinces.includes(p)) setProvince(p)
        } catch { /* ไม่มี province → ผู้ใช้เลือกเอง */ }
        finally { setLocating(false) }
      },
      () => setLocating(false),
      { timeout: 8000 },
    )
  }, [])

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState(categories[0] || '')
  const [detail, setDetail] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [lineId, setLineId] = useState('')
  const [files, setFiles] = useState([])
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // honeypot — มนุษย์ไม่กรอก
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { ref }
  const [copied, setCopied] = useState(false)

  function onPickFiles(e) {
    const picked = Array.from(e.target.files || [])
    if (picked.length > MAX_FILES) { alert(t('newForm.maxFilesAlert', { max: MAX_FILES })); e.target.value = ''; return }
    const tooBig = picked.find(f => f.size > MAX_SIZE)
    if (tooBig) { alert(t('newForm.fileTooBigAlert', { name: tooBig.name })); e.target.value = ''; return }
    setFiles(picked)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!province) { alert(t('newForm.provinceRequiredAlert')); return }
    if (!title.trim()) { alert(t('newForm.titleRequiredAlert')); return }
    if (!detail.trim()) { alert(t('newForm.detailRequiredAlert')); return }
    if (!name.trim()) { alert(t('newForm.nameRequiredAlert')); return }
    if (!phone.trim()) { alert(t('newForm.phoneRequiredAlert')); return }
    if (!consent) { alert(t('newForm.consentRequiredAlert')); return }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('province', province)
      fd.append('title', title)
      fd.append('category', category)
      fd.append('detail', detail)
      fd.append('name', name)
      fd.append('phone', phone)
      fd.append('line_id', lineId)
      fd.append('consent', '1')
      fd.append('website', website) // honeypot
      files.forEach(f => fd.append('files', f))

      const res = await fetch('/api/case', { method: 'POST', body: fd })
      if (res.status === 429) { alert(t('newForm.rateLimitAlert')); return }
      if (!res.ok) throw new Error(t('newForm.submitError'))
      const data = await res.json()
      setResult({ ref: data.ref })
    } catch (err) {
      alert(t('newForm.errorAlert', { message: err.message }))
    } finally {
      setLoading(false)
    }
  }

  // ── success state ──
  if (result) {
    const trackUrl = `/case/${result.ref}`
    return (
      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6 text-center">
        <div className="text-5xl mb-3">✅</div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-disc-text mb-2">{t('newForm.successTitle')}</h2>
        <p className="text-base text-gray-500 dark:text-disc-muted mb-4">
          {t('newForm.successDesc')}
        </p>
        <div className="flex items-center justify-center gap-2 mb-5">
          <span className="text-2xl font-mono font-bold tracking-wider text-orange">{result.ref}</span>
          <button
            onClick={() => { navigator.clipboard?.writeText(result.ref); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text hover:border-orange hover:text-orange transition"
          >
            {copied ? t('newForm.copiedButton') : t('newForm.copyButton')}
          </button>
        </div>
        <Link href={trackUrl}
          className="inline-block w-full bg-brand-orange text-white py-3 rounded-lg text-base font-semibold hover:bg-brand-orange-light transition">
          {t('newForm.trackButton')}
        </Link>
      </div>
    )
  }

  // ── form ──
  return (
    <form onSubmit={handleSubmit} className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6 space-y-5">
      <div>
        <label className={labelCls}>{t('newForm.provinceLabel')}</label>
        <ProvinceCombobox
          value={province}
          onChange={setProvince}
          provinces={provinces}
          placeholder={locating ? t('newForm.provincePlaceholderLocating') : t('newForm.provincePlaceholder')}
        />
      </div>

      <div>
        <label className={labelCls}>{t('newForm.titleLabel')}</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder={t('newForm.titlePlaceholder')} className={inputCls} required />
      </div>

      <div>
        <label className={labelCls}>{t('newForm.categoryLabel')}</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div>
        <label className={labelCls}>{t('newForm.detailLabel')}</label>
        <textarea value={detail}
          onChange={e => { setDetail(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }}
          placeholder={t('newForm.detailPlaceholder')} className={inputCls} rows="5"
          style={{ resize: 'none', overflow: 'hidden' }} required />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('newForm.nameLabel')}</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder={t('newForm.namePlaceholder')} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>{t('newForm.phoneLabel')}</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08xxxxxxxx" className={inputCls} required />
        </div>
      </div>

      <div>
        <label className={labelCls}>LINE ID <span className="font-normal text-gray-400 dark:text-disc-muted">{t('newForm.optionalTag')}</span></label>
        <input type="text" value={lineId} onChange={e => setLineId(e.target.value)} placeholder="@yourline" className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>{t('newForm.filesLabel')} <span className="font-normal text-gray-400 dark:text-disc-muted">{t('newForm.filesHint')}</span></label>
        <input type="file" accept={ACCEPT} multiple onChange={onPickFiles}
          className="w-full text-base text-gray-700 dark:text-disc-text file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-orange-50 file:text-brand-orange hover:file:bg-orange-100" />
        {files.length > 0 && (
          <p className="mt-1.5 text-sm text-gray-500 dark:text-disc-muted">{t('newForm.filesSelected', { count: files.length })}</p>
        )}
      </div>

      {/* honeypot — ซ่อนจากมนุษย์ */}
      <input type="text" value={website} onChange={e => setWebsite(e.target.value)}
        name="website" tabIndex="-1" autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', opacity: 0 }} />

      <label className="flex items-start gap-2.5 cursor-pointer">
        <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}
          className="mt-1 w-4 h-4 accent-orange" />
        <span className="text-sm text-gray-600 dark:text-disc-muted">
          {t('newForm.consentText')}
        </span>
      </label>

      <button type="submit" disabled={loading}
        className="w-full bg-brand-orange text-white py-3 rounded-lg text-base font-semibold hover:bg-brand-orange-light disabled:opacity-50 transition">
        {loading ? t('newForm.submittingButton') : t('newForm.submitButton')}
      </button>
    </form>
  )
}
