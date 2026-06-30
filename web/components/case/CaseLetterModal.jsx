'use client'

import { useState, useEffect, useCallback } from 'react'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-brand-orange'
const labelCls = 'block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text'

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
}

export default function CaseLetterModal({ refId, onClose }) {
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

  // โหลดรายการร่างที่บันทึกไว้
  useEffect(() => {
    fetch(`/api/case/${refId}/letter/drafts`)
      .then(r => r.json())
      .then(d => {
        setDrafts(d.drafts || [])
        if ((d.drafts || []).length === 0) {
          loadAiDraft()
        } else {
          setStep('pick')
        }
      })
      .catch(() => loadAiDraft())
  }, [refId])

  function loadAiDraft() {
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
        })
        setStep('edit')
      })
      .catch(() => { setError('โหลดร่างไม่สำเร็จ'); setStep('error') })
  }

  function loadSavedDraft(draft) {
    const { id, saved_at, ...f } = draft
    setDraftId(id)
    setFields(f)
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
      if (!res.ok) throw new Error(d.error || 'บันทึกไม่สำเร็จ')
      if (!draftId) setDraftId(d.draft.id)
      setSavedMsg('บันทึกแล้ว')
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
      if (!res.ok) throw new Error(d.error || 'สร้างเอกสารไม่สำเร็จ')
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
    a.download = `หนังสือร้องเรียน-${refId}.pdf`
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-disc-border shrink-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-disc-text">ร่างหนังสือร้องเรียน</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-disc-text text-2xl leading-none">&times;</button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5">

          {(step === 'init' || step === 'loading') && (
            <div className="py-16 text-center text-gray-400 dark:text-disc-muted">
              {step === 'init' ? '⏳ กำลังโหลด...' : '🤖 AI กำลังร่างหนังสือ...'}
            </div>
          )}

          {step === 'error' && (
            <div className="py-8 text-center text-red-500">{error || 'เกิดข้อผิดพลาด'}</div>
          )}

          {step === 'pick' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 dark:text-disc-muted mb-1">เลือกร่างที่บันทึกไว้ หรือสร้างใหม่ด้วย AI</p>
              {drafts.map(d => (
                <button
                  key={d.id}
                  onClick={() => loadSavedDraft(d)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-disc-border hover:border-brand-orange hover:bg-orange-50 dark:hover:bg-disc-hover transition"
                >
                  <p className="text-base font-medium text-gray-900 dark:text-disc-text truncate">{d.subject || '(ไม่มีหัวเรื่อง)'}</p>
                  <p className="text-sm text-gray-400 dark:text-disc-muted mt-0.5">บันทึกเมื่อ {fmtDate(d.saved_at)}</p>
                </button>
              ))}
              <button
                onClick={loadAiDraft}
                className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-disc-border text-gray-500 dark:text-disc-muted hover:border-brand-orange hover:text-brand-orange transition text-base"
              >
                + สร้างร่างใหม่ด้วย AI
              </button>
            </div>
          )}

          {step === 'edit' && fields && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-disc-muted">ตรวจสอบและแก้ไขก่อนสร้าง PDF</p>

              <div>
                <label className={labelCls}>เรื่อง</label>
                <input className={inputCls} value={fields.subject} onChange={set('subject')} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>ตำแหน่งผู้รับ (เรียน)</label>
                  <input className={inputCls} value={fields.recipient_title} onChange={set('recipient_title')} placeholder="เช่น ผู้อำนวยการ" />
                </div>
                <div>
                  <label className={labelCls}>ชื่อผู้รับ / หน่วยงาน</label>
                  <input className={inputCls} value={fields.recipient_name} onChange={set('recipient_name')} />
                </div>
              </div>

              <div>
                <label className={labelCls}>สิ่งที่แนบมา</label>
                <input className={inputCls} value={fields.attachments} onChange={set('attachments')} placeholder="- เอกสาร..." />
              </div>

              <div>
                <label className={labelCls}>เนื้อหาหนังสือ</label>
                <textarea className={inputCls} rows={8} value={fields.body} onChange={set('body')} style={{ resize: 'vertical' }} />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              {pages.map((src, i) => (
                <img key={i} src={src} alt={`หน้า ${i + 1}`} className="w-full rounded-lg border border-gray-200 dark:border-disc-border" />
              ))}
              <button onClick={() => setStep('edit')} className="w-full py-2 text-sm text-gray-500 dark:text-disc-muted hover:text-orange border border-gray-200 dark:border-disc-border rounded-lg transition">
                ← แก้ไขอีกครั้ง
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-disc-border shrink-0 flex gap-3 justify-between items-center">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-base text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text transition">
              ปิด
            </button>
            {step === 'edit' && drafts.length > 0 && (
              <button onClick={() => setStep('pick')} className="px-4 py-2 text-base text-gray-500 dark:text-disc-muted hover:text-gray-700 dark:hover:text-disc-text transition">
                ← รายการ
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            {savedMsg && <span className="text-sm text-green-600 dark:text-green-400">{savedMsg}</span>}
            {step === 'edit' && (
              <button onClick={saveDraft} disabled={saving} className="px-4 py-2 border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text rounded-lg text-base hover:border-brand-orange hover:text-brand-orange disabled:opacity-50 transition">
                {saving ? 'กำลังบันทึก...' : 'บันทึกร่าง'}
              </button>
            )}
            {step === 'edit' && (
              <button onClick={generate} disabled={generating} className="px-5 py-2 bg-brand-orange text-white rounded-lg text-base font-semibold hover:bg-brand-orange-light disabled:opacity-50 transition">
                {generating ? 'กำลังสร้าง PDF...' : 'สร้าง PDF'}
              </button>
            )}
            {step === 'preview' && (<>
              <button onClick={printPdf} className="px-4 py-2 border border-gray-300 dark:border-disc-border text-gray-700 dark:text-disc-text rounded-lg text-base hover:border-brand-orange hover:text-brand-orange transition">
                🖨️ พิมพ์
              </button>
              <button onClick={downloadPdf} className="px-5 py-2 bg-brand-orange text-white rounded-lg text-base font-semibold hover:bg-brand-orange-light transition">
                ดาวน์โหลด PDF
              </button>
            </>)}
          </div>
        </div>

      </div>
    </div>
  )
}
