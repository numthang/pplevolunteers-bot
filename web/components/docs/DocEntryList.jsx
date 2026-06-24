'use client'

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, Check, X } from 'lucide-react'

const ITEM_LABELS = {
  food:          'ค่าอาหาร',
  speaker:       'ค่าวิทยากร',
  travel:        'ค่าเดินทาง',
  venue:         'ค่าสถานที่',
  accommodation: 'ค่าที่พัก',
  sound:         'ค่าเช่าเครื่องเสียง',
  supplies:      'ค่าวัสดุสิ้นเปลือง',
  equipment:     'ค่าอุปกรณ์',
  photo:         'ค่าถ่ายภาพ',
}
const ALL_ITEMS    = Object.keys(ITEM_LABELS)
const MOBILE_ITEMS = ['food','travel','accommodation','supplies','equipment','photo']

const BADGE_BASE    = 'text-sm font-medium px-3 py-1 rounded-full transition'
const BADGE_PENDING = 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
const BADGE_MUTED   = 'bg-warm-100 text-warm-400 dark:bg-disc-hover dark:text-disc-muted'
const BADGE_MUTED_LINK = BADGE_MUTED + ' hover:bg-warm-200 dark:hover:bg-disc-border'

const inputCls = 'h-8 border border-warm-200 dark:border-disc-border bg-white dark:bg-disc-hover text-warm-900 dark:text-disc-text text-sm rounded px-2 focus:outline-none focus:ring-1 focus:ring-orange'
const selectCls = inputCls + ' appearance-none pr-6'

export default function DocEntryList({ initialEntries, isMobile, canManage, currentDiscordId, onAddClick, onChange, eligiblePayers = [], eventId, recentMembers = [] }) {
  const [entries, setEntries] = useState(initialEntries)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm]   = useState({})
  const [saving, setSaving]       = useState(false)
  const [payerSaving, setPayerSaving] = useState(null)  // recipientDiscordId กำลังบันทึก

  // member search state (edit form)
  const [memberResults, setMemberResults] = useState([])
  const [memberOpen, setMemberOpen]       = useState(false)
  const debounceRef = useRef(null)
  const memberWrapRef = useRef(null)

  useEffect(() => {
    const h = e => { if (memberWrapRef.current && !memberWrapRef.current.contains(e.target)) setMemberOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // inline assign state (for unassigned entries)

  function signBadge(label, token, signed) {
    if (!token) return <span className={`${BADGE_BASE} ${BADGE_MUTED}`}>{label}</span>
    return <Link href={`/docs/sign/${token}`} target="_blank" className={`${BADGE_BASE} ${signed ? BADGE_MUTED_LINK : BADGE_PENDING}`}>{label}</Link>
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditForm({
      itemType:        entry.item_type,
      description:     entry.description || '',
      amount:          entry.amount,
      memberDiscordId: entry.member_discord_id,
      memberName:      entry.display_name || entry.member_discord_id,
      payerDiscordId:  entry.payer_discord_id || '',
    })
    setMemberResults([])
    setMemberOpen(false)
  }

  function cancelEdit() { setEditingId(null); setEditForm({}); setMemberResults([]); setMemberOpen(false) }

  function onMemberQueryChange(q) {
    setEditForm(f => ({ ...f, memberName: q, memberDiscordId: f.memberDiscordId }))
    clearTimeout(debounceRef.current)
    if (!q.trim()) { setMemberResults([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/docs/members?q=${encodeURIComponent(q)}&limit=10`)
        const d = await res.json()
        setMemberResults(d.data || [])
        setMemberOpen(true)
      } catch {}
    }, 300)
  }

  function selectMember(m) {
    const label = [m.first_name, m.last_name].filter(Boolean).join(' ') || m.display_name
    setEditForm(f => ({ ...f, memberDiscordId: m.discord_id, memberName: m.display_name + (label !== m.display_name ? ` (${label})` : '') }))
    setMemberOpen(false)
  }

  async function saveEdit(entryId) {
    if (!editForm.memberDiscordId) { alert('กรุณาระบุผู้รับก่อนบันทึก'); return }
    const entry = entries.find(e => e.id === entryId)
    const memberChanged = editForm.memberDiscordId !== entry?.member_discord_id
    if (memberChanged && entry?.status === 'signed') {
      if (!confirm('รายการนี้เซ็นรับแล้ว การเปลี่ยนผู้รับเงินจะ reset ลายเซ็น — ยืนยัน?')) return
    }
    setSaving(true)
    try {
      const payerChanged = editForm.payerDiscordId && editForm.payerDiscordId !== entry?.payer_discord_id
      const res = await fetch(`/api/docs/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemType:        editForm.itemType,
          description:     editForm.description || null,
          amount:          parseFloat(editForm.amount),
          memberDiscordId: editForm.memberDiscordId,
          ...(payerChanged ? { payerDiscordId: editForm.payerDiscordId } : {}),
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const d = await res.json()
      const next = entries.map(e =>
        e.id === entryId
          ? { ...e, item_type: editForm.itemType, description: editForm.description || null, amount: editForm.amount,
              member_discord_id: editForm.memberDiscordId, display_name: editForm.memberName.split(' (')[0],
              ...(d.resetSignature ? { status: 'pending', signed_at: null } : {}) }
          : e
      )
      setEntries(next)
      onChange?.(next)
      setEditingId(null)

      // เปลี่ยนผู้รับหรือผู้จ่าย → refetch เพื่อดึง payer_display_name / token ใหม่จาก server
      if (memberChanged || payerChanged) {
        try {
          const r2 = await fetch(`/api/docs/entries?projectId=${entry.project_id}`)
          if (r2.ok) { const dd = await r2.json(); if (dd.data) { setEntries(dd.data); onChange?.(dd.data) } }
        } catch {}
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(entryId) {
    if (!confirm('ลบรายการนี้?')) return
    try {
      const res = await fetch(`/api/docs/entries/${entryId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error)
      const next = entries.filter(e => e.id !== entryId)
      setEntries(next)
      onChange?.(next)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    }
  }

  // เปลี่ยนผู้จ่ายของทุก entry ในกลุ่มผู้รับคนหนึ่ง (manual override)
  async function changePayer(recipientDiscordId, payerDiscordId, groupItems) {
    if (!payerDiscordId || !eventId) return
    const curPayer = groupItems[0]?.payer_discord_id
    if (payerDiscordId === curPayer) return
    if (groupItems.some(e => e.payer_signed_at) &&
        !confirm('ผู้จ่ายเดิมเซ็นแล้ว การเปลี่ยนจะ reset ลายเซ็นผู้จ่าย — ยืนยัน?')) return

    setPayerSaving(recipientDiscordId)
    try {
      const res = await fetch(`/api/docs/projects/${eventId}/set-payer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientDiscordId, payerDiscordId }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      const d = await res.json()
      const tokenById = Object.fromEntries((d.data?.entries || []).map(t => [t.id, t]))
      const info = eligiblePayers.find(p => p.discord_id === payerDiscordId)
      const next = entries.map(e =>
        e.member_discord_id === recipientDiscordId
          ? { ...e,
              payer_discord_id:   payerDiscordId,
              payer_sign_token:   tokenById[e.id]?.payer_sign_token ?? e.payer_sign_token,
              payer_signed_at:    null,
              payer_display_name: info?.display_name ?? e.payer_display_name,
              payer_position:     info?.position     ?? e.payer_position }
          : e
      )
      setEntries(next)
      onChange?.(next)
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + err.message)
    } finally {
      setPayerSaving(null)
    }
  }

  const byMember = []
  for (const e of entries) {
    const key = e.member_discord_id ?? `__unassigned_${e.id}`
    const existing = byMember.find(g => g.key === key)
    if (existing) {
      existing.items.push(e)
    } else {
      const realName = [e.ngs_first_name, e.ngs_last_name].filter(Boolean).join(' ')
      byMember.push({
        key,
        name:         e.member_discord_id ? (e.display_name || e.member_discord_id) : null,
        username:     e.username || null,
        realName,
        isUnassigned: !e.member_discord_id,
        items:        [e],
      })
    }
  }

  const allowedItems = isMobile ? MOBILE_ITEMS : ALL_ITEMS

  if (entries.length === 0) {
    return (
      <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center">
        <p className="text-warm-500 dark:text-disc-text mb-4">ยังไม่มีรายการเบิก</p>
        {canManage && onAddClick && (
          <button onClick={onAddClick} className="text-orange hover:underline text-base font-medium">
            เพิ่มรายการ →
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {byMember.map(({ key, name, username, realName, isUnassigned, items }) => {
        const memberTotal  = items.reduce((s, e) => s + Number(e.amount || 0), 0)
        return (
          <div key={key} className={`bg-card-bg border ${isUnassigned ? 'border-orange' : 'border-warm-200 dark:border-disc-border'} rounded-lg ${items.some(e => editingId === e.id) ? 'overflow-visible' : 'overflow-hidden'}`}>
            <div className="px-4 py-3 border-b border-warm-200 dark:border-disc-border flex items-center justify-between gap-3 bg-warm-50 dark:bg-disc-hover rounded-t-lg">
              {isUnassigned ? (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="font-semibold text-orange">ยังไม่ระบุผู้รับ</span>
                </div>
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-warm-900 dark:text-disc-text">
                      {realName || (username ? `@${username}` : name)}
                    </span>
                  </div>
                </div>
              )}
              <span className="text-sm text-warm-700 dark:text-disc-text shrink-0">{memberTotal.toLocaleString()} บ.</span>
            </div>
            <div className="divide-y divide-warm-100 dark:divide-disc-border" id={`entries-${key}`}>
              {items.map(entry => {
                const isEditing = editingId === entry.id
                return (
                  <div key={entry.id} className="px-4 py-3">
                    {isEditing ? (
                      <div className="space-y-2">
                        {/* payee search — บนสุด */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-warm-600 dark:text-disc-text shrink-0">ผู้รับ</span>
                          <div className="relative flex-1" ref={memberWrapRef}>
                            <input
                              type="text"
                              value={editForm.memberName || ''}
                              onChange={e => onMemberQueryChange(e.target.value)}
                              onFocus={() => {
                                const q = editForm.memberName || ''
                                if (!q.trim() && recentMembers.length > 0) setMemberOpen(true)
                                else if (q.trim() && memberResults.length > 0) setMemberOpen(true)
                              }}
                              placeholder="ค้นหาผู้รับเงิน..."
                              className={`${inputCls} w-full`}
                            />
                            {memberOpen && (() => {
                              const q = editForm.memberName || ''
                              const list = q.trim() ? memberResults : recentMembers
                              if (!list.length) return null
                              return (
                                <ul className="absolute z-20 mt-1 w-full bg-white dark:bg-disc-hover border border-warm-200 dark:border-disc-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                                  {!q.trim() && <li className="px-3 pt-2 pb-1 text-xs text-warm-400 dark:text-disc-muted font-medium">ล่าสุด</li>}
                                  {list.map(m => {
                                    const realName = [m.first_name, m.last_name].filter(Boolean).join(' ')
                                    return (
                                      <li
                                        key={m.discord_id}
                                        onMouseDown={() => selectMember(m)}
                                        className="px-3 py-2 cursor-pointer hover:bg-warm-50 dark:hover:bg-disc-border text-sm"
                                      >
                                        <span className="text-warm-900 dark:text-disc-text">{m.display_name}</span>
                                        {m.username && <span className="ml-1 text-warm-500 dark:text-disc-text">@{m.username}</span>}
                                        {realName && <span className="ml-1.5 text-warm-500 dark:text-disc-text">({realName})</span>}
                                      </li>
                                    )
                                  })}
                                </ul>
                              )
                            })()}
                          </div>
                        </div>
                        {/* item type + description */}
                        <div className="flex items-center gap-2">
                          <select
                            value={editForm.itemType}
                            onChange={e => setEditForm(f => ({ ...f, itemType: e.target.value }))}
                            className={`${selectCls} w-32 shrink-0`}
                          >
                            {allowedItems.map(t => <option key={t} value={t}>{ITEM_LABELS[t]}</option>)}
                          </select>
                          <input
                            type="text"
                            value={editForm.description}
                            onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="หมายเหตุ"
                            className={`${inputCls} flex-1 min-w-0`}
                          />
                        </div>
                        {/* amount + actions */}
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={editForm.amount}
                            onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                            className={`${inputCls} flex-1`}
                          />
                          <button
                            onClick={() => saveEdit(entry.id)}
                            disabled={saving}
                            className="p-1.5 rounded text-green-600 dark:text-green-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                          >
                            <Check size={15} />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded text-warm-400 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                          >
                            <X size={15} />
                          </button>
                        </div>
                        {/* payer dropdown — ล่างสุด */}
                        {eligiblePayers.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-warm-600 dark:text-disc-text shrink-0">ผู้จ่าย</span>
                            <select
                              value={editForm.payerDiscordId || ''}
                              onChange={e => setEditForm(f => ({ ...f, payerDiscordId: e.target.value }))}
                              className={`${selectCls} flex-1`}
                            >
                              <option value="">— เลือกผู้จ่าย —</option>
                              {eligiblePayers.filter(p => p.discord_id !== editForm.memberDiscordId).map(p => (
                                <option key={p.discord_id} value={p.discord_id}>
                                  {p.display_name}{p.position ? ` · ${p.position}` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        {/* ซ้าย: ชื่อหมวด + รายละเอียด (มือถือมีจำนวนเงินท้ายบรรทัด) */}
                        <div className="flex items-start justify-between gap-2 sm:block sm:min-w-0 sm:flex-1">
                          <div className="min-w-0">
                            <div className="text-base text-warm-900 dark:text-disc-text">
                              {ITEM_LABELS[entry.item_type] || entry.item_type}
                            </div>
                            {entry.description && (
                              <div className="text-sm text-warm-500 dark:text-disc-text break-words">{entry.description}</div>
                            )}
                          </div>
                          <span className="text-base font-medium text-warm-900 dark:text-disc-text sm:hidden shrink-0">
                            {Number(entry.amount).toLocaleString()} บ.
                          </span>
                        </div>
                        {/* ขวา: จำนวนเงิน (desktop) + badges/icons */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="hidden sm:inline text-base font-medium text-warm-900 dark:text-disc-text">
                            {Number(entry.amount).toLocaleString()} บ.
                          </span>
                          {signBadge('เซ็นรับ', entry.member_discord_id ? entry.sign_token : null, entry.status === 'signed')}
                          {signBadge('เซ็นจ่าย', entry.payer_sign_token, !!entry.payer_signed_at)}
                          {canManage && entry.status === 'signed' && (
                            <a href={`/api/docs/entries/${entry.id}/pdf`} target="_blank" className="text-xs text-orange hover:underline">
                              PDF
                            </a>
                          )}
                          {canManage && (
                            <>
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-warm-700 dark:hover:text-disc-text hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                                title="แก้ไข"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => handleDelete(entry.id)}
                                className="p-1 rounded text-warm-400 dark:text-disc-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-warm-100 dark:hover:bg-disc-hover transition"
                                title="ลบ"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {!isUnassigned && items[0]?.payer_display_name && (
              <div className="px-4 py-2 border-t border-warm-100 dark:border-disc-border flex items-center gap-1.5">
                <span className="text-xs text-warm-600 dark:text-disc-text">ผู้จ่าย</span>
                <span className="text-xs text-warm-700 dark:text-disc-text">{items[0].payer_display_name}</span>
                {items[0].payer_position && (
                  <span className="text-xs text-warm-500 dark:text-disc-text">· {items[0].payer_position}</span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
