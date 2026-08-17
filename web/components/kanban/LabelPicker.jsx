'use client'

/**
 * LabelPicker — เลือก/ติด/ถอดป้ายในการ์ด 1 ใบ
 *
 * ดีไซน์:
 *   - ปิดอยู่ = เห็นแค่ชิปที่ติดอยู่ + ปุ่ม "แก้ป้าย" (การ์ดส่วนใหญ่แค่ดู ไม่ได้แก้)
 *   - เปิดแล้ว = คลังป้ายทั้ง org แยกเป็นกอง กดชิปสลับติด/ถอด (ไม่ใช่ checkbox แถวยาว — 29 ป้ายจะยาวเกินจอ)
 *   - ยิง PUT ทั้งชุดทุกครั้งที่กด แล้วอัปเดตจากคำตอบของ server (optimistic ไว้ก่อนเพื่อให้กดรัวได้)
 *
 * ⚠️ ยิงรัวๆ = คำตอบสลับลำดับได้ → กันด้วย seq: คำตอบที่ไม่ใช่ของคำขอล่าสุด ทิ้ง
 *
 * ⭐ สร้างป้ายใหม่ได้จากในกล่อง (2026-08-17) — ช่องพิมพ์อยู่ **ในกองของกลุ่มนั้น** ไม่ต้องเลือกกลุ่มจาก dropdown
 *    ฝั่ง API บังคับว่าคนทั่วไปสร้างได้เฉพาะในกลุ่มที่ org มีอยู่แล้ว (ตั้งกลุ่มใหม่เป็นสิทธิ์ admin)
 *    ชื่อซ้ำของเดิม = ได้ป้ายเดิมกลับมา ไม่ใช่ error (ensureLabel) → ติดให้การ์ดเลย
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Tag, Check, Loader2, Plus } from 'lucide-react'
import { chipProps } from '@/lib/kanbanLabelColors.js'
import LabelChips from './LabelChips.jsx'

export default function LabelPicker({ cardId, labels = [], readOnly, onCardChanged, onError }) {
  const t = useTranslations('kanban')

  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  // ชุด id ที่ติดอยู่ตอนนี้ — เก็บเป็นสตริงเสมอ (id เป็น BIGINT → pg คืนมาเป็นสตริง)
  const [selected, setSelected] = useState(() => new Set(labels.map((l) => String(l.id))))
  const seq = useRef(0)

  // กองที่กำลังเปิดช่องพิมพ์ป้ายใหม่อยู่ (คีย์เดียวกับที่ใช้วาดกอง) + ข้อความที่พิมพ์ค้าง
  const [creatingIn, setCreatingIn] = useState(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [canManage, setCanManage] = useState(false)   // มาจาก API — ไม่ต้องยิง /api/me/access เอง

  // การ์ดถูกโหลดใหม่ (กดโหลดฉบับล่าสุด/แก้จากที่อื่น) → sync ชุดที่ติดตาม
  useEffect(() => {
    setSelected(new Set(labels.map((l) => String(l.id))))
  }, [labels])

  async function openPicker() {
    setOpen(true)
    if (groups.length) return
    setLoading(true)
    try {
      const res = await fetch('/api/kanban/labels')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { onError?.(json.error || t('loadFailed')); return }
      setGroups(json.groups || [])
      setCanManage(Boolean(json.canManage))
    } catch {
      onError?.(t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function toggle(labelId) {
    const id = String(labelId)
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)                       // optimistic — กดรัวได้ไม่สะดุด

    const mine = ++seq.current
    setSaving(true)
    try {
      const res = await fetch(`/api/kanban/cards/${cardId}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labelIds: [...next] }),
      })
      const json = await res.json().catch(() => ({}))
      if (mine !== seq.current) return       // มีคำขอใหม่กว่าแล้ว คำตอบนี้เก่า ทิ้ง
      if (!res.ok) {
        onError?.(json.error || t('saveFailed'))
        setSelected(new Set(labels.map((l) => String(l.id))))   // ย้อนกลับเป็นของจริง
        return
      }
      onCardChanged?.(json.card)
    } catch {
      if (mine === seq.current) {
        onError?.(t('saveFailed'))
        setSelected(new Set(labels.map((l) => String(l.id))))
      }
    } finally {
      if (mine === seq.current) setSaving(false)
    }
  }

  /**
   * สร้างป้ายใหม่ในกลุ่มนี้ แล้วติดให้การ์ดทันที
   * ชื่อซ้ำของเดิม → API คืนป้ายเดิม (ensureLabel) → ถ้ายังไม่ได้ติดก็ติดให้ ไม่ขึ้น error
   */
  async function createLabel(groupName) {
    const name = newName.trim()
    if (!name || creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/kanban/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, groupName: groupName || undefined }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.label) { onError?.(json.error || t('modal.createLabelFailed')); return }

      // เติมเข้าคลังที่โหลดมาแล้ว — ไม่ต้องยิง GET ใหม่ทั้งก้อน
      const label = json.label
      setGroups((prev) => {
        const key = label.group_name || ''
        if (prev.some((g) => (g.group || '') === key && g.labels.some((l) => String(l.id) === String(label.id)))) return prev
        const next = prev.map((g) => ((g.group || '') === key ? { ...g, labels: [...g.labels, label] } : g))
        // กลุ่มนี้ยังไม่มีในคลังที่โหลดมา (ป้ายไม่มีกลุ่มอันแรกของ org)
        return next.some((g) => (g.group || '') === key) ? next : [...next, { group: label.group_name || null, labels: [label] }]
      })

      setNewName('')
      setCreatingIn(null)
      if (!selected.has(String(label.id))) await toggle(label.id)
    } catch {
      onError?.(t('modal.createLabelFailed'))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-warm-700 dark:text-disc-muted mb-1">
        {t('modal.labelsLabel')}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {labels.length === 0 && !open && (
          <span className="text-base text-warm-400 dark:text-disc-muted">{t('modal.noLabels')}</span>
        )}
        <LabelChips labels={labels} />
        {!readOnly && !open && (
          <button
            onClick={openPicker}
            className="flex items-center gap-1 px-4 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover transition"
          >
            <Tag size={16} /> {t('modal.editLabels')}
          </button>
        )}
        {saving && <Loader2 size={16} className="animate-spin text-warm-400 dark:text-disc-muted" />}
      </div>

      {open && (
        <div className="mt-2 rounded-lg border border-warm-200 dark:border-disc-border p-3 flex flex-col gap-3">
          {loading && <p className="text-base text-warm-400 dark:text-disc-muted">{t('loading')}</p>}
          {!loading && groups.length === 0 && (
            <p className="text-base text-warm-400 dark:text-disc-muted">{t('modal.noLabelsInOrg')}</p>
          )}

          {groups.map(({ group, labels: list }) => (
            <div key={group || '_'}>
              {/* ชื่อกลุ่มมาจาก DB — ห้ามแปลผ่าน t() */}
              <p className="text-sm text-warm-400 dark:text-disc-muted mb-1">{group || t('modal.ungrouped')}</p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((l) => {
                  const on = selected.has(String(l.id))
                  const tint = chipProps({ ...l, group: l.group_name })
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggle(l.id)}
                      style={on ? tint.style : undefined}
                      className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full font-medium border ${
                        on
                          ? `${tint.className} border-transparent ring-1 ring-teal`
                          : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {on && <Check size={16} />}
                      {l.name}
                    </button>
                  )
                })}

                {/* สร้างป้ายใหม่ในกลุ่มนี้ — ปุ่มเล็กท้ายแถว กดแล้วกลายเป็นช่องพิมพ์ */}
                {creatingIn === (group || '') ? (
                  <form
                    onSubmit={(e) => { e.preventDefault(); createLabel(group) }}
                    className="flex items-center gap-1"
                  >
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onBlur={() => { if (!newName.trim()) { setCreatingIn(null); setNewName('') } }}
                      onKeyDown={(e) => { if (e.key === 'Escape') { setCreatingIn(null); setNewName('') } }}
                      placeholder={t('modal.newLabelPlaceholder')}
                      maxLength={60}
                      className="h-9 px-3 text-sm rounded-full border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text placeholder-warm-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <button
                      type="submit"
                      disabled={creating || !newName.trim()}
                      className="px-3 py-1 text-sm rounded-full bg-teal hover:opacity-90 text-white font-medium disabled:opacity-50"
                    >
                      {creating ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => { setCreatingIn(group || ''); setNewName('') }}
                    className="flex items-center gap-1 px-3 py-1 text-sm rounded-full font-medium border border-dashed border-warm-200 dark:border-disc-border text-warm-500 dark:text-disc-muted hover:bg-warm-50 dark:hover:bg-disc-hover"
                  >
                    <Plus size={16} /> {t('modal.newLabel')}
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2">
            {canManage ? (
              <a
                href="/kanban/labels"
                target="_blank"
                rel="noreferrer"
                className="text-base text-teal hover:underline font-medium"
              >
                {t('modal.manageLabels')}
              </a>
            ) : <span />}
            <button
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-base rounded-lg border border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover font-medium transition"
            >
              {t('modal.doneEditingLabels')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
