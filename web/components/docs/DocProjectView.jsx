'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { X, CreditCard, CheckCircle, FilePlus, Check, Pencil, Copy, RefreshCw, Link2 } from 'lucide-react'
import DocEntryList from './DocEntryList'
import DocAutoCalc from './DocAutoCalc'
import DocImageCropper from './DocImageCropper'

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [datePart, timePart] = dateStr.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  let r = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
  if (timePart && timePart !== '00:00') r += ` ${timePart} น.`
  return r
}

const PROJECT_STATUS_COLOR = {
  draft:  'bg-warm-100 text-warm-500 dark:bg-disc-hover dark:text-disc-muted',
  active: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-warm-100 text-warm-400 dark:bg-disc-hover dark:text-disc-muted',
}

export default function DocProjectView({ project: initialProject, initialEntries, canManage, currentUserId, eventId, eventName, eventDate, eventEndDate, participantCount, actEventId, eventProvince, signPolicy = 'strict' }) {
  const t = useTranslations('docs')
  const [project, setProject]       = useState(initialProject)
  const [entries, setEntries]       = useState(initialEntries)
  const [refreshKey, setRefreshKey] = useState(0)

  // province จาก project (ถ้ามีแล้ว) หรือจาก event โดยตรง (ก่อนสร้าง project)
  const province = project?.province ?? eventProvince

  const [recentMembers, setRecentMembers] = useState([])
  const [autoSaving, setAutoSaving] = useState(false)
  const [billMode, setBillMode]     = useState('auto')  // 'auto' (default) | 'act'

  // ACT tab — attachments + tokens
  const [attachments, setAttachments]   = useState([])
  const [attLoaded, setAttLoaded]       = useState(false)
  const [attUploading, setAttUploading] = useState(false)
  const [tokens, setTokens]             = useState(null)
  const [previewIdx, setPreviewIdx]     = useState(null)
  const attInputRef = useRef(null)

  // กรอบงบโครงการ (เกินได้ แต่อย่าขาด — ต้องเคลียร์บิลให้ครบกรอบงบ)
  const [budget, setBudget]               = useState(project?.budget != null ? Number(project.budget) : null)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput]     = useState('')
  const [savingBudget, setSavingBudget]   = useState(false)

  async function loadAttachments() {
    if (!project?.id) return
    const res = await fetch(`/api/docs/projects/${project.id}/attachments`)
    if (res.ok) { setAttachments(await res.json()); setAttLoaded(true) }
  }

  async function loadTokensForId(pid) {
    const res = await fetch(`/api/docs/projects/${pid}/tokens`)
    if (res.ok) setTokens(await res.json())
  }

  async function loadTokens() {
    if (!project?.id) return
    loadTokensForId(project.id)
  }

  useEffect(() => {
    if (project?.id && !tokens) loadTokensForId(project.id)
  }, [project?.id])

  useEffect(() => {
    if (previewIdx === null) return
    const handler = e => {
      if (e.key === 'Escape')     setPreviewIdx(null)
      if (e.key === 'ArrowRight') setPreviewIdx(i => Math.min(i + 1, attachments.length - 1))
      if (e.key === 'ArrowLeft')  setPreviewIdx(i => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [previewIdx, attachments.length])

  useEffect(() => {
    if (billMode === 'act' && !attLoaded) loadAttachments()
  }, [billMode])

  // อัพโหลดแนบท้าย 3 — รูปต้องครอบเองก่อนเสมอ (ไม่มี auto-crop แล้ว) ส่วน PDF อัพตรงได้เลย
  const [cropQueue, setCropQueue] = useState([]) // File[] รูปที่รอครอบ
  const [cropSrc, setCropSrc]     = useState(null) // object URL ของรูปที่กำลังครอบอยู่

  function queueFiles(files) {
    const pdfs   = files.filter(f => f.type === 'application/pdf')
    const images = files.filter(f => f.type !== 'application/pdf')
    pdfs.forEach(f => uploadAttachment(f))
    if (images.length) setCropQueue(prev => [...prev, ...images])
  }

  useEffect(() => {
    if (!cropSrc && cropQueue.length > 0) setCropSrc(URL.createObjectURL(cropQueue[0]))
  }, [cropQueue, cropSrc])

  function cancelCrop() {
    URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropQueue(prev => prev.slice(1))
  }

  async function finishCrop(blob) {
    URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
    setCropQueue(prev => prev.slice(1))
    await uploadAttachment(new File([blob], 'attachment.jpg', { type: 'image/jpeg' }))
  }

  async function uploadAttachment(file) {
    setAttUploading(true)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch(`/api/docs/events/${eventId}/attachments`, { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Upload failed') }
      const data = await res.json()
      if (data.type === 'pdf') {
        // direct PDF upload — refresh project if it was just created
        if (!project) {
          const pr = await fetch(`/api/docs/projects/${eventId}`)
          if (pr.ok) { const pd = await pr.json(); setProject(pd.data); loadTokensForId(pd.data.id) }
        }
        return
      }
      setAttachments(prev => [...prev, data])
      // if project was just created, load it into state
      if (!project) {
        const pr = await fetch(`/api/docs/projects/${eventId}`)
        if (pr.ok) { const pd = await pr.json(); setProject(pd.data); loadTokensForId(pd.data.id) }
      } else if (!tokens) {
        loadTokens()
      }
    } catch (err) {
      alert(t('projectView.upload.uploadFailed', { message: err.message }))
    } finally {
      setAttUploading(false)
    }
  }

  async function deleteAttachment(attId) {
    if (!project?.id || !confirm(t('projectView.attachments.confirmDelete'))) return
    const res = await fetch(`/api/docs/projects/${project.id}/attachments/${attId}`, { method: 'DELETE' })
    if (res.ok) setAttachments(prev => prev.filter(a => a.id !== attId))
  }

  async function regenerateToken() {
    if (!project?.id) return
    if (!confirm(t('projectView.tokens.confirmRegenerate'))) return
    const res = await fetch(`/api/docs/projects/${project.id}/tokens`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      setTokens({ project_token: data.token, project_token_expires: data.expires })
    }
  }

  async function saveBudget() {
    setSavingBudget(true)
    try {
      const res  = await fetch(`/api/docs/projects/${eventId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ budget: budgetInput === '' ? null : parseFloat(budgetInput) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setBudget(data.data.budget != null ? Number(data.data.budget) : null)
      setEditingBudget(false)
    } catch (err) {
      alert(t('entryList.errorPrefix', { message: err.message }))
    } finally {
      setSavingBudget(false)
    }
  }

  // รายชื่อผู้จ่ายที่ scope ครอบคลุมจังหวัดโครงการ (pool) + payer ระดับโครงการที่เลือก (dropdown บนสุด)
  const [eligiblePayers, setEligiblePayers]   = useState([])
  const [selectedPayer, setSelectedPayer]     = useState(null)   // user_id ที่เลือกเป็น payer หลักของโครงการ
  const [payerSavingTop, setPayerSavingTop]   = useState(false)

  useEffect(() => {
    if (!province) return
    fetch(`/api/docs/members/recent?province=${encodeURIComponent(province)}&limit=8`)
      .then(r => r.json())
      .then(d => { if (d.data) setRecentMembers(d.data) })
      .catch(() => {})
  }, [province])

  // โหลด pool ผู้จ่ายที่ scope ครอบคลุมจังหวัดของโครงการ + seed payer default
  useEffect(() => {
    if (!canManage || !province) { setEligiblePayers([]); return }
    fetch(`/api/docs/payers?province=${encodeURIComponent(province)}`)
      .then(r => r.json())
      .then(d => {
        const pool = d.data || []
        setEligiblePayers(pool)
        // default = payer ที่โครงการตั้งไว้ (ถ้ามีและยังอยู่ใน pool) → ไม่งั้น pool[0] (ผู้ประสานงานจังหวัด)
        setSelectedPayer(prev => {
          const projectPayer = project?.payer_user_id
          if (projectPayer && pool.some(p => p.user_id === projectPayer)) return projectPayer
          return prev && pool.some(p => p.user_id === prev) ? prev : (pool[0]?.user_id ?? null)
        })
      })
      .catch(() => setEligiblePayers([]))
  }, [canManage, province, project?.payer_user_id])

  // ต้องตั้งกรอบงบ + มีผู้มีสิทธิ์จ่าย ≥ 2 คน ถึงจะสร้างบิลได้
  const canCreate = budget != null && eligiblePayers.length >= 2
  const blockReason = budget == null
    ? t('projectView.blockReason.needBudget')
    : eligiblePayers.length < 2
      ? t('projectView.blockReason.needPayers', { province: province ?? t('projectView.blockReason.thisProvince') })
      : null

  async function changeProjectPayer(payerUserIdRaw) {
    const payerUserId = Number(payerUserIdRaw)
    if (!payerUserId || payerUserId === selectedPayer) return
    setSelectedPayer(payerUserId)
    if (!project) return  // ยังไม่สร้างบิล — เก็บ state เฉยๆ
    if (entries.some(e => e.payer_signed_at) &&
        !confirm(t('projectView.payer.confirmResetPayerSignature'))) return
    setPayerSavingTop(true)
    try {
      const res = await fetch(`/api/docs/projects/${eventId}/set-payer`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payerUserId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const r2 = await fetch(`/api/docs/entries?projectId=${project.id}`)
      if (r2.ok) { const d = await r2.json(); if (d.data) { setEntries(d.data); setRefreshKey(k => k + 1) } }
    } catch (err) {
      alert(t('entryList.errorPrefix', { message: err.message }))
    } finally {
      setPayerSavingTop(false)
    }
  }

  async function postEntries(payload, pCount) {
    // ลิงก์เซ็นไม่มีวันหมดอายุแล้ว (เคาะ 2026-08-26) — เดิมตั้ง +2 เดือนตรงนี้
    const res = await fetch('/api/docs/entries', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        actEventCacheId:  parseInt(eventId),
        isMobile:         project?.is_mobile ?? false,
        participantCount: pCount ?? null,
        entries:          payload,
        payerUserId:      selectedPayer,   // payer ที่เลือกจาก dropdown บนสุด
      }),
    })
    const resData = await res.json()
    if (!res.ok) throw new Error(resData.error || 'Failed')
    if (!project) {
      const projRes  = await fetch(`/api/docs/projects/${eventId}`)
      const projData = await projRes.json()
      if (projData.success) setProject(projData.data)
    }
    setEntries(resData.data || [])
    setRefreshKey(k => k + 1)
  }

  async function handleAutoCalcBudgetChange(val) {
    setBudget(val)
    if (!project) return  // ยังไม่มี project — update local state เฉยๆ
    try {
      const res  = await fetch(`/api/docs/projects/${eventId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ budget: val }),
      })
      const data = await res.json()
      if (res.ok && data.data) setBudget(data.data.budget != null ? Number(data.data.budget) : null)
    } catch { /* silent */ }
  }

  async function handleAutoSubmit(autoEntries, pCount) {
    if (!canCreate) { alert(blockReason); return false }
    setAutoSaving(true)
    try { await postEntries(autoEntries, pCount); return true }
    catch (err) { alert(t('entryList.errorPrefix', { message: err.message })); return false }
    finally { setAutoSaving(false) }
  }

  const totalAmount  = entries.reduce((s, e) => s + Number(e.amount || 0), 0)
  const signedCount  = entries.filter(e => e.status === 'signed').length
  const payerSignedCount = entries.filter(e => e.payer_signed_at).length


  const isMobile     = project?.is_mobile ?? false

  return (
    <div>
      {/* Header */}
      {project ? (
        <div className="mb-3 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{project.event_name} <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PROJECT_STATUS_COLOR[project.status] || PROJECT_STATUS_COLOR.draft}`}>
                {t(`projectCard.statusLabels.${project.status}`)}
              </span></h1>
              {project.is_mobile && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange/10 text-orange">{t('projectCard.mobile')}</span>
              )}
            </div>
            {project.event_date && (
              <p className="text-base text-warm-500 dark:text-disc-muted">
                {formatDate(project.event_date)}
                {project.event_end_date ? ` – ${formatDate(project.event_end_date)}` : ''}
                {project.province ? ` · ${project.province}` : ''}
              </p>
            )}
          </div>
          {canManage && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex gap-2">
                <a
                  href={tokens?.project_token ? `/dl/${tokens.project_token}/receipt` : undefined}
                  target="_blank" rel="noopener noreferrer"
                  aria-disabled={!tokens?.project_token}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 bg-orange text-white text-base font-semibold rounded-lg transition ${tokens?.project_token ? 'hover:bg-orange-light' : 'opacity-50 pointer-events-none'}`}
                >
                  {t('projectView.header.receiptButton')}
                </a>
                <a
                  href={tokens?.project_token ? `/dl/${tokens.project_token}/registration` : undefined}
                  target="_blank" rel="noopener noreferrer"
                  aria-disabled={!tokens?.project_token}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 border border-warm-300 dark:border-disc-border text-warm-700 dark:text-disc-text text-base font-semibold rounded-lg transition ${tokens?.project_token ? 'hover:bg-warm-50 dark:hover:bg-disc-hover' : 'opacity-50 pointer-events-none'}`}
                >
                  {t('projectView.common.attachment3Label')}
                </a>
              </div>
              {project && (
                <button onClick={regenerateToken} className="flex items-center gap-1 text-xs text-warm-400 dark:text-disc-muted hover:text-orange transition">
                  <RefreshCw size={11} /> {t('projectView.header.regenerateLinkButton')}
                </button>
              )}
            </div>
          )}
        </div>
      ) : canManage ? (
        <div className="mb-3">
          {eventName && <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{eventName}</h1>}
          <p className="text-base text-warm-500 dark:text-disc-muted mt-1">
            {eventDate ? `${formatDate(eventDate)}${eventEndDate ? ` – ${formatDate(eventEndDate)}` : ''} · ` : ''}{t('projectView.header.setupExpenseItems')}
          </p>
        </div>
      ) : null}

      {/* Stats — compact inline row */}
      {project && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl px-4 py-3 mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          {[
            { label: t('projectView.stats.itemsLabel'), value: entries.length, cls: 'text-warm-900 dark:text-disc-text' },
            { label: t('projectView.stats.recipientSignedLabel'), value: signedCount, cls: 'text-blue-600 dark:text-blue-400' },
            { label: t('projectView.stats.payerSignedLabel'), value: payerSignedCount, cls: 'text-green-600 dark:text-green-400' },
          ].map(({ label, value, cls }) => (
            <span key={label} className="flex items-center gap-1.5 text-sm">
              <span className="text-warm-400 dark:text-disc-muted">{label}</span>
              <span className={`font-bold text-base ${cls}`}>{value}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-sm">
            <span className="text-warm-400 dark:text-disc-muted">{t('autoCalc.totalLabel')}</span>
            <span className="font-bold text-base text-warm-900 dark:text-disc-text">{t('entryList.amount', { amount: totalAmount.toLocaleString() })}</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            {editingBudget ? (
              <>
                <input
                  type="number" min="0" step="0.01" autoFocus
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setEditingBudget(false) }}
                  placeholder={t('projectView.budget.placeholder')}
                  className="w-28 border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange"
                />
                <button type="button" onClick={saveBudget} disabled={savingBudget} className="p-1 rounded text-green-600 dark:text-green-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"><Check size={15} /></button>
                <button type="button" onClick={() => setEditingBudget(false)} className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"><X size={15} /></button>
              </>
            ) : (
              <button type="button" onClick={() => { setBudgetInput(budget != null ? String(budget) : ''); setEditingBudget(true) }}
                className="flex items-center gap-1 text-xs text-warm-400 dark:text-disc-muted hover:text-orange transition">
                <Pencil size={11} />
                {budget != null ? t('projectView.budget.amountLabel', { amount: budget.toLocaleString() }) : t('projectView.budget.setButton')}
              </button>
            )}
            {budget > 0 && (totalAmount >= budget
              ? <span className="text-xs font-medium text-green-600 dark:text-green-400">{t('projectView.budget.reached')}</span>
              : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">{t('projectView.budget.shortfall', { amount: (budget - totalAmount).toLocaleString() })}</span>
            )}
          </span>
        </div>
      )}

      {/* payer dropdown — ผู้จ่ายระดับโครงการ (เซ็ตให้ถูกก่อนสร้างบิล) */}
      {canManage && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 mb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <CreditCard size={16} className="text-orange shrink-0" />
              <span className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('projectView.payer.sectionTitle')}</span>
            </div>
            {eligiblePayers.length === 0 ? (
              <p className="text-sm text-warm-400 dark:text-disc-muted">
                {t('projectView.payer.noEligiblePayers', { province: province ?? t('projectView.blockReason.thisProvince') })} —{' '}
                {t('projectView.payer.addAtLabel')} <Link href="/docs/settings" className="text-orange hover:underline">{t('projectView.payer.settingsLinkText')}</Link>
              </p>
            ) : (<>
              <select
                value={selectedPayer || ''}
                onChange={e => changeProjectPayer(e.target.value)}
                disabled={payerSavingTop}
                className="h-10 border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text rounded-lg px-3 text-base focus:outline-none focus:ring-1 focus:ring-orange disabled:opacity-50 w-full sm:w-auto"
              >
                {eligiblePayers.map(p => (
                  <option key={p.user_id} value={p.user_id}>
                    {(p.firstname && p.lastname) ? `${p.firstname} ${p.lastname}` : p.display_name}
                  </option>
                ))}
              </select>
              {payerSavingTop && <span className="text-sm text-warm-400 dark:text-disc-muted">{t('projectView.payer.saving')}</span>}
              {!canCreate && (
                <span className="text-sm rounded-lg px-3 py-1.5 bg-orange/10 text-orange">{blockReason}</span>
              )}
            </>)}
          </div>
        </div>
      )}

      {/* เลือกโหมดเพิ่มบิล: คำนวณอัตโนมัติ (default) / เพิ่มเอง */}
      {canManage && (
        <div className="mb-3">
          <div className="flex gap-2 mb-4 border-b border-warm-200 dark:border-disc-border">
            {[
              { key: 'auto', label: t('projectView.tabs.auto') },
              { key: 'act', label: t('projectView.common.attachment3Label') },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setBillMode(tab.key)}
                className={`px-4 py-2 text-base font-semibold border-b-2 -mb-px transition
                  ${billMode === tab.key
                    ? 'border-orange text-orange'
                    : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className={billMode !== 'act' ? 'hidden' : ''}>
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4 space-y-4">

              {/* ลิงก์ ACT */}
              {(actEventId || tokens?.project_token) && (
                <div className="space-y-1.5">
                  
                  {actEventId && (
                    <a href={`https://act.peoplesparty.or.th/ect-paper-3/?eid=${actEventId}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-orange hover:underline font-medium text-sm">
                      {t('projectView.act.printBlankLink')}
                    </a>
                  )}
                  {tokens?.project_token && (
                    <a href={`/dl/${tokens.project_token}/registration`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-orange hover:underline font-medium text-sm">
                      {t('projectView.act.printSignedLink')}
                    </a>
                  )}
                </div>
              )}

              {/* Upload zone */}
              <div>
                <p className="text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest mb-1">{t('projectView.act.uploadSectionTitle')}</p>
                <button
                  type="button"
                  onClick={() => attInputRef.current?.click()}
                  disabled={attUploading}
                  className="w-full border-2 border-dashed border-warm-300 dark:border-disc-border rounded-xl py-6 flex flex-col items-center gap-2 text-warm-400 dark:text-disc-muted hover:border-orange hover:text-orange transition disabled:opacity-50 cursor-pointer"
                >
                  {attUploading
                    ? <span className="text-sm">{t('idCard.processing')}</span>
                    : (<>
                        <FilePlus size={26} />
                        <span className="text-sm">{t('projectView.act.tapToUpload')}</span>
                        <span className="text-xs opacity-70">{t('projectView.act.fileTypesHint')}</span>
                      </>)
                  }
                </button>
                <input
                  ref={attInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
                  multiple
                  className="hidden"
                  onChange={e => { queueFiles([...(e.target.files || [])]); e.target.value = '' }}
                />
              </div>

              {/* Thumbnail grid */}
              {attachments.length > 0 && project?.id && (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {attachments.map((att, i) => {
                    const src = `/api/docs/projects/${project.id}/attachments/${att.id}/image`
                    return (
                      <div key={att.id} className="relative group rounded-lg overflow-hidden border border-warm-200 dark:border-disc-border aspect-[3/4] bg-warm-100 dark:bg-disc-hover">
                        <img
                          src={src}
                          alt={att.original_name || t('projectView.attachments.documentAlt', { n: i + 1 })}
                          onClick={() => setPreviewIdx(i)}
                          className="w-full h-full object-cover cursor-zoom-in"
                        />
                        <button
                          type="button"
                          onClick={() => deleteAttachment(att.id)}
                          className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Lightbox */}
              {previewIdx !== null && attachments[previewIdx] && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={() => setPreviewIdx(null)}>
                  <button onClick={() => setPreviewIdx(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition">
                    <X size={22} />
                  </button>
                  {previewIdx > 0 && (
                    <button onClick={e => { e.stopPropagation(); setPreviewIdx(i => i - 1) }}
                      className="absolute left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition text-2xl font-light">‹</button>
                  )}
                  {previewIdx < attachments.length - 1 && (
                    <button onClick={e => { e.stopPropagation(); setPreviewIdx(i => i + 1) }}
                      className="absolute right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition text-2xl font-light">›</button>
                  )}
                  <img
                    src={`/api/docs/projects/${project.id}/attachments/${attachments[previewIdx].id}/image`}
                    onClick={e => e.stopPropagation()}
                    className="max-h-[92vh] max-w-[80vw] object-contain rounded-lg shadow-2xl"
                  />
                  <span className="absolute bottom-4 text-white/60 text-sm">{previewIdx + 1} / {attachments.length}</span>
                </div>
              )}

              {/* ครอบรูปเอง — ทุกรูปที่อัพต้องผ่านตรงนี้ก่อน (ไม่มี auto-crop แล้ว) */}
              {cropSrc && (
                <DocImageCropper src={cropSrc} onCancel={cancelCrop} onCropped={finishCrop} />
              )}
            </div>
          </div>

          <div className={billMode !== 'auto' ? 'hidden' : ''}>
            <DocAutoCalc
              eventDate={eventDate}
              eventEndDate={eventEndDate}
              participantCount={project?.participant_count ?? participantCount}
              isMobile={isMobile}
              projectBudget={budget}
              onBudgetChange={handleAutoCalcBudgetChange}
              onSubmit={handleAutoSubmit}
              saving={autoSaving}
              canCreate={canCreate}
              blockReason={blockReason}
              province={province}
              existingEntryCount={entries.length}
            />
          </div>

        </div>
      )}

      {/* Entry list */}
      <DocEntryList
        key={refreshKey}
        initialEntries={entries}
        isMobile={isMobile}
        canManage={canManage}
        currentUserId={currentUserId}
        onChange={setEntries}
        eligiblePayers={eligiblePayers}
        signPolicy={signPolicy}
        recentMembers={recentMembers}
      />

      {/* ล้างบิลทั้งหมด */}
      {canManage && project && entries.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={async () => {
              if (entries.some(e => e.signed_at || e.payer_signed_at)) {
                alert(t('projectView.clearAll.blockedSigned'))
                return
              }
              const typed = prompt(t('projectView.clearAll.confirmPrompt', { count: entries.length }))
              if (typed !== String(entries.length)) return
              const res = await fetch(`/api/docs/entries?projectId=${project.id}`, { method: 'DELETE' })
              if (res.ok) { setEntries([]); setRefreshKey(k => k + 1) }
              else if (res.status === 409) alert(t('projectView.clearAll.blockedSigned'))
              else alert(t('projectView.clearAll.genericError'))
            }}
            className="px-4 py-2 text-sm font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            {t('projectView.clearAll.button')}
          </button>
        </div>
      )}
    </div>
  )
}
