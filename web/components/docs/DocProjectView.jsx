'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Search, X, Plus, Trash2, CreditCard, CheckCircle, FilePlus, Check, Pencil, ChevronDown } from 'lucide-react'
import DocEntryList from './DocEntryList'
import DocAutoCalc from './DocAutoCalc'
import { calcSpeakerCeiling, SPEAKER_RULES } from '@/config/fund69-rules.js'

const THAI_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']
function formatDate(dateStr) {
  if (!dateStr) return ''
  const [datePart, timePart] = dateStr.split('T')
  const [y, m, d] = datePart.split('-').map(Number)
  let r = `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`
  if (timePart && timePart !== '00:00') r += ` ${timePart} น.`
  return r
}

const PROJECT_STATUS_LABEL = { draft: 'ร่าง', active: 'เปิดรับ', closed: 'ปิด' }
const PROJECT_STATUS_COLOR = {
  draft:  'bg-warm-100 text-warm-500 dark:bg-disc-hover dark:text-disc-muted',
  active: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-warm-100 text-warm-400 dark:bg-disc-hover dark:text-disc-muted',
}

const ITEM_LABELS = {
  food:          'ค่าอาหาร',
  speaker:       'ค่าวิทยากร',
  travel:        'ค่าเดินทาง',
  venue:         'ค่าสถานที่',
  accommodation: 'ค่าที่พัก',
  supplies:      'ค่าวัสดุสิ้นเปลือง',
  equipment:     'ค่าอุปกรณ์',
  photo:         'ค่าถ่ายภาพ',
}
const ALL_ITEMS    = Object.keys(ITEM_LABELS)
const MOBILE_ITEMS = ['food','travel','accommodation','supplies','equipment','photo']

const inputCls = 'w-full border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text p-2.5 text-base rounded-lg placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-orange'

function newItem() {
  return { id: Math.random().toString(36).slice(2), itemType: 'food', description: ITEM_LABELS.food, amount: '', speakerHours: 1, speakerType: 'general' }
}

function calcSpeakerAmount(hours, type) {
  return calcSpeakerCeiling({ hours: Math.floor(hours), minutes: Math.round((hours % 1) * 60), isGovOfficer: type === 'government' })
}

export default function DocProjectView({ project: initialProject, initialEntries, canManage, currentDiscordId, eventId, eventName, eventDate, eventEndDate, participantCount, actEventId }) {
  const [project, setProject]       = useState(initialProject)
  const [entries, setEntries]       = useState(initialEntries)
  const [refreshKey, setRefreshKey] = useState(0)

  // manual form state
  const [query, setQuery]                 = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown]   = useState(false)
  const debounceRef = useRef(null)
  const dropdownRef = useRef(null)
  const [members, setMembers]   = useState([])
  const [saving, setSaving]     = useState(false)
  const [autoSaving, setAutoSaving] = useState(false)
  const [billMode, setBillMode]     = useState('auto')  // 'auto' (default) | 'manual'
  const [showPayer, setShowPayer]   = useState(false)   // ผู้จ่ายเงิน — พับเก็บ default ปิด

  // ACT tab — attachments
  const [attachments, setAttachments] = useState([])
  const [attLoaded, setAttLoaded]     = useState(false)
  const [attUploading, setAttUploading] = useState(false)
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

  useEffect(() => { if (billMode === 'act' && !attLoaded) loadAttachments() }, [billMode])

  async function uploadAttachment(file) {
    if (!project?.id) return
    setAttUploading(true)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await fetch(`/api/docs/projects/${project.id}/attachments`, { method: 'POST', body: fd })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Upload failed') }
      const att = await res.json()
      setAttachments(prev => [...prev, att])
    } catch (err) {
      alert('อัพโหลดไม่สำเร็จ: ' + err.message)
    } finally {
      setAttUploading(false)
    }
  }

  async function deleteAttachment(attId) {
    if (!project?.id || !confirm('ลบไฟล์นี้?')) return
    const res = await fetch(`/api/docs/projects/${project.id}/attachments/${attId}`, { method: 'DELETE' })
    if (res.ok) setAttachments(prev => prev.filter(a => a.id !== attId))
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
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSavingBudget(false)
    }
  }

  // รายชื่อผู้จ่ายใน settings ที่ scope ครอบคลุมจังหวัดโครงการ (ใช้ map id→ชื่อ ตอนแสดงผล)
  const [eligiblePayers, setEligiblePayers]   = useState([])

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (!query.trim()) { setSearchResults([]); setShowDropdown(false); return }
    debounceRef.current = setTimeout(async () => {
      const res  = await fetch(`/api/docs/members?q=${encodeURIComponent(query)}&limit=20`)
      const data = await res.json()
      setSearchResults(data.data || [])
      setShowDropdown(true)
    }, 300)
  }, [query])

  // โหลดรายชื่อผู้จ่ายที่ scope ครอบคลุมจังหวัดของโครงการ (จาก settings)
  useEffect(() => {
    if (!canManage || !project?.province) { setEligiblePayers([]); return }
    fetch(`/api/docs/payers?province=${encodeURIComponent(project.province)}`)
      .then(r => r.json())
      .then(d => setEligiblePayers(d.data || []))
      .catch(() => setEligiblePayers([]))
  }, [canManage, project?.province])

  function addMember(member) {
    if (members.find(m => m.discordId === member.discord_id)) {
      setQuery(''); setShowDropdown(false); return
    }
    setMembers(prev => [...prev, {
      discordId: member.discord_id,
      name: member.display_name || `${member.first_name || ''} ${member.last_name || ''}`.trim() || member.discord_id,
      items: [newItem()],
    }])
    setQuery(''); setShowDropdown(false)
  }

  function removeMember(discordId) {
    setMembers(prev => prev.filter(m => m.discordId !== discordId))
  }

  function addItem(discordId) {
    setMembers(prev => prev.map(m =>
      m.discordId === discordId ? { ...m, items: [...m.items, newItem()] } : m
    ))
  }

  function removeItem(discordId, itemId) {
    setMembers(prev => prev.map(m =>
      m.discordId === discordId ? { ...m, items: m.items.filter(i => i.id !== itemId) } : m
    ))
  }

  function updateItem(discordId, itemId, field, value) {
    setMembers(prev => prev.map(m =>
      m.discordId === discordId
        ? { ...m, items: m.items.map(i => {
            if (i.id !== itemId) return i
            const next = { ...i, [field]: value }
            if (field === 'itemType' && (!i.description || i.description === ITEM_LABELS[i.itemType])) {
              next.description = ITEM_LABELS[value] || ''
            }
            if (field === 'itemType' && value === 'speaker') {
              next.amount = calcSpeakerAmount(i.speakerHours, i.speakerType)
            }
            if (field === 'speakerHours') {
              next.amount = calcSpeakerAmount(value, i.speakerType)
            }
            if (field === 'speakerType') {
              next.amount = calcSpeakerAmount(i.speakerHours, value)
            }
            return next
          }) }
        : m
    ))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const payload = []
    for (const m of members) {
      for (const item of m.items) {
        if (!item.amount) continue
        payload.push({ memberDiscordId: m.discordId, itemType: item.itemType, description: item.description || null, amount: parseFloat(item.amount) })
      }
    }
    if (payload.length === 0) { alert('กรุณาใส่รายการอย่างน้อย 1 รายการ'); return }

    setSaving(true)
    try { await postEntries(payload, null); setMembers([]) }
    catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) }
    finally { setSaving(false) }
  }

  async function postEntries(payload, pCount) {
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 2)
    const res = await fetch('/api/docs/entries', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        actEventCacheId:  parseInt(eventId),
        isMobile:         project?.is_mobile ?? false,
        participantCount: pCount ?? null,
        entries:          payload,
        tokenExpiresAt:   expiresAt.toISOString(),
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
    setAutoSaving(true)
    try { await postEntries(autoEntries, pCount); return true }
    catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message); return false }
    finally { setAutoSaving(false) }
  }

  const totalAmount  = entries.reduce((s, e) => s + Number(e.amount || 0), 0)
  const signedCount  = entries.filter(e => e.status === 'signed').length
  const payerSignedCount = entries.filter(e => e.payer_signed_at).length

  // ผู้จ่ายที่ระบบ auto-เลือกไว้ — map payer_discord_id ของ entries → ชื่อจาก eligiblePayers
  const payerById = Object.fromEntries(eligiblePayers.map(p => [p.discord_id, p]))
  const assignedPayers = [...new Set(entries.map(e => e.payer_discord_id).filter(Boolean))]
    .map(id => {
      const info  = payerById[id]
      const mine  = entries.filter(e => e.payer_discord_id === id)
      return {
        discord_id:   id,
        display_name: info?.display_name || id,
        position:     info?.position || '',
        total:        mine.length,
        signed:       mine.filter(e => e.payer_signed_at).length,
      }
    })

  const isMobile     = project?.is_mobile ?? false
  const allowedItems = isMobile ? MOBILE_ITEMS : ALL_ITEMS
  const formTotal    = members.flatMap(m => m.items).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  return (
    <div>
      {/* Header */}
      {project ? (
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{project.event_name}</h1>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PROJECT_STATUS_COLOR[project.status] || PROJECT_STATUS_COLOR.draft}`}>
                {PROJECT_STATUS_LABEL[project.status]}
              </span>
              {project.is_mobile && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange/10 text-orange">สัญจร</span>
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
            <a
              href={`/api/docs/projects/${project.id}/export?status=all`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light transition"
            >
              พิมพ์เอกสารทั้งหมด
            </a>
          )}
        </div>
      ) : canManage ? (
        <div className="mb-6">
          {eventName && <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text">{eventName}</h1>}
          <p className="text-base text-warm-500 dark:text-disc-muted mt-1">
            {eventDate ? `${formatDate(eventDate)}${eventEndDate ? ` – ${formatDate(eventEndDate)}` : ''} · ` : ''}ตั้งค่ารายการเบิก
          </p>
        </div>
      ) : null}

      {/* Stats — compact inline row */}
      {project && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl px-4 py-3 mb-6 flex flex-wrap items-center gap-x-6 gap-y-2">
          {[
            { label: 'รายการ', value: entries.length, cls: 'text-warm-900 dark:text-disc-text' },
            { label: 'ผู้รับเซ็น', value: signedCount, cls: 'text-blue-600 dark:text-blue-400' },
            { label: 'ผู้จ่ายเซ็น', value: payerSignedCount, cls: 'text-green-600 dark:text-green-400' },
          ].map(({ label, value, cls }) => (
            <span key={label} className="flex items-center gap-1.5 text-sm">
              <span className="text-warm-400 dark:text-disc-muted">{label}</span>
              <span className={`font-bold text-base ${cls}`}>{value}</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-sm">
            <span className="text-warm-400 dark:text-disc-muted">ยอดรวม</span>
            <span className="font-bold text-base text-warm-900 dark:text-disc-text">{totalAmount.toLocaleString()} บ.</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            {editingBudget ? (
              <>
                <input
                  type="number" min="0" step="0.01" autoFocus
                  value={budgetInput}
                  onChange={e => setBudgetInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveBudget(); if (e.key === 'Escape') setEditingBudget(false) }}
                  placeholder="กรอบงบ"
                  className="w-28 border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange"
                />
                <button type="button" onClick={saveBudget} disabled={savingBudget} className="p-1 rounded text-green-600 dark:text-green-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"><Check size={15} /></button>
                <button type="button" onClick={() => setEditingBudget(false)} className="p-1 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"><X size={15} /></button>
              </>
            ) : (
              <button type="button" onClick={() => { setBudgetInput(budget != null ? String(budget) : ''); setEditingBudget(true) }}
                className="flex items-center gap-1 text-xs text-warm-400 dark:text-disc-muted hover:text-orange transition">
                <Pencil size={11} />
                {budget != null ? `งบ ${budget.toLocaleString()} บ.` : 'ตั้งกรอบงบ'}
              </button>
            )}
            {budget > 0 && (totalAmount >= budget
              ? <span className="text-xs font-medium text-green-600 dark:text-green-400">✓ ถึงกรอบงบ</span>
              : <span className="text-xs font-medium text-amber-600 dark:text-amber-400">ขาด {(budget - totalAmount).toLocaleString()} บ.</span>
            )}
          </span>
        </div>
      )}

      {/* เลือกโหมดเพิ่มบิล: คำนวณอัตโนมัติ (default) / เพิ่มเอง */}
      {canManage && (
        <div className="mb-6">
          <div className="flex gap-2 mb-4 border-b border-warm-200 dark:border-disc-border">
            {[{ key: 'auto', label: 'อัตโนมัติ' }, { key: 'manual', label: 'กำหนดเอง' }, { key: 'act', label: 'ACT' }].map(t => (
              <button
                key={t.key}
                type="button"
                onClick={() => setBillMode(t.key)}
                className={`px-4 py-2 text-base font-semibold border-b-2 -mb-px transition
                  ${billMode === t.key
                    ? 'border-orange text-orange'
                    : 'border-transparent text-warm-500 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={billMode !== 'act' ? 'hidden' : ''}>
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 space-y-5">
              {/* ลิงก์ ACT */}
              {actEventId ? (
                <div>
                  <p className="text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest mb-2">ลิงก์เอกสาร</p>
                  <a href={`https://act.peoplesparty.or.th/ect-paper-3/?eid=${actEventId}`} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-orange hover:underline font-medium text-sm">
                    พิมพ์แนบท้าย 3 (ใบรายชื่อเปล่า) ↗
                  </a>
                </div>
              ) : (
                <p className="text-warm-400 dark:text-disc-muted text-sm">ไม่พบ ACT Event ID</p>
              )}

              {/* Upload zone */}
              {project && (<>
                <div>
                  <p className="text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest mb-2">อัพโหลดแนบท้าย 3 ที่เซ็นแล้ว</p>
                  <button
                    type="button"
                    onClick={() => attInputRef.current?.click()}
                    disabled={attUploading}
                    className="w-full border-2 border-dashed border-warm-300 dark:border-disc-border rounded-xl py-8 flex flex-col items-center gap-2 text-warm-400 dark:text-disc-muted hover:border-orange hover:text-orange transition disabled:opacity-50 cursor-pointer"
                  >
                    {attUploading
                      ? <span className="text-sm">กำลังประมวลผล...</span>
                      : (<>
                          <FilePlus size={28} />
                          <span className="text-sm">แตะเพื่ออัพโหลดภาพเอกสาร</span>
                          <span className="text-xs opacity-70">JPG / PNG · auto-crop A4</span>
                        </>)
                    }
                  </button>
                  <input
                    ref={attInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    multiple
                    className="hidden"
                    onChange={e => { [...(e.target.files || [])].forEach(f => uploadAttachment(f)); e.target.value = '' }}
                  />
                </div>

                {/* Thumbnail grid */}
                {attachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {attachments.map((att, i) => (
                      <div key={att.id} className="relative group rounded-lg overflow-hidden border border-warm-200 dark:border-disc-border aspect-[3/4] bg-warm-100 dark:bg-disc-hover">
                        <img
                          src={`/api/docs/projects/${project.id}/attachments/${att.id}/image`}
                          alt={att.original_name || `เอกสาร ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => deleteAttachment(att.id)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          <X size={14} />
                        </button>
                        <span className="absolute bottom-0 left-0 right-0 text-[10px] text-center bg-black/40 text-white py-0.5 truncate px-1">
                          {att.original_name || `เอกสาร ${i + 1}`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>)}
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
            />
          </div>

          <div className={billMode !== 'manual' ? 'hidden' : ''}>
            <form onSubmit={handleSubmit} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 mb-6 space-y-4">
          {formTotal > 0 && (
            <div className="flex justify-end">
              <span className="text-base font-semibold text-warm-900 dark:text-disc-text">รวม {formTotal.toLocaleString()} บ.</span>
            </div>
          )}

          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-400 dark:text-disc-muted pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="ค้นชื่อสมาชิก..."
                className={`${inputCls} pl-9`}
              />
            </div>
            {showDropdown && searchResults.length > 0 && (
              <ul className="absolute z-10 w-full mt-1 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {searchResults.map(m => (
                  <li key={m.discord_id}>
                    <button
                      type="button"
                      onClick={() => addMember(m)}
                      className="w-full text-left px-4 py-2.5 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
                    >
                      <span className="text-base font-medium text-warm-900 dark:text-disc-text">{m.display_name}</span>
                      <span className="ml-2 text-sm text-warm-500 dark:text-disc-muted">
                        {m.username && `@${m.username}`}
                        {(m.first_name || m.last_name) && ` · ${m.first_name || ''} ${m.last_name || ''}`.trim()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {members.map(m => {
            const memberTotal = m.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
            return (
              <div key={m.discordId} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg overflow-hidden">
                <div className="px-4 py-3 border-b border-warm-200 dark:border-disc-border flex items-center justify-between">
                  <span className="font-semibold text-warm-900 dark:text-disc-text">{m.name}</span>
                  <div className="flex items-center gap-3">
                    {memberTotal > 0 && (
                      <span className="text-sm text-warm-500 dark:text-disc-muted">{memberTotal.toLocaleString()} บ.</span>
                    )}
                    <button type="button" onClick={() => removeMember(m.discordId)} className="p-1 rounded hover:bg-warm-100 dark:hover:bg-disc-hover text-red-500 dark:text-red-400 transition-colors">
                      <X size={16} />
                    </button>
                  </div>
                </div>
                <div className="p-3 space-y-2">
                  {m.items.map(item => (
                    <div key={item.id} className="flex flex-wrap gap-2 items-center">
                      <select value={item.itemType} onChange={e => updateItem(m.discordId, item.id, 'itemType', e.target.value)} className={`${inputCls} w-full sm:w-40 shrink-0`}>
                        {allowedItems.map(t => <option key={t} value={t}>{ITEM_LABELS[t]}</option>)}
                      </select>
                      {item.itemType === 'speaker' && (<>
                        <select value={item.speakerHours} onChange={e => updateItem(m.discordId, item.id, 'speakerHours', Number(e.target.value))} className={`${inputCls} w-24 shrink-0`}>
                          {[0.5,1,1.5,2,2.5,3,3.5,4,5,6].map(h => <option key={h} value={h}>{h} ชม.</option>)}
                        </select>
                        <select value={item.speakerType} onChange={e => updateItem(m.discordId, item.id, 'speakerType', e.target.value)} className={`${inputCls} w-full sm:w-36 shrink-0`}>
                          <option value="general">ทั่วไป ({SPEAKER_RULES.rates.general.toLocaleString()})</option>
                          <option value="government">ข้าราชการ ({SPEAKER_RULES.rates.government.toLocaleString()})</option>
                        </select>
                      </>)}
                      <input type="text" value={item.description} onChange={e => updateItem(m.discordId, item.id, 'description', e.target.value)} placeholder="หมายเหตุ" className={`${inputCls} flex-1 min-w-28`} />
                      <div className="flex gap-2 items-center shrink-0">
                        <input type="number" min="0" step="0.01" value={item.amount} onChange={e => updateItem(m.discordId, item.id, 'amount', e.target.value)} placeholder="จำนวนเงิน" className={`${inputCls} w-28`} />
                        <button type="button" onClick={() => removeItem(m.discordId, item.id)} disabled={m.items.length === 1} className="p-1.5 rounded hover:bg-warm-100 dark:hover:bg-disc-hover text-warm-400 dark:text-disc-muted disabled:opacity-30 transition-colors shrink-0">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button type="button" onClick={() => addItem(m.discordId)} className="flex items-center gap-1.5 text-sm text-teal hover:text-teal/80 transition mt-1">
                    <Plus size={14} /> เพิ่มรายการ
                  </button>
                </div>
              </div>
            )
          })}

          {members.length > 0 && (
            <button type="submit" disabled={saving} className="px-6 py-2.5 bg-orange text-white text-base font-semibold rounded-lg hover:bg-orange-light disabled:opacity-50 transition">
              {saving ? 'กำลังสร้าง...' : `สร้างรายการ (${members.flatMap(m => m.items.filter(i => i.amount)).length})`}
            </button>
          )}
            </form>
          </div>
        </div>
      )}

      {/* ผู้จ่ายเงิน — ระบบเลือกอัตโนมัติจาก settings (read-only) */}
      {canManage && project && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 mb-6">
          <button
            type="button"
            onClick={() => setShowPayer(v => !v)}
            className="w-full flex items-center gap-2 text-left"
          >
            <CreditCard size={16} className="text-orange shrink-0" />
            <span className="text-base font-semibold text-warm-900 dark:text-disc-text">
              ผู้จ่ายเงิน
              <span className="ml-1 font-normal text-warm-400 dark:text-disc-muted">({assignedPayers.length || (eligiblePayers.length ? 1 : 0)})</span>
            </span>
            <ChevronDown size={16} className={`ml-auto text-warm-400 dark:text-disc-muted transition-transform ${showPayer ? 'rotate-180' : ''}`} />
          </button>

          {showPayer && (eligiblePayers.length === 0 ? (
            <p className="text-sm text-warm-400 dark:text-disc-muted mt-3">
              ไม่มีผู้จ่ายเงินที่ครอบคลุมจังหวัด{project.province ? `${project.province}` : 'นี้'} —
              เพิ่มได้ที่ <Link href="/docs/settings" className="text-orange hover:underline">ตั้งค่าเอกสาร</Link>
            </p>
          ) : (
            <div className="mt-3">
              <ul className="border border-warm-200 dark:border-disc-border rounded-lg divide-y divide-warm-100 dark:divide-disc-border overflow-hidden">
                {(assignedPayers.length ? assignedPayers : [{
                  discord_id:   eligiblePayers[0].discord_id,
                  display_name: eligiblePayers[0].display_name,
                  position:     eligiblePayers[0].position,
                  total: 0, signed: 0,
                }]).map(p => (
                  <li key={p.discord_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <span className="min-w-0 flex items-center gap-2">
                      <CheckCircle size={16} className="text-green-500 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-base font-medium text-warm-900 dark:text-disc-text truncate">{p.display_name}</span>
                        <span className="block text-sm text-warm-500 dark:text-disc-muted truncate">{p.position}</span>
                      </span>
                    </span>
                    {p.total > 0 && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                        เซ็นแล้ว {p.signed}/{p.total}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-warm-400 dark:text-disc-muted mt-2">
                ระบบเลือกผู้จ่ายอัตโนมัติจาก<Link href="/docs/settings" className="text-orange hover:underline">ตั้งค่าเอกสาร</Link> (ผู้ดูแลจังหวัด{project.province ? `${project.province}` : 'นี้'}) · ถ้าผู้เบิกเป็นผู้จ่ายเอง ระบบสลับเป็นผู้จ่ายสำรองให้อัตโนมัติ
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Entry list */}
      <DocEntryList
        key={refreshKey}
        initialEntries={entries}
        isMobile={isMobile}
        canManage={canManage}
        currentDiscordId={currentDiscordId}
        onChange={setEntries}
      />

      {/* ล้างบิลทั้งหมด */}
      {canManage && project && entries.length > 0 && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={async () => {
              if (!confirm(`ล้างบิลทั้งหมด ${entries.length} รายการ? ไม่สามารถยกเลิกได้`)) return
              const res = await fetch(`/api/docs/entries?projectId=${project.id}`, { method: 'DELETE' })
              if (res.ok) { setEntries([]); setRefreshKey(k => k + 1) }
              else alert('เกิดข้อผิดพลาด')
            }}
            className="px-4 py-2 text-sm font-medium text-red-500 dark:text-red-400 border border-red-200 dark:border-red-900 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
          >
            ล้างบิลทั้งหมด
          </button>
        </div>
      )}
    </div>
  )
}
