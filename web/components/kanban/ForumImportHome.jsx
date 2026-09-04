'use client'

/**
 * ForumImportHome — หน้าคัดกระทู้ดิสฯ (คณะทำงาน / อำเภอ / สมาชิกพรรค) เข้าเป็นการ์ด KANBAN
 *
 * ปัญหาที่หน้านี้แก้: กระทู้ 3 ห้องรวม 256 ใบ ส่วนใหญ่เป็นวงคุยไม่ใช่งาน — ทำมือไม่ไหว
 * ข้อมูลมาจากตารางพัก `kanban_forum_import` (สคริปต์ scripts/kanban/prepForumImport.mjs เตรียมไว้)
 *
 * ⭐ ค่าที่ AI เดาขึ้นเป็น**ค่าตั้งต้นพร้อมป้าย "AI เดา"** จนกว่าคนจะแตะ — ไม่ใช่ค่าจริงจนกดนำเข้า
 * ⭐ แก้ชื่อ/รายละเอียดได้ในที่ (เซฟทันทีตอนออกจากช่อง) — เขียนลง pick_* ไม่ทับ ai_*
 *    รันสคริปต์ AI ใหม่ทับได้โดยของที่แก้ไว้ไม่หาย
 * ⛔ รูปดึงสดจาก Discord ผ่าน proxy ไม่เก็บไฟล์จนกว่าจะกดนำเข้า (ดูหัวไฟล์ route ของ image)
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { AlertTriangle, Check, ExternalLink, Loader2, RotateCcw, Sparkles, X } from 'lucide-react'
import ImageLightbox from '../ImageLightbox.jsx'

const CHANNELS = [
  { id: '1126210980045664346', key: 'workgroup' },
  { id: '1223929014998274128', key: 'district' },
  { id: '1126491108004855878', key: 'members' },
]
const STATUSES = ['pending', 'skipped', 'imported']

const useIsoLayout = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** ยืดกล่องข้อความตามเนื้อหา — เรียกครั้งเดียวต่อ render (ดูคำเตือนใน PostEditor.jsx) */
function autoGrow(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/** ชิปเลือกหลายค่า (สายงาน / พื้นที่) — คลิกติด/ปลด ไม่มี dropdown ให้กดสองต่อ */
function ChipPicker({ options, value = [], onChange, disabled }) {
  const set = new Set((value || []).map(String))
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => {
        const on = set.has(String(o.id))
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            onClick={() => {
              const next = new Set(set)
              if (on) next.delete(String(o.id)); else next.add(String(o.id))
              onChange([...next])
            }}
            className={`px-2 py-0.5 rounded-full text-xs border transition ${
              on ? 'bg-teal text-white border-teal'
                 : 'border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:border-teal'
            }`}
          >
            {o.name}
          </button>
        )
      })}
    </div>
  )
}

export default function ForumImportHome() {
  const t = useTranslations('kanbanImport')
  const [status, setStatus] = useState('pending')
  const [channel, setChannel] = useState('')
  const [data, setData] = useState({ rows: [], counts: {}, fields: [], options: [] })
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [preview, setPreview] = useState(null)   // { rowId, index }
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ status })
      if (channel) q.set('channel', channel)
      const res = await fetch(`/api/kanban/import/forum?${q}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error || t('loadFailed')); return }
      setData(json)
      setSelected(new Set())
      setError(null)
    } catch {
      setError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [status, channel, t])

  useEffect(() => { load() }, [load])

  const optionsOf = useMemo(() => {
    const byLabel = {}
    for (const f of data.fields || []) {
      byLabel[f.label] = (data.options || []).filter((o) => o.field_id === f.id)
    }
    return byLabel
  }, [data])

  const patchRow = async (id, body) => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/kanban/import/forum/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t('saveFailed')); return null }
      // สถานะเปลี่ยน = แถวหลุดจากแท็บนี้ · แก้ค่าเฉยๆ = อัปเดตในที่ ไม่ต้องโหลดใหม่ทั้งหน้า
      if (body.status) setData((d) => ({ ...d, rows: d.rows.filter((r) => String(r.id) !== String(id)) }))
      else setData((d) => ({ ...d, rows: d.rows.map((r) => (String(r.id) === String(id) ? json.row : r)) }))
      return json.row
    } catch {
      setError(t('saveFailed'))
      return null
    } finally {
      setBusyId(null)
    }
  }

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s)
    if (next.has(String(id))) next.delete(String(id)); else next.add(String(id))
    return next
  })

  /** ตั้งค่าเดียวกันให้ทุกใบที่ติ๊กไว้ — งานซ้ำๆ ที่ทำทีละใบแล้วเหนื่อย */
  const applyToSelected = async (body) => {
    for (const id of selected) await patchRow(id, body)
  }

  /** สร้างการ์ดจริงจากใบที่ติ๊กไว้ — ทำทีละใบฝั่ง server (โหลดรูปจากดิสฯ ด้วย) จึงอาจใช้เวลาสักครู่ */
  const commit = async (force = false) => {
    setImporting(true)
    setResult(null)
    try {
      const res = await fetch('/api/kanban/import/forum/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selected], force }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || t('saveFailed')); return }
      setResult(json)
      // ใบที่ถูกปฏิเสธเพราะซ้ำ ต้องคาที่เลือกไว้ ไม่งั้นกดยืนยันซ้ำไม่ได้ (load() ล้างที่เลือกทิ้ง)
      const dupIds = (json.failed || []).filter((f) => f.duplicate).map((f) => String(f.id))
      await load()
      if (dupIds.length) setSelected(new Set(dupIds))
    } catch {
      setError(t('saveFailed'))
    } finally {
      setImporting(false)
    }
  }

  const rows = data.rows || []
  const counts = data.counts || {}

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-warm-700 dark:text-disc-text">{t('title')}</h1>
        <p className="text-base text-warm-400 dark:text-disc-muted mt-0.5">{t('subtitle')}</p>
      </div>

      {/* แท็บสถานะ + ตัวกรองห้อง */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-lg text-base transition ${
                status === s ? 'bg-teal text-white'
                             : 'text-warm-500 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
              }`}
            >
              {t(`status.${s}`)} {counts[s] ? <span className="opacity-70">{counts[s]}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setChannel('')}
            className={`px-2 py-0.5 rounded-full text-xs border transition ${
              channel === '' ? 'bg-warm-700 text-white border-warm-700 dark:bg-disc-text dark:text-disc-bg2'
                             : 'border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted'
            }`}
          >{t('channel.all')}</button>
          {CHANNELS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannel(c.id)}
              className={`px-2 py-0.5 rounded-full text-xs border transition ${
                channel === c.id ? 'bg-warm-700 text-white border-warm-700 dark:bg-disc-text dark:text-disc-bg2'
                                 : 'border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted'
              }`}
            >{t(`channel.${c.key}`)}</button>
          ))}
        </div>
      </div>

      {/* แถบทำทีเดียวหลายใบ */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 rounded-xl border border-teal/40 bg-white dark:bg-card-bg p-3 flex flex-col gap-2 shadow-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-base text-warm-700 dark:text-disc-text">{t('bulk.selected', { n: selected.size })}</span>
            {status === 'pending' && (
              <button
                type="button"
                onClick={() => commit(false)}
                disabled={importing}
                className="px-3 py-1 rounded-lg text-base bg-teal text-white hover:bg-teal/90 transition inline-flex items-center gap-1 disabled:opacity-60"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {t('bulk.import', { n: selected.size })}
              </button>
            )}
            <button
              type="button"
              onClick={() => applyToSelected({ status: 'skipped' })}
              className="px-3 py-1 rounded-lg text-base border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:border-red-400 hover:text-red-500 transition"
            >{t('bulk.skip')}</button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="px-3 py-1 rounded-lg text-base text-warm-400 dark:text-disc-muted hover:underline"
            >{t('bulk.clear')}</button>
          </div>
          {(optionsOf['สายงาน'] || optionsOf['พื้นที่']) && (
            <div className="flex flex-col gap-1 pt-1 border-t border-warm-100 dark:border-disc-border">
              <span className="text-xs text-warm-400 dark:text-disc-muted">{t('bulk.applyHint')}</span>
              <ChipPicker
                options={optionsOf['สายงาน'] || []}
                value={[]}
                onChange={(v) => applyToSelected({ workstreams: v })}
              />
              <ChipPicker
                options={optionsOf['พื้นที่'] || []}
                value={[]}
                onChange={(v) => applyToSelected({ areas: v })}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-base text-red-500 dark:text-red-400">{error}</p>}
      {result && (
        <div className="flex flex-col gap-1">
          <p className="text-base text-teal">
            {t('result.done', { n: result.created.length })}
            {result.failed.length > 0 && ` · ${t('result.failed', { n: result.failed.length })}`}
          </p>
          {result.failed.filter((f) => f.duplicate).length > 0 && (
            <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-500/10 p-2 flex flex-col gap-1">
              <p className="text-base text-amber-700 dark:text-amber-400">{t('result.dupBlocked')}</p>
              <ul className="text-xs text-amber-700/80 dark:text-amber-400/80 list-disc pl-4">
                {result.failed.filter((f) => f.duplicate).map((f) => <li key={f.id}>{f.reason}</li>)}
              </ul>
              <button
                type="button"
                onClick={() => commit(true)}
                disabled={importing}
                className="self-start px-3 py-1 rounded-lg text-base border border-amber-500 text-amber-700 dark:text-amber-400 hover:bg-amber-500 hover:text-white transition"
              >{t('result.dupForce')}</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-warm-400 dark:text-disc-muted">
          <Loader2 className="animate-spin inline" size={18} />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-20 text-center text-warm-400 dark:text-disc-muted text-base">{t('empty')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((row) => (
            <ImportRow
              key={row.id}
              row={row}
              t={t}
              optionsOf={optionsOf}
              busy={String(busyId) === String(row.id)}
              checked={selected.has(String(row.id))}
              onToggle={() => toggle(row.id)}
              onPatch={(body) => patchRow(row.id, body)}
              onPreview={(index) => setPreview({ rowId: row.id, index })}
            />
          ))}
        </div>
      )}

      <ImageLightbox
        items={preview ? Array.from({ length: rows.find((r) => String(r.id) === String(preview.rowId))?.image_count || 0 })
          .slice(0, 4)
          .map((_, i) => ({ src: `/api/kanban/import/forum/${preview.rowId}/image/${i}`, alt: '' })) : []}
        index={preview?.index ?? null}
        onIndex={(i) => setPreview((p) => ({ ...p, index: i }))}
        onClose={() => setPreview(null)}
      />
    </div>
  )
}

/** 1 กระทู้ — ติ๊กเลือก + แก้ค่าที่จะใช้ตอนนำเข้า */
function ImportRow({ row, t, optionsOf, busy, checked, onToggle, onPatch, onPreview }) {
  const [title, setTitle] = useState(row.pick_title ?? row.title ?? '')
  const [detail, setDetail] = useState(row.pick_detail ?? row.ai_summary ?? '')
  const detailRef = useRef(null)

  useEffect(() => { setTitle(row.pick_title ?? row.title ?? '') }, [row.pick_title, row.title])
  useEffect(() => { setDetail(row.pick_detail ?? row.ai_summary ?? '') }, [row.pick_detail, row.ai_summary])
  useIsoLayout(() => { autoGrow(detailRef.current) }, [detail])

  const ws = row.pick_workstreams ?? row.ai_workstreams ?? []
  const areas = row.pick_areas ?? row.ai_areas ?? []
  const people = row.participants || []
  const assignees = (row.pick_assignees ?? (row.ai_assignee_user_id ? [row.ai_assignee_user_id] : [])).map(String)
  const eventDate = row.pick_no_event_date ? '' : String(row.pick_event_date ?? row.ai_event_date ?? '').slice(0, 10)
  const guessed = (key) => row[`pick_${key}`] == null && (row[`ai_${key}`]?.length || row[`ai_${key}`] != null)


  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 transition ${
      checked ? 'border-teal bg-teal/5' : 'border-warm-200 dark:border-disc-border bg-white dark:bg-card-bg'
    }`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="mt-1.5 w-4 h-4 rounded border-warm-200 dark:border-disc-border accent-teal cursor-pointer shrink-0"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { const v = title.trim(); if (v && v !== (row.pick_title ?? row.title)) onPatch({ title: v }) }}
            className="w-full bg-transparent text-base font-medium text-warm-700 dark:text-disc-text border-b border-transparent hover:border-warm-200 focus:border-teal focus:outline-none"
          />
          <div className="flex items-center gap-2 flex-wrap text-xs text-warm-400 dark:text-disc-muted">
            {row.ai_is_project === true && <span className="px-1.5 py-0.5 rounded bg-teal/15 text-teal">{t('row.isProject')}</span>}
            {row.ai_is_project === false && <span className="px-1.5 py-0.5 rounded bg-warm-100 dark:bg-disc-hover">{t('row.isChat')}</span>}
            <span>{t('row.posted', { date: String(row.thread_created_at).slice(0, 10) })}</span>
            {row.author_name && <span>· {t('row.author', { name: row.author_name })}</span>}
            <span>· {t('row.messages', { n: row.message_count })}</span>
            <a href={row.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-teal hover:underline">
              {t('row.openThread')} <ExternalLink size={11} />
            </a>
          </div>
          {row.ai_reason && <p className="text-xs text-warm-400 dark:text-disc-muted italic">{row.ai_reason}</p>}
        </div>
        {busy && <Loader2 size={14} className="animate-spin text-warm-400 shrink-0 mt-1.5" />}
      </div>

      {row.dup_card_id && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
          <AlertTriangle size={12} />
          {t('row.maybeDuplicate', { ref: `KB-${row.dup_ref_no}`, title: row.dup_title, pct: Math.round(row.dup_score * 100) })}
        </p>
      )}

      <textarea
        ref={detailRef}
        value={detail}
        rows={2}
        onChange={(e) => setDetail(e.target.value)}
        onBlur={() => { if (detail !== (row.pick_detail ?? row.ai_summary ?? '')) onPatch({ detail }) }}
        placeholder={t('row.detailPlaceholder')}
        className="w-full resize-none overflow-hidden rounded-lg border border-warm-200 dark:border-disc-border bg-transparent px-2 py-1.5 text-base text-warm-700 dark:text-disc-text focus:border-teal focus:outline-none"
      />

      {row.image_count > 0 && (
        <div className="flex gap-2">
          {Array.from({ length: Math.min(row.image_count, 4) }).map((_, i) => (
            <img
              key={i}
              src={`/api/kanban/import/forum/${row.id}/image/${i}`}
              alt=""
              onClick={() => onPreview(i)}
              className="w-16 h-16 object-cover rounded-lg border border-warm-200 dark:border-disc-border cursor-zoom-in bg-warm-100 dark:bg-disc-hover"
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-1 border-t border-warm-100 dark:border-disc-border">
        <Field
          label={t('row.eventDateLabel')}
          guessed={row.pick_event_date == null && !row.pick_no_event_date && row.ai_event_date != null}
          t={t}
        >
          <input
            type="date"
            value={eventDate}
            onChange={(e) => onPatch({ eventDate: e.target.value })}
            disabled={busy}
            className="rounded-lg border border-warm-200 dark:border-disc-border bg-transparent px-2 py-1 text-base text-warm-700 dark:text-disc-text focus:border-teal focus:outline-none"
          />
          <span className="text-xs text-warm-400 dark:text-disc-muted">
            {eventDate ? t('row.eventDateHint') : t('row.noEventDateHint', { date: String(row.thread_created_at).slice(0, 10) })}
          </span>
        </Field>
        <Field label={t('row.workstreams')} guessed={guessed('workstreams')} t={t}>
          <ChipPicker options={optionsOf['สายงาน'] || []} value={ws} onChange={(v) => onPatch({ workstreams: v })} disabled={busy} />
        </Field>
        <Field label={t('row.areas')} guessed={guessed('areas')} t={t}>
          <ChipPicker options={optionsOf['พื้นที่'] || []} value={areas} onChange={(v) => onPatch({ areas: v })} disabled={busy} />
        </Field>
        <Field
          label={t('row.assignee')}
          guessed={row.pick_assignees == null && row.ai_assignee_user_id != null}
          t={t}
        >
          {people.filter((p) => p.user_id).length === 0 ? (
            <span className="text-xs text-warm-400 dark:text-disc-muted">{t('row.noKnownPeople')}</span>
          ) : (
            <ChipPicker
              options={people.filter((p) => p.user_id).map((p) => ({ id: String(p.user_id), name: p.name }))}
              value={assignees}
              onChange={(v) => onPatch({ assignees: v })}
              disabled={busy}
            />
          )}
        </Field>
      </div>

      <div className="flex gap-2">
        {row.status === 'pending' ? (
          <button
            type="button"
            onClick={() => onPatch({ status: 'skipped' })}
            disabled={busy}
            className="px-3 py-1 rounded-lg text-base border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:border-red-400 hover:text-red-500 transition inline-flex items-center gap-1"
          ><X size={14} /> {t('row.skip')}</button>
        ) : row.status === 'skipped' ? (
          <button
            type="button"
            onClick={() => onPatch({ status: 'pending' })}
            disabled={busy}
            className="px-3 py-1 rounded-lg text-base border border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:border-teal hover:text-teal transition inline-flex items-center gap-1"
          ><RotateCcw size={14} /> {t('row.unskip')}</button>
        ) : (
          <span className="text-base text-teal inline-flex items-center gap-1"><Check size={14} /> {t('row.imported')}</span>
        )}
      </div>
    </div>
  )
}

function Field({ label, guessed, t, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-warm-400 dark:text-disc-muted w-16 shrink-0">{label}</span>
      {children}
      {guessed && (
        <span className="text-xs text-teal inline-flex items-center gap-0.5" title={t('row.guessedHint')}>
          <Sparkles size={11} /> {t('row.guessed')}
        </span>
      )}
    </div>
  )
}
