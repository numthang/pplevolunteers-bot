'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

/**
 * แถวตัวกรองของ /case — dropdown แถวเดียว 5 ตัว ทรงเดียวกับ /posts (user เคาะ 2026-09-01)
 * เจ้าภาพ · สถานะ · ที่เก็บ (กำลังทำงาน/ในกรุ) · จังหวัด · ประเภท
 *
 * ⭐ ทุกตัว**อิสระต่อกัน ผสมกันได้** และเก็บใน URL query string ทั้งหมด
 *    → ลิงก์บนการ์ดหน้าแรก (`/case?status=active&assigned=none`) ยังใช้ได้เหมือนเดิม
 *    → กด back จากหน้าเคสแล้วได้ตัวกรองเดิมคืน
 * ⛔ ห้ามเอา "จำนวน" ของแต่ละตัวเลือกมาแปะเป็น (n) ในตัวที่ผสมกับตัวอื่นได้ — เลขจะโกหกทันที
 *    ที่ตั้งอีกตัว (เช่น "ยังไม่มีเจ้าภาพ (12)" นับเฉพาะเคสที่ยังไม่ปิด) · เลขจริงอยู่บรรทัด "พบ N เรื่อง"
 *    ที่นับจากผลลัพธ์ที่เห็นตรงหน้าเสมอ · จังหวัด/ประเภทแปะเลขได้ เพราะนับฝั่งเดียวกับที่กำลังดู
 */

// มือถือ: 2 ตัวต่อแถวและ**เต็มความกว้างเสมอ** (mobileAudit อาการ E) · จอกว้าง: กว้างตามเนื้อหาเหมือน /posts
const selectCls =
  'h-9 pl-3 pr-8 text-sm rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg text-warm-900 dark:text-disc-text focus:outline-none focus:ring-2 focus:ring-orange cursor-pointer min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto'

export default function CaseFilters({
  assigned = '', status = '', archived = false, province = '', category = '',
  statuses = [],        // [{ value, label }] — มาจาก server (lib/caseOptions.js อ่านไฟล์ด้วย fs)
  facets = { provinces: [], categories: [], archived: 0 },
  noCategoryValue = '__none__',
  resultCount = 0,
}) {
  const t = useTranslations('case')
  const router = useRouter()
  const searchParams = useSearchParams()

  function set(key, value) {
    const p = new URLSearchParams(searchParams)
    if (value) p.set(key, value)
    else p.delete(key)
    const qs = p.toString()
    router.push(qs ? `/cases?${qs}` : '/cases')
  }

  const dirty = assigned || status || archived || province || category

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={assigned} onChange={e => set('assigned', e.target.value)} className={selectCls} aria-label={t('manage.filterAssigneeLabel')}>
        <option value="">{t('manage.filterAnyAssignee')}</option>
        <option value="none">{t('manage.filterUnassigned')}</option>
        <option value="me">{t('manage.filterMine')}</option>
        <option value="any">{t('manage.filterAssigned')}</option>
      </select>

      {/* 2 ตัวแรกเป็นชุดรวม (ยังไม่ปิด / เสร็จสิ้น) ที่ลิงก์หน้าแรกใช้ · ที่เหลือคือสถานะรายตัว */}
      <select value={status} onChange={e => set('status', e.target.value)} className={selectCls} aria-label={t('manage.filterStatusLabel')}>
        <option value="">{t('manage.filterAllStatus')}</option>
        <option value="active">{t('manage.filterActive')}</option>
        <option value="done">{t('manage.filterDone')}</option>
        {statuses.map(s => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>

      <select value={archived ? '1' : ''} onChange={e => set('archived', e.target.value)} className={selectCls} aria-label={t('manage.filterStoreLabel')}>
        <option value="">{t('manage.filterLive')}</option>
        <option value="1">🗄️ {t('manage.filterArchived')} ({facets.archived})</option>
      </select>

      {facets.provinces.length > 1 && (
        <select value={province} onChange={e => set('province', e.target.value)} className={selectCls} aria-label={t('manage.provinceLabel')}>
          <option value="">{t('manage.filterAllProvinces')}</option>
          {facets.provinces.map(p => (
            <option key={p.province} value={p.province}>{p.province} ({p.n})</option>
          ))}
        </select>
      )}

      {facets.categories.length > 1 && (
        <select value={category} onChange={e => set('category', e.target.value)} className={selectCls} aria-label={t('manage.categoryLabel')}>
          <option value="">{t('manage.filterAllCategories')}</option>
          {facets.categories.map(c => (
            <option key={c.category} value={c.category}>
              {c.category === noCategoryValue ? t('manage.filterNoCategory') : c.category} ({c.n})
            </option>
          ))}
        </select>
      )}

      {/* ตัวกรองที่ค้างอยู่ใน dropdown มองไม่เห็นเท่าชิป → ต้องมีทางล้างทีเดียวให้เห็นชัด */}
      {dirty && (
        <button
          onClick={() => router.push('/cases')}
          className="text-sm text-warm-500 dark:text-disc-muted underline underline-offset-4 hover:text-orange"
        >
          {t('manage.clearFilters')}
        </button>
      )}

      {/* เลขเดียวที่การันตีว่าตรงกับของที่เห็นจริง — ตัวกรองผสมกันได้แล้วเลขในวงเล็บบอกไม่ได้ */}
      <span className="w-full sm:w-auto sm:ml-auto text-sm text-warm-500 dark:text-disc-muted">
        {t('manage.resultCount', { count: resultCount })}
      </span>
    </div>
  )
}
