'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Search, X, Plus, Trash2, CreditCard, CheckCircle } from 'lucide-react'
import DocEntryList from './DocEntryList'
import DocAutoCalc from './DocAutoCalc'

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
  return { id: Math.random().toString(36).slice(2), itemType: 'food', description: '', amount: '' }
}

export default function DocProjectView({ project: initialProject, initialEntries, canManage, eventId, eventDate, eventEndDate, participantCount }) {
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

  // payer picker state — เลือกจากรายชื่อผู้จ่ายใน settings ที่ scope ครอบคลุมจังหวัดโครงการ
  const [eligiblePayers, setEligiblePayers]   = useState([])
  const [payerDiscordId, setPayerDiscordId]   = useState(project?.payer_discord_id ?? null)
  const [settingPayer, setSettingPayer]       = useState(false)

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

  // sync payer ปัจจุบันจาก project (ชื่อมาจาก eligiblePayers list ตอน render)
  useEffect(() => {
    if (project?.payer_discord_id) setPayerDiscordId(project.payer_discord_id)
  }, [project?.payer_discord_id])

  async function selectPayer(member) {
    if (!project) { alert('กรุณาบันทึกรายการก่อนตั้งผู้จ่าย'); return }

    setSettingPayer(true)
    try {
      const res = await fetch(`/api/docs/projects/${eventId}/set-payer`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payerDiscordId: member.discord_id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setPayerDiscordId(member.discord_id)
      // refresh entry list เพื่อดู payer_sign_token ใหม่
      setRefreshKey(k => k + 1)
      const rowsRes  = await fetch(`/api/docs/entries?projectId=${project.id}`)
      const rowsData = await rowsRes.json()
      if (rowsData.success) setEntries(rowsData.data)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSettingPayer(false)
    }
  }


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
        ? { ...m, items: m.items.map(i => i.id === itemId ? { ...i, [field]: value } : i) }
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

  async function handleAutoSubmit(autoEntries, pCount) {
    setAutoSaving(true)
    try { await postEntries(autoEntries, pCount) }
    catch (err) { alert('เกิดข้อผิดพลาด: ' + err.message) }
    finally { setAutoSaving(false) }
  }

  const totalAmount  = entries.reduce((s, e) => s + Number(e.amount || 0), 0)
  const signedCount  = entries.filter(e => e.status === 'signed').length
  const payerSignedCount = entries.filter(e => e.payer_signed_at).length
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
          {canManage && signedCount > 0 && (
            <a
              href={`/api/docs/projects/${project.id}/export`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-card-bg border border-warm-200 dark:border-disc-border text-warm-700 dark:text-disc-text text-base font-medium rounded-lg hover:bg-warm-50 dark:hover:bg-disc-hover transition"
            >
              Export ZIP
            </a>
          )}
        </div>
      ) : canManage ? (
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-6">ตั้งค่ารายการเบิก</h1>
      ) : null}

      {/* Stats dashboard */}
      {project && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'รายการทั้งหมด', value: entries.length,   cls: 'text-warm-900 dark:text-disc-text' },
            { label: 'ผู้รับเซ็นแล้ว', value: signedCount,      cls: 'text-blue-600 dark:text-blue-400' },
            { label: 'ผู้จ่ายเซ็นแล้ว', value: payerSignedCount, cls: 'text-green-600 dark:text-green-400' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4">
              <div className="text-xs text-warm-500 dark:text-disc-muted mb-1">{label}</div>
              <div className={`text-2xl font-bold ${cls}`}>{value}</div>
            </div>
          ))}
          <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-4">
            <div className="text-xs text-warm-500 dark:text-disc-muted mb-1">ยอดรวม</div>
            <div className="text-2xl font-bold text-warm-900 dark:text-disc-text">
              {totalAmount.toLocaleString()} <span className="text-sm font-normal">บ.</span>
            </div>
            {project.budget && (
              <div className="text-xs text-warm-500 dark:text-disc-muted mt-0.5">
                งบ {Number(project.budget).toLocaleString()} บ.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Payer picker (manager only, project must exist) */}
      {canManage && project && (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard size={16} className="text-orange shrink-0" />
            <span className="text-base font-semibold text-warm-900 dark:text-disc-text">ผู้จ่ายเงิน</span>
          </div>

          {!project ? (
            <p className="text-sm text-warm-400 dark:text-disc-muted">บันทึกรายการเบิกก่อน จึงจะตั้งผู้จ่ายเงินได้</p>
          ) : eligiblePayers.length === 0 ? (
            <p className="text-sm text-warm-400 dark:text-disc-muted">
              ไม่มีผู้จ่ายเงินที่ครอบคลุมจังหวัด{project.province ? `${project.province}` : 'นี้'} —
              เพิ่มได้ที่ <Link href="/docs/settings" className="text-orange hover:underline">ตั้งค่าเอกสาร</Link>
            </p>
          ) : (
            <div>
              <ul className="border border-warm-200 dark:border-disc-border rounded-lg divide-y divide-warm-100 dark:divide-disc-border overflow-hidden">
                {eligiblePayers.map(p => {
                  const isSelected = p.discord_id === payerDiscordId
                  return (
                    <li key={p.discord_id}>
                      <button
                        type="button"
                        onClick={() => { if (!isSelected) selectPayer(p) }}
                        disabled={settingPayer || isSelected}
                        className={`w-full text-left px-4 py-2.5 transition flex items-center justify-between gap-3 disabled:cursor-default
                          ${isSelected ? 'bg-green-50/60 dark:bg-green-900/20' : 'hover:bg-warm-50 dark:hover:bg-disc-hover disabled:opacity-50'}`}
                      >
                        <span className="min-w-0 flex items-center gap-2">
                          {isSelected && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                          <span className="min-w-0">
                            <span className="block text-base font-medium text-warm-900 dark:text-disc-text truncate">{p.display_name}</span>
                            <span className="block text-sm text-warm-500 dark:text-disc-muted truncate">{p.position}</span>
                          </span>
                        </span>
                        {isSelected ? (
                          payerSignedCount > 0 ? (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400 shrink-0">
                              เซ็นแล้ว {payerSignedCount}/{entries.length}
                            </span>
                          ) : (
                            <span className="text-sm text-green-600 dark:text-green-400 shrink-0">ผู้จ่ายปัจจุบัน</span>
                          )
                        ) : (
                          <span className="text-sm text-orange shrink-0">{settingPayer ? 'กำลังบันทึก...' : 'เลือก'}</span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <p className="text-xs text-warm-400 dark:text-disc-muted mt-2">
                แสดงผู้จ่ายที่ดูแลจังหวัด{project.province ? `${project.province}` : 'นี้'} · เลือกคนใหม่เพื่อเปลี่ยน ระบบจะสร้างลิงก์เซ็นให้ทุกรายการอัตโนมัติ
              </p>
            </div>
          )}
        </div>
      )}

      {/* Auto-calc */}
      {canManage && (
        <DocAutoCalc
          eventDate={eventDate}
          eventEndDate={eventEndDate}
          participantCount={project?.participant_count ?? participantCount}
          onSubmit={handleAutoSubmit}
          saving={autoSaving}
        />
      )}

      {/* เพิ่มรายการ */}
      {canManage && (
        <form onSubmit={handleSubmit} className="space-y-4 mb-8">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-warm-700 dark:text-disc-text">เพิ่มรายการเบิก</span>
            {formTotal > 0 && (
              <span className="text-base font-semibold text-warm-900 dark:text-disc-text">รวม {formTotal.toLocaleString()} บ.</span>
            )}
          </div>

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
                    <div key={item.id} className="grid grid-cols-[160px_1fr_120px_36px] gap-2 items-center">
                      <select value={item.itemType} onChange={e => updateItem(m.discordId, item.id, 'itemType', e.target.value)} className={inputCls}>
                        {allowedItems.map(t => <option key={t} value={t}>{ITEM_LABELS[t]}</option>)}
                      </select>
                      <input type="text" value={item.description} onChange={e => updateItem(m.discordId, item.id, 'description', e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ)" className={inputCls} />
                      <input type="number" min="0" step="0.01" value={item.amount} onChange={e => updateItem(m.discordId, item.id, 'amount', e.target.value)} placeholder="จำนวนเงิน" className={inputCls} />
                      <button type="button" onClick={() => removeItem(m.discordId, item.id)} disabled={m.items.length === 1} className="p-1.5 rounded hover:bg-warm-100 dark:hover:bg-disc-hover text-warm-400 dark:text-disc-muted disabled:opacity-30 transition-colors">
                        <Trash2 size={15} />
                      </button>
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
              {saving ? 'กำลังบันทึก...' : `บันทึก (${members.flatMap(m => m.items.filter(i => i.amount)).length} รายการ)`}
            </button>
          )}
        </form>
      )}

      {/* Entry list */}
      <DocEntryList
        key={refreshKey}
        initialEntries={entries}
        isMobile={isMobile}
        canManage={canManage}
      />
    </div>
  )
}
