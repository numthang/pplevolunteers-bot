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

      <div>
        <label className="block text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text">{t('edit.categoryLabel')}</label>
        {canEdit ? (
          <select value={values.category} onChange={e => set('category', e.target.value)} className={selectCls}>
            <option value="">{t('edit.categoryNone')}</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : (
          <p className="text-base text-gray-900 dark:text-disc-text">{initial.category || '—'}</p>
        )}
      </div>

      {/* จังหวัดอยู่แถวเดียวกับข้อเท็จจริงอื่น — แก้ไม่ได้อยู่แล้ว ไม่ต้องมี label ก้อนใหญ่ + คำอธิบาย
          (user 2026-08-31: ค่าตกบรรทัดใต้ label แล้วอ่านเป็นคนละเรื่องกับข้างล่าง) */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base pt-1">
        <dt className="text-gray-400 dark:text-disc-muted">{t('edit.provinceLabel')}</dt>
        <dd className="text-gray-900 dark:text-disc-text">{province}</dd>
        <dt className="text-gray-400 dark:text-disc-muted">{t('manage.channelLabel')}</dt>
        <dd className="text-gray-900 dark:text-disc-text">{sourceLabel}</dd>
        <dt className="text-gray-400 dark:text-disc-muted">{t('manage.receivedAtLabel')}</dt>
        <dd className="text-gray-900 dark:text-disc-text">{receivedAt}</dd>
      </dl>

      {/* ผู้รับผิดชอบ — ย้ายมาอยู่ในการ์ดนี้ 2026-08-31 (เดิมเป็นการ์ดเดี่ยว)
          ปุ่มรับเรื่อง/ถอนตัวยังอยู่การ์ด "จัดการเคส" ที่นี่โชว์อย่างเดียว */}
      <div className="pt-1">
        <p className="text-sm font-semibold mb-1 text-gray-700 dark:text-disc-text">{t('manage.assigneesHeading')}</p>
        {assignees.length === 0 ? (
          <p className="text-base text-gray-400 dark:text-disc-muted">{t('manage.noAssignees')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {assignees.map(a => (
              <span key={a.discord_id} className="px-3 py-1 rounded-full text-sm bg-gray-100 dark:bg-disc-hover text-gray-700 dark:text-disc-text">{a.name}</span>
            ))}
          </div>
        )}
      </div>

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
