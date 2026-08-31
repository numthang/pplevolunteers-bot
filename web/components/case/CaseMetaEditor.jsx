'use client'

import { useTranslations } from 'next-intl'
import useCaseAutosave from './useCaseAutosave.js'
import CaseSaveBadge from './CaseSaveBadge.jsx'

const selectCls = 'w-full rounded-lg border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-orange'

/**
 * การ์ด "ข้อมูลเคส" คอลัมน์ขวา — แก้ได้ช่องเดียวคือ **ประเภท**
 * จังหวัดล็อกถาวร (รหัสจังหวัดฝังอยู่ใน ref ที่ส่ง SMS ออกไปแล้ว — ดู EDITABLE_CASE_FIELDS ใน db/cases.js)
 * ที่เหลือ (ช่องทาง/วันที่รับเรื่อง/เธรด) เป็นข้อเท็จจริงของระบบ ไม่ใช่ของที่คนแก้
 */
export default function CaseMetaEditor({
  refId, canEdit, initial, categories,
  province, sourceLabel, receivedAt, threadUrl, threadName, assignees = [],
}) {
  const t = useTranslations('case')
  const { values, set, saveState, error } = useCaseAutosave({
    refId, canEdit,
    initial: { category: initial.category || '' },
  })

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
        <dd className="text-gray-900 dark:text-disc-text">{province}</dd>
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
