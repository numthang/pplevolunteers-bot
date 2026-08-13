'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'

const PROVINCES = [
  'กรุงเทพ', 'นนทบุรี', 'สมุทรปราการ', 'สมุทรสาคร', 'ปทุมธานี',
  'ราชบุรี', 'นครปฐม', 'กาญจนบุรี', 'เพชรบุรี', 'สุพรรณบุรี',
  'สมุทรสงคราม', 'ประจวบคีรีขันธ์', 'อุทัยธานี', 'อ่างทอง', 'สระบุรี',
  'อยุธยา', 'นครนายก', 'ลพบุรี', 'ชัยนาท', 'สิงห์บุรี',
  'เชียงใหม่', 'เชียงราย', 'แม่ฮ่องสอน', 'ลำพูน', 'ลำปาง',
  'แพร่', 'พะเยา', 'น่าน', 'กำแพงเพชร', 'ตาก',
  'นครสวรรค์', 'พิจิตร', 'พิษณุโลก', 'เพชรบูรณ์', 'สุโขทัย',
  'อุตรดิตถ์', 'ตราด', 'จันทบุรี', 'ระยอง', 'ชลบุรี',
  'ฉะเชิงเทรา', 'ปราจีนบุรี', 'สระแก้ว', 'อุดรธานี', 'หนองคาย',
  'บึงกาฬ', 'สกลนคร', 'มุกดาหาร', 'นครพนม', 'อำนาจเจริญ',
  'เลย', 'ชัยภูมิ', 'ขอนแก่น', 'กาฬสินธุ์', 'ยโสธร',
  'หนองบัวลำภู', 'มหาสารคาม', 'ร้อยเอ็ด', 'อุบลราชธานี', 'ศรีสะเกษ',
  'สุรินทร์', 'บุรีรัมย์', 'นครราชสีมา', 'ชุมพร', 'พังงา',
  'ระนอง', 'ภูเก็ต', 'สุราษฎร์ธานี', 'นครศรีธรรมราช', 'ตรัง',
  'กระบี่', 'สงขลา', 'พัทลุง', 'สตูล', 'ปัตตานี',
  'ยะลา', 'นราธิวาส'
].sort((a, b) => a.localeCompare(b, 'th'))

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500'
const labelCls = 'block text-base font-semibold mb-1.5 text-gray-700 dark:text-disc-text'

export default function ImportCampaignForm() {
  const t = useTranslations('calling')

  const [file, setFile] = useState(null)
  const [province, setProvince] = useState('')
  const [campaignId, setCampaignId] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))

  const [step, setStep] = useState('form') // form | previewed | done
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const fileInput = useRef(null)

  // ยังไม่กดยืนยัน (ไม่มี autosave) → เตือนถ้าปิดแท็บทั้งที่มีไฟล์/พรีวิวค้าง
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    if (step !== 'done' && (file || preview)) {
      window.addEventListener('beforeunload', handler)
      return () => window.removeEventListener('beforeunload', handler)
    }
  }, [step, file, preview])

  const canSubmit = file && province && campaignId && !isNaN(parseInt(campaignId, 10))

  async function submit(mode) {
    setBusy(true); setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('province', province)
      form.append('campaignId', campaignId)
      form.append('date', date)
      form.append('mode', mode)

      const res = await fetch('/api/calling/campaigns/import', { method: 'POST', body: form })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || t('importXlsx.errorGeneric')); return }

      if (mode === 'preview') {
        setPreview(data.preview)
        setStep('previewed')
      } else {
        setResult(data.data)
        setStep('done')
      }
    } catch {
      setError(t('importXlsx.errorGeneric'))
    } finally {
      setBusy(false)
    }
  }

  function resetForm() {
    setFile(null); setProvince(''); setCampaignId(''); setPreview(null); setResult(null); setError('')
    setStep('form')
    if (fileInput.current) fileInput.current.value = ''
  }

  if (step === 'done' && result) {
    return (
      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6 space-y-4">
        <p className="text-base font-semibold text-emerald-600">{t('importXlsx.doneTitle')}</p>
        <ul className="text-sm text-gray-600 dark:text-disc-muted space-y-1">
          <li>{t('importXlsx.summaryMembers', { count: result.memberCount })}</li>
          <li>{t('importXlsx.summaryLogs', { count: result.logCount })}</li>
          <li>{t('importXlsx.summaryTiers', { count: result.tierCount })}</li>
        </ul>
        <div className="flex gap-3">
          <a href={`/calling/assignments/${result.campaignId}`}
            className="rounded-lg bg-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-orange-light">
            {t('importXlsx.goToCampaign')}
          </a>
          <button type="button" onClick={resetForm}
            className="rounded-lg border border-gray-300 dark:border-disc-border px-4 py-2.5 text-sm text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover">
            {t('importXlsx.importAnother')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6 space-y-5">
      <div>
        <label className={labelCls}>{t('importXlsx.fileLabel')}</label>
        <input ref={fileInput} type="file" accept=".xlsx,.xls"
          onChange={e => { setFile(e.target.files?.[0] || null); setPreview(null); setStep('form') }}
          disabled={busy} className={inputCls} />
      </div>

      <div>
        <label className={labelCls}>{t('importXlsx.provinceLabel')}</label>
        <select value={province} disabled={busy}
          onChange={e => { setProvince(e.target.value); setPreview(null); setStep('form') }}
          className={inputCls}>
          <option value="">{t('importXlsx.provincePlaceholder')}</option>
          {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t('importXlsx.campaignIdLabel')}</label>
          <input type="number" min="1" value={campaignId} disabled={busy}
            onChange={e => { setCampaignId(e.target.value); setPreview(null); setStep('form') }}
            placeholder={t('importXlsx.campaignIdPlaceholder')} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('importXlsx.dateLabel')}</label>
          <input type="date" value={date} disabled={busy}
            onChange={e => { setDate(e.target.value); setPreview(null); setStep('form') }}
            className={inputCls} />
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-disc-muted">{t('importXlsx.campaignIdHint')}</p>

      {error && <p className="text-sm text-red-accent">{error}</p>}

      {step === 'form' && (
        <button type="button" disabled={!canSubmit || busy} onClick={() => submit('preview')}
          className="w-full bg-indigo-600 text-white py-3 rounded-lg text-base font-semibold hover:bg-indigo-700 disabled:opacity-50 transition">
          {busy ? t('importXlsx.previewing') : t('importXlsx.previewButton')}
        </button>
      )}

      {step === 'previewed' && preview && (
        <div className="space-y-4 border-t border-gray-200 dark:border-disc-border pt-4">
          <p className="text-base font-semibold text-gray-900 dark:text-disc-text">
            {t('importXlsx.previewTitle', { name: preview.campaignName })}
          </p>
          <ul className="text-sm text-gray-600 dark:text-disc-muted space-y-1">
            <li>{t('importXlsx.summaryMembers', { count: preview.memberCount })}</li>
            <li>{t('importXlsx.summaryLogs', { count: preview.logCount })}</li>
            <li>{t('importXlsx.summaryTiers', { count: preview.tierCount })}</li>
          </ul>

          {preview.warnings?.length > 0 && (
            <ul className="text-xs text-amber-500 space-y-0.5">
              {preview.warnings.map((w, i) => <li key={i}>⚠ {w}</li>)}
            </ul>
          )}

          {preview.sampleLogs?.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs font-medium text-gray-500 dark:text-disc-muted mb-1">{t('importXlsx.sampleLogsTitle')}</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="text-left text-gray-400 dark:text-disc-muted">
                    <th className="pr-3 py-1">source_id</th>
                    <th className="pr-3 py-1">{t('importXlsx.sampleCaller')}</th>
                    <th className="py-1">{t('importXlsx.sampleNote')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.sampleLogs.map((l, i) => (
                    <tr key={i} className="border-t border-gray-100 dark:border-disc-border text-gray-700 dark:text-disc-text">
                      <td className="pr-3 py-1">{l.sourceId}</td>
                      <td className="pr-3 py-1">{l.callerName || '-'}</td>
                      <td className="py-1 truncate max-w-xs">{l.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" disabled={busy} onClick={() => submit('commit')}
              className="flex-1 bg-orange text-white py-3 rounded-lg text-base font-semibold hover:bg-orange-light disabled:opacity-50 transition">
              {busy ? t('importXlsx.committing') : t('importXlsx.confirmButton')}
            </button>
            <button type="button" disabled={busy} onClick={() => setStep('form')}
              className="px-6 py-3 rounded-lg text-base font-semibold border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text hover:bg-gray-50 dark:hover:bg-disc-hover transition">
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
