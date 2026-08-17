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
 * ⛔ ก้อนนี้ยังไม่มีสร้างป้ายใหม่จากในกล่อง (ensureLabel มีรออยู่แล้วใน db/kanban/labels.js) — จดไว้ใน PENDING
 */

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Tag, Check, Loader2 } from 'lucide-react'
import { chipClass } from '@/lib/kanbanLabelColors.js'
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
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggle(l.id)}
                      className={`flex items-center gap-1 px-3 py-1 text-sm rounded-full font-medium border ${
                        on
                          ? `${chipClass({ ...l, group: l.group_name })} border-transparent ring-1 ring-teal`
                          : 'border-warm-200 dark:border-disc-border text-warm-900 dark:text-disc-text hover:bg-warm-50 dark:hover:bg-disc-hover'
                      }`}
                    >
                      {on && <Check size={16} />}
                      {l.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
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
