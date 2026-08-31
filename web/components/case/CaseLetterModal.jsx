'use client'

import { useState, useEffect, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import useAutoGrow from '@/lib/useAutoGrow.js'

/**
 * หัวจดหมาย/ท้ายจดหมาย **ไม่เก็บลงร่าง** — ดึงสดจาก case_letter_config ตอนสร้าง PDF ทุกครั้ง
 * เพราะ cases.letters เก็บ "ร่างที่ยังไม่ได้ส่ง" ไม่ใช่ทะเบียนหนังสือที่ออกไปแล้ว
 * ที่อยู่สาขา/ผู้ประสานงานเปลี่ยนเมื่อไหร่ ต้องมีผลกับทุกใบที่พิมพ์หลังจากนั้น
 *
 * ร่างยุคแรก (30 มิ.ย.) แช่ค่าพวกนี้ไว้ในร่าง แล้วมันชนะ config ตอน generate โดยไม่มีช่องให้เห็นหรือแก้
 * → โยนทิ้งตอนโหลด ไม่ให้ไหลกลับเข้า fields อีก
 */
const STALE_HEADER_KEYS = ['org_name', 'address', 'coordinator_name', 'coordinator_phone']

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text'

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CaseLetterModal({ refId, onClose }) {
  const t = useTranslations('case')
  // steps: init | pick | loading | edit | preview | error
  const [step, setStep]             = useState('init')
  const [drafts, setDrafts]         = useState([])
  const [draftId, setDraftId]       = useState(null)
  const [fields, setFields]         = useState(null)
  const [error, setError]           = useState('')
  const [saving, setSaving]         = useState(false)
  const [savedMsg, setSavedMsg]     = useState('')
  const [generating, setGenerating] = useState(false)
  const [pages, setPages]           = useState([])
  const [pdfBase64, setPdfBase64]   = useState(null)
  const [signerDefaults, setSignerDefaults] = useState({})
  const bodyRef = useAutoGrow(fields?.body)

  // โหลดรายการร่างที่บันทึกไว้ + ค่าเริ่มต้นผู้ลงนาม
  useEffect(() => {
    fetch(`/api/case/${refId}/letter/drafts`)
      .then(r => r.json())
      .then(d => {
        const defaults = d.signerDefaults || {}
        setDrafts(d.drafts || [])
        setSignerDefaults(defaults)
        // ส่ง defaults เข้าไปตรงๆ — setState ยังไม่มีผลจนถึง render ถัดไป อ่าน state ที่นี่จะได้ค่าเก่า
        if ((d.drafts || []).length === 0) loadAiDraft(defaults)
        else setStep('pick')
      })
      .catch(() => loadAiDraft({}))
  }, [refId])

  function loadAiDraft(defaults) {
    setStep('loading')
    setDraftId(null)
    fetch(`/api/case/${refId}/letter/draft`, { method: 'POST' })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setStep('error'); return }
        setFields({
          subject:         d.draft.subject || '',
          recipient_title: d.draft.recipient_title || '',
          recipient_name:  d.draft.recipient_name || '',
          attachments:     d.draft.attachments || '-',
          body:            d.draft.body || '',
          signer_name:     defaults.signer_name || '',
          signer_position: defaults.signer_position || '',
          signer_phone:    defaults.signer_phone || '',
        })
        setStep('edit')
      })
      .catch(() => { setError(t('letter.loadDraftError')); setStep('error') })
  }

  function loadSavedDraft(draft) {
    const { id, saved_at, ...f } = draft
    for (const k of STALE_HEADER_KEYS) delete f[k]
    setDraftId(id)
    setFields({
      // ร่างยุคก่อนไม่มี 3 ช่องนี้ — ตกมาใช้ค่าเริ่มต้นของคนที่เปิด ไม่ปล่อยให้ input เป็น undefined
      signer_name:     signerDefaults.signer_name || '',
      signer_position: signerDefaults.signer_position || '',
      signer_phone:    signerDefaults.signer_phone || '',
      ...f,
    })
    setStep('edit')
  }

  const set = (k) => (e) => setFields(f => ({ ...f, [k]: e.target.value }))

  async function saveDraft() {
    setSaving(true)
    setSavedMsg('')
    try {
      const res = await fetch(`/api/case/${refId}/letter/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftId ? { id: draftId, ...fields } : fields),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('letter.saveDraftError'))
      if (!draftId) setDraftId(d.draft.id)
      setSavedMsg(t('letter.savedMsg'))
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function generate() {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch(`/api/case/${refId}/letter/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || t('letter.generateError'))
      setPages(d.pages)
      setPdfBase64(d.pdfBase64)
      setStep('preview')
    } catch (e) {
      setError(e.message)
    } finally {
      setGenerating(false)
    }
  }

  function downloadPdf() {
    const a = document.createElement('a')
    a.href = 'data:application/pdf;base64,' + pdfBase64
    a.download = `${t('letter.downloadFilename', { ref: refId })}.pdf`
    a.click()
  }

  function printPdf() {
    const blob = new Blob([Uint8Array.from(atob(pdfBase64), c => c.charCodeAt(0))], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const w = window.open(url)
    w?.addEventListener('load', () => { w.print(); URL.revokeObjectURL(url) })
  }

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-disc-bg2 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-disc-border shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-disc-text">{t('letter.title')}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-disc-text text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-5">

          {(step === 'init' || step === 'loading') && (
            <div className="py-16 text-center text-gray-400 dark:text-disc-muted">
              {step === 'init' ? t('letter.loadingInit') : t('letter.loadingAi')}
            </div>
          )}

          {step === 'error' && (
            <div className="py-8 text-center text-red-500">{error || t('common.error')}</div>
          )}

          {step === 'pick' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-disc-muted mb-1">{t('letter.pickPrompt')}</p>
              {drafts.map(d => (
                <button
                  key={d.id}
                  onClick={() => loadSavedDraft(d)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-disc-border hover:border-brand-orange hover:bg-orange-50 dark:hover:bg-disc-hover transition"
                >
                  <p className="text-base font-medium text-gray-900 dark:text-disc-text truncate">{d.subject || t('letter.noSubject')}</p>
                  <p className="text-sm text-gray-400 dark:text-disc-muted mt-0.5">{t('letter.savedAt', { date: fmtDate(d.saved_at) })}</p>
                </button>
              ))}
              <button
                onClick={loadAiDraft}
                className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-disc-border text-gray-500 dark:text-disc-muted hover:border-brand-orange hover:text-brand-orange transition text-base"
              >
                {t('letter.newDraftButton')}
              </button>
            </div>
          )}

          {step === 'edit' && fields && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>{t('letter.subjectLabel')}</label>
                <input className={inputCls} value={fields.subject} onChange={set('subject')} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t('letter.recipientTitleLabel')}</label>
                  <input className={inputCls} value={fields.recipient_title} onChange={set('recipient_title')} placeholder={t('letter.recipientTitlePlaceholder')} />
                </div>
                <div>
                  <label className={labelCls}>{t('letter.recipientNameLabel')}</label>
                  <input className={inputCls} value={fields.recipient_name} onChange={set('recipient_name')} />
                </div>
              </div>

              <div>
                <label className={labelCls}>{t('letter.attachmentsLabel')}</label>
                <input className={inputCls} value={fields.attachments} onChange={set('attachments')} placeholder={t('letter.attachmentsPlaceholder')} />
              </div>

              <div>
                <label className={labelCls}>{t('letter.bodyLabel')}</label>
                {/* ⛔ ห้ามใส่ autoGrow(e.target) ใน onChange — useAutoGrow ทำให้แล้ว 1 ครั้งต่อ render */}
                <textarea
                  ref={bodyRef}
                  className={`${inputCls} resize-none overflow-hidden min-h-[180px]`}
                  value={fields.body}
                  onChange={set('body')}
                />
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-disc-border space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelCls}>{t('letter.signerNameLabel')}</label>
                    <input className={inputCls} value={fields.signer_name} onChange={set('signer_name')} />
                  </div>
                  <div>
                    <label className={labelCls}>{t('letter.signerPhoneLabel')}</label>
                    <input className={inputCls} value={fields.signer_phone} onChange={set('signer_phone')} placeholder={t('letter.signerPhonePlaceholder')} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>{t('letter.signerPositionLabel')}</label>
                  <input className={inputCls} value={fields.signer_position} onChange={set('signer_position')} placeholder={t('letter.signerPositionPlaceholder')} />
                </div>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              {pages.map((src, i) => (
                <img key={i} src={src} alt={t('letter.pageAlt', { page: i + 1 })} className="w-full rounded-lg border border-gray-200 dark:border-disc-border" />
              ))}
              <button onClick={() => setStep('edit')} className="w-full py-2 text-sm text-gray-500 dark:text-disc-muted hover:text-orange border border-gray-200 dark:border-disc-border rounded-lg transition">
                {t('letter.backToEditButton')}
              </button>
            </div>
          )}

        </div>

        {/* Footer — มือถือ: 2 แถว (ปุ่มรองบน · ปุ่มหลักล่าง เต็มความกว้าง ให้นิ้วโป้งถึง)
            เดิมยัด 4 ปุ่มแถวเดียว justify-between → บนจอ ~350px ข้อความหักกลางปุ่ม ("บันทึก\nร่าง")
            whitespace-nowrap กันข้อความหักในปุ่ม · flex-1 ให้ปุ่มหลักแบ่งความกว้างกันเองบนมือถือ */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-disc-border shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-3 sm:justify-between sm:items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={onClose} className="px-3 sm:px-4 py-2 text-base whitespace-nowrap text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text transition">
              {t('common.close')}
            </button>
            {step === 'edit' && drafts.length > 0 && (
              <button onClick={() => setStep('pick')} className="px-3 sm:px-4 py-2 text-base whitespace-nowrap text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text transition">
                {t('letter.backToListButton')}
              </button>
            )}
            {savedMsg && <span className="text-sm whitespace-nowrap text-green-600 dark:text-green-400">{savedMsg}</span>}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {step === 'edit' && (
              <button onClick={saveDraft} disabled={saving} className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text rounded-lg text-base whitespace-nowrap hover:border-brand-orange hover:text-brand-orange disabled:opacity-50 transition">
                {saving ? t('common.saving') : t('letter.saveDraftButton')}
              </button>
            )}
            {step === 'edit' && (
              <button onClick={generate} disabled={generating} className="flex-1 sm:flex-none px-4 sm:px-5 py-2 bg-brand-orange text-white rounded-lg text-base font-semibold whitespace-nowrap hover:bg-brand-orange-light disabled:opacity-50 transition">
                {generating ? t('letter.generatingButton') : t('letter.generatePdfButton')}
              </button>
            )}
            {step === 'preview' && (<>
              <button onClick={printPdf} className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text rounded-lg text-base whitespace-nowrap hover:border-brand-orange hover:text-brand-orange transition">
                {t('letter.printButton')}
              </button>
              <button onClick={downloadPdf} className="flex-1 sm:flex-none px-4 sm:px-5 py-2 bg-brand-orange text-white rounded-lg text-base font-semibold whitespace-nowrap hover:bg-brand-orange-light transition">
                {t('letter.downloadButton')}
              </button>
            </>)}
          </div>
        </div>

      </div>
    </div>
  )
}
