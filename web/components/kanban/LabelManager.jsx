'use client'

/**
 * LabelManager — คลังป้ายของ org (/kanban/labels) · admin เท่านั้น
 *
 * ดีไซน์:
 *   - เป็นหน้า **Update** → autosave ห้ามมีปุ่มบันทึก (กฎ CLAUDE.md 2026-07-30)
 *     ที่ต้องมีแทนคือ ป้ายสถานะ "กำลังบันทึก…/บันทึกแล้ว" + beforeunload ตอนยังเซฟไม่เสร็จ
 *   - ชื่อป้ายเซฟตอนออกจากช่อง/กด Enter · กลุ่มกับสีเซฟทันทีที่เลือก (เป็น action ครั้งเดียวจบ)
 *   - ไม่มีปุ่มลบ — ซ่อนอย่างเดียว (ป้ายที่ติดการ์ดอยู่ห้ามหายเงียบ)
 *
 * ⛔ ชื่อกลุ่มมาจาก DB ล้วน ห้ามแปลผ่าน t() · สีเลือกได้เฉพาะในคลังพาสเทลของ user (LABEL_PALETTE)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ArrowLeft, Eye, EyeOff, Loader2 } from 'lucide-react'
import { chipProps, LABEL_PALETTE } from '@/lib/kanbanLabelColors.js'

function LabelRow({ label, groupNames, t, onPatch, busy }) {
  const [name, setName] = useState(label.name)
  const [colorOpen, setColorOpen] = useState(false)

  useEffect(() => { setName(label.name) }, [label.name])

  const tint = chipProps(label)

  const commitName = () => {
    const clean = name.trim()
    if (!clean || clean === label.name) { setName(label.name); return }
    onPatch(label.id, { name: clean })
  }

  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-3 flex flex-wrap items-center gap-3">
      {/* ตัวอย่างชิปจริง — เห็นผลของสีที่เลือกทันทีในหน้าเดียวกัน */}
      <span style={tint.style} className={`px-3 py-1 text-sm font-medium rounded-full ${tint.className}`}>
        {label.name}
      </span>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setName(label.name) }}
        maxLength={60}
        title={t('labelsPage.editName')}
        className="flex-1 min-w-[10rem] h-11 px-3 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal"
      />

      <select
        value={label.group_name || ''}
        onChange={(e) => onPatch(label.id, { groupName: e.target.value })}
        className="h-11 pl-3 pr-8 text-base rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-teal cursor-pointer"
      >
        <option value="">{t('labelsPage.noGroup')}</option>
        {groupNames.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>

      <button
        onClick={() => setColorOpen((v) => !v)}
        className="flex items-center gap-2 h-11 px-4 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover"
      >
        <span className="w-4 h-4 rounded-full" style={{ background: tint.style['--kb'] }} />
        {t('labelsPage.colColor')}
      </button>

      <span className="text-base text-warm-500 dark:text-disc-muted">
        {t('labelsPage.cardCount', { count: label.card_count })}
      </span>

      <button
        onClick={() => {
          if (label.archived_at) { onPatch(label.id, { archived: false }); return }
          if (confirm(t('labelsPage.confirmHide', { name: label.name }))) onPatch(label.id, { archived: true })
        }}
        className="flex items-center gap-1.5 h-11 px-4 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium"
      >
        {label.archived_at ? <Eye size={16} /> : <EyeOff size={16} />}
        {label.archived_at ? t('labelsPage.unhide') : t('labelsPage.hide')}
      </button>

      {busy && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}

      {colorOpen && (
        <div className="w-full flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => { onPatch(label.id, { color: null }); setColorOpen(false) }}
            title={t('labelsPage.colorAutoTitle')}
            className={`px-3 py-1 text-sm rounded-full border font-medium ${
              label.color ? 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover' : 'border-teal ring-1 ring-teal text-warm-900 dark:text-disc-text'
            }`}
          >
            {t('labelsPage.colorAuto')}
          </button>
          {LABEL_PALETTE.map((hex) => (
            <button
              key={hex}
              onClick={() => { onPatch(label.id, { color: hex }); setColorOpen(false) }}
              style={{ background: hex }}
              className={`w-8 h-8 rounded-full border ${label.color === hex ? 'ring-2 ring-teal border-transparent' : 'border-warm-200 dark:border-disc-border'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function LabelManager() {
  const t = useTranslations('kanban')

  const [labels, setLabels] = useState([])
  const [groupNames, setGroupNames] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [savedAt, setSavedAt] = useState(0)
  const saving = busyId !== null

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/kanban/labels?view=manage')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(res.status === 403 ? t('labelsPage.adminOnly') : (json.error || t('loadFailed'))); return }
      setLabels(json.labels || [])
      setGroupNames(json.groupNames || [])
    } catch {
      setLoadError(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  // ยังเซฟไม่เสร็จแล้วปิดแท็บ = ของหาย → เตือนก่อน (คู่กับป้ายสถานะ ตามกฎ Update+autosave)
  useEffect(() => {
    if (!saving) return
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [saving])

  async function patch(labelId, body) {
    setSaveError('')
    setBusyId(labelId)
    try {
      const res = await fetch(`/api/kanban/labels/${labelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setSaveError(res.status === 409 ? t('labelsPage.duplicate') : (json.error || t('saveFailed')))
        return
      }
      setSavedAt(Date.now())
      await load()   // ซ่อน/เลิกซ่อน/ย้ายกลุ่ม ทำให้ลำดับและกองเปลี่ยน — โหลดใหม่ทีเดียวจบ
    } catch {
      setSaveError(t('saveFailed'))
    } finally {
      setBusyId(null)
    }
  }

  const active = labels.filter((l) => !l.archived_at)
  const hidden = labels.filter((l) => l.archived_at)

  // จัดกองตามกลุ่ม — ชื่อกลุ่มมาจาก DB (ห้าม hardcode) · กองไม่มีกลุ่มไปท้ายสุด
  const groups = []
  for (const l of active) {
    const key = l.group_name || ''
    let g = groups.find((x) => x.key === key)
    if (!g) { g = { key, name: l.group_name, labels: [] }; groups.push(g) }
    g.labels.push(l)
  }
  groups.sort((a, b) => (a.key === '') - (b.key === ''))

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('labelsPage.title')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted">{t('labelsPage.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* ป้ายสถานะแทนปุ่มบันทึก (หน้า Update + autosave) */}
          {saving ? (
            <span className="flex items-center gap-1.5 text-base text-warm-500 dark:text-disc-muted">
              <Loader2 size={16} className="animate-spin" /> {t('labelsPage.saving')}
            </span>
          ) : savedAt ? (
            <span className="text-base text-warm-500 dark:text-disc-muted">{t('labelsPage.saved')}</span>
          ) : null}
          <Link
            href="/kanban"
            className="flex items-center gap-1.5 border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover rounded-lg text-base font-medium px-4 py-2"
          >
            <ArrowLeft size={16} />
            {t('labelsPage.backLink')}
          </Link>
        </div>
      </div>

      {loadError && <p className="text-base text-red-500 dark:text-red-400">{loadError}</p>}
      {saveError && <p className="text-base text-red-500 dark:text-red-400">{saveError}</p>}

      {loading ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {t('loading')}
        </div>
      ) : !loadError && labels.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-10 text-center text-base text-warm-400 dark:text-disc-muted">
          {t('labelsPage.empty')}
        </div>
      ) : (
        <>
          {groups.map((g) => (
            <div key={g.key} className="space-y-2">
              {/* ชื่อกลุ่มมาจาก DB — ห้ามแปลผ่าน t() */}
              <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">{g.name || t('labelsPage.noGroup')}</h2>
              <div className="flex flex-col gap-2">
                {g.labels.map((l) => (
                  <LabelRow key={l.id} label={l} groupNames={groupNames} t={t} onPatch={patch} busy={busyId === l.id} />
                ))}
              </div>
            </div>
          ))}

          {hidden.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-warm-900 dark:text-disc-text">{t('labelsPage.hiddenSection')}</h2>
              <p className="text-base text-warm-500 dark:text-disc-muted">{t('labelsPage.hiddenNote')}</p>
              <div className="flex flex-col gap-2 opacity-60">
                {hidden.map((l) => (
                  <LabelRow key={l.id} label={l} groupNames={groupNames} t={t} onPatch={patch} busy={busyId === l.id} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
