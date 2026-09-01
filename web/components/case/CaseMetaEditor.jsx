'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import useCaseAutosave from './useCaseAutosave.js'
import CaseSaveBadge from './CaseSaveBadge.jsx'

const selectCls = 'w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-orange'

/**
 * การ์ด "ข้อมูลเคส" คอลัมน์ขวา — **ประเภท** แก้ได้ด้วย autosave
 *
 * **จังหวัด** เป็น dropdown เลือกแล้วย้ายเลย (user เคาะ 2026-09-01 — เดิมเป็นปุ่ม+ยืนยัน 3 จังหวะ
 * "ทำแบบง่ายๆ เลือก dropdown เลยไม่ได้เหรอ") · ยิง PATCH เองไม่ผ่าน useCaseAutosave เพราะ
 * ฝั่ง API เป็น action แยกที่เช็ค scope ปลายทาง ไม่ได้อยู่ใน EDITABLE_CASE_FIELDS
 * ⚠️ ref ไม่เปลี่ยนตาม (แจ้งผู้ร้องไปแล้ว) — บอกไว้เป็นบรรทัดกำกับใต้ช่อง
 * ที่เหลือ (ช่องทาง/วันที่รับเรื่อง/เธรด) เป็นข้อเท็จจริงของระบบ ไม่ใช่ของที่คนแก้
 */
export default function CaseMetaEditor({
  refId, canEdit, initial, categories, provinces = [],
  province, sourceLabel, receivedAt, threadUrl, threadName, assignees = [],
}) {
  const t = useTranslations('case')
  const router = useRouter()
  const { values, set, saveState, error } = useCaseAutosave({
    refId, canEdit,
    initial: { category: initial.category || '' },
  })

  const [moveState, setMoveState] = useState('idle')   // idle | saving
  const [moveError, setMoveError] = useState('')

  async function move(next) {
    if (!next || next === province) return
    setMoveState('saving')
    setMoveError('')
    try {
      const res = await fetch(`/api/case/${refId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ province: next }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || d.error) {
        setMoveState('idle')
        setMoveError(d.error || t('edit.provinceMoveFailed'))
        return
      }
      setMoveState('idle')
      router.refresh()
    } catch {
      setMoveState('idle')
      setMoveError(t('edit.provinceMoveFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted">{t('manage.caseInfoHeading')}</h2>
        <CaseSaveBadge saveState={saveState} error={error} />
      </div>

      {/* ทุกอย่างในการ์ดนี้เป็นแถว "หัวข้อซ้าย · ค่าขวา" ชุดเดียวกัน — รวมประเภทที่แก้ได้ด้วย
          (user 2026-08-31: ค่าตกบรรทัดใต้ label แล้วอ่านเป็นคนละเรื่องกับข้างล่าง — ทักซ้ำ 3 จุด)
          items-center ให้หัวข้อเสมอกึ่งกลาง <select> ที่สูงกว่าบรรทัดข้อความ */}
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-base pt-1">
        <dt className="text-gray-400 dark:text-disc-muted">{t('edit.categoryLabel')}</dt>
        <dd>
          {canEdit ? (
            <select value={values.category} onChange={e => set('category', e.target.value)} className={selectCls}>
              <option value="">{t('edit.categoryNone')}</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <span className="text-gray-900 dark:text-disc-text">{initial.category || '—'}</span>
          )}
        </dd>

        <dt className="text-gray-400 dark:text-disc-muted">{t('edit.provinceLabel')}</dt>
        <dd className="text-gray-900 dark:text-disc-text">
          {canEdit ? (
            <select
              value={province}
              onChange={e => move(e.target.value)}
              disabled={moveState === 'saving'}
              className={`${selectCls} disabled:opacity-50`}
            >
              {/* จังหวัดปัจจุบันอาจไม่ใช่จังหวัดจริง ('ไม่ระบุ' จากเคสที่บอทสร้างยุคก่อน)
                  หรืออยู่นอก scope คนนี้ — ต้องมีเป็นตัวเลือกไว้ ไม่งั้น select โชว์ค่าว่าง */}
              {!provinces.includes(province) && <option value={province}>{province}</option>}
              {provinces.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : province}
        </dd>
        <dt className="text-gray-400 dark:text-disc-muted">{t('manage.channelLabel')}</dt>
        <dd className="text-gray-900 dark:text-disc-text">{sourceLabel}</dd>
        <dt className="text-gray-400 dark:text-disc-muted">{t('manage.receivedAtLabel')}</dt>
        <dd className="text-gray-900 dark:text-disc-text">{receivedAt}</dd>

        {/* ผู้รับผิดชอบ — ย้ายมาอยู่ในการ์ดนี้ 2026-08-31 (เดิมเป็นการ์ดเดี่ยว)
            ปุ่มรับเรื่อง/ถอนตัวยังอยู่การ์ด "จัดการเคส" ที่นี่โชว์อย่างเดียว
            เป็นแถวใน dl เดียวกับข้อเท็จจริงอื่น ไม่ใช่ label ก้อนใหญ่แล้วค่าตกบรรทัด
            (user ทักซ้ำจุดเดิมกับจังหวัด — ชื่อต้องอยู่บรรทัดเดียวกับหัวข้อ) */}
        <dt className="text-gray-400 dark:text-disc-muted">{t('manage.assigneesHeading')}</dt>
        <dd className={assignees.length === 0 ? 'text-gray-400 dark:text-disc-muted' : 'text-gray-900 dark:text-disc-text'}>
          {assignees.length === 0 ? t('manage.noAssignees') : assignees.map(a => a.name).join(', ')}
        </dd>
      </dl>

      {canEdit && (moveState === 'saving' || moveError) && (
        <p className={`text-sm ${moveError ? 'text-red-500' : 'text-gray-500 dark:text-disc-muted'}`}>
          {moveError || t('edit.provinceMoving')}
        </p>
      )}
      {canEdit && !moveError && moveState !== 'saving' && (
        <p className="text-sm text-gray-500 dark:text-disc-muted">{t('edit.provinceMoveWarning')}</p>
      )}

      {threadUrl && (
        <p className="text-sm break-words">
          <span className="text-gray-400 dark:text-disc-muted">{t('manage.threadLabel')}</span>
          <a href={threadUrl} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
            {threadName}
          </a>
        </p>
      )}
    </div>
  )
}
