'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, Paperclip, User, Check } from 'lucide-react'
import CaseDeleteButton from './CaseDeleteButton.jsx'

/**
 * การ์ดเคสในรายการ /case — ทรงเดียวกับการ์ดโพสต์ที่ /posts (user สั่งให้เหมือนกัน 2026-09-01)
 * รูป · ผู้รับผิดชอบ · ปุ่มลบ (hover) · แถบความคืบหน้า
 *
 * ⛔ `statusText` ส่งมาจาก server เท่านั้น — `lib/caseOptions.js` อ่านไฟล์ด้วย fs ใช้ฝั่ง client ไม่ได้
 */

const STATUS_DOT = {
  open: 'bg-blue-500', in_progress: 'bg-amber-500',
  resolved: 'bg-green-500', closed: 'bg-gray-400', rejected: 'bg-red-500',
}

const CLOSED_STATUSES = ['resolved', 'closed']

// ─── ความคืบหน้าการทำงาน (เคาะ 2026-09-01) ──────────────────────────────────
// **ไม่ใช่ความสมบูรณ์ของข้อมูลแบบ /posts** — เคสวัดกันที่ "เดินไปถึงไหนแล้ว" 4 ขั้น ขั้นละ 25%
//   รับเรื่อง (มีเคส = 25 เสมอ) → มีผู้รับผิดชอบ → ลงมือ (in_progress หรือมีไทม์ไลน์) → ปิดจบ
// ⚠️ ขั้นคิดแบบ "สูงสุดที่ไปถึง" แต่ป้ายข้างแถบบอก **ขั้นที่ยังขาดตัวแรก** — เคสที่ปิดไปแล้ว
//    โดยไม่เคยมีเจ้าภาพจึงได้ 100% ตามจริง ไม่ใช่ค้างที่ 25%
function progress(c) {
  const assigned = (c.assignee_names || []).length > 0
  const started = c.status === 'in_progress' || Number(c.timeline_count) > 0
  const closed = CLOSED_STATUSES.includes(c.status)
  const rejected = c.status === 'rejected'

  let stage = 1
  if (assigned) stage = 2
  if (started) stage = Math.max(stage, 3)
  if (closed || rejected) stage = 4

  return { pct: stage * 25, closed, rejected, assigned, started }
}

// สีไล่ตามระยะ ให้กวาดตาลงคอลัมน์เดียวแล้วเห็นว่าใบไหนยังไม่ขยับ
function ProgressBar({ pct, tone }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-warm-100 dark:bg-disc-hover overflow-hidden">
      <div className={`h-full rounded-full transition-all ${tone}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('th-TH', { dateStyle: 'medium' })
}

export default function CaseRow({ c, statusText, canPurge = false }) {
  const t = useTranslations('case')
  const [thumbFailed, setThumbFailed] = useState(false)

  const archived = !!c.archived_at
  const names = c.assignee_names || []
  const excerpt = (c.detail || '').replace(/\s+/g, ' ').trim()
  const { pct, closed, rejected, assigned, started } = progress(c)

  const tone = closed ? 'bg-green-500'
    : rejected ? 'bg-red-400'
      : pct >= 75 ? 'bg-orange'
        : 'bg-warm-300 dark:bg-disc-border'

  const stepText = closed ? t('progress.doneLabel')
    : rejected ? t('progress.rejectedLabel')
      : t('progress.nextStep', {
        step: !assigned ? t('progress.stageAssign')
          : !started ? t('progress.stageWork')
            : t('progress.stageClose'),
      })

  const thumbSrc = c.thumb_att_id ? `/api/case/${c.ref}/attachments/${c.thumb_att_id}` : null

  return (
    // stretched link: ลิงก์จริงอยู่ที่หัวเรื่องแล้วยืดคลุมทั้งใบด้วย after:inset-0
    // → คลิกได้ทั้งการ์ด แต่ยังเป็น <a> จริง (กลางเมาส์/คีย์บอร์ด/copy link ใช้ได้) และไม่มีปุ่มซ้อนใน <a>
    <div className="group relative flex gap-3 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-3 [@media(hover:hover)]:hover:border-orange [@media(hover:hover)]:hover:shadow-md transition">
      {/* ช่องรูปกว้างคงที่เสมอ แม้ไม่มีรูป — ไม่งั้นข้อความแต่ละแถวเริ่มไม่ตรงกัน กวาดตาไม่ติด */}
      <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-lg overflow-hidden bg-warm-100 dark:bg-disc-hover flex items-center justify-center">
        {thumbSrc && !thumbFailed ? (
          <img
            src={thumbSrc}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon size={20} className="text-warm-300 dark:text-disc-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          {/* ⛔ `truncate` ต้องอยู่ที่ <a> ไม่ใช่ที่ <h3> — <a> เป็น inline กล่องมันกว้างเท่าข้อความจริง
              แม้พ่อจะ overflow-hidden ให้ (ตาไม่เห็น แต่ mobileAudit จับได้ว่าล้นจอ 800px) */}
          <h3 className="min-w-0 text-base font-semibold text-warm-900 dark:text-disc-text [@media(hover:hover)]:group-hover:text-orange transition">
            <Link href={`/cases/${c.ref}`} className="block truncate after:absolute after:inset-0">
              {c.title || t('manage.noTitle')}
            </Link>
          </h3>
          <div className="shrink-0 flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-warm-500 dark:text-disc-muted">
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[c.status] || 'bg-gray-300'}`} />
              {statusText}
            </span>
            <span className="text-xs text-warm-400 dark:text-disc-muted hidden sm:inline">
              {fmtDate(c.created_at)}
            </span>
            <CaseDeleteButton
              refId={c.ref}
              title={c.title || c.ref}
              archived={archived}
              canPurge={canPurge}
              counts={{ timeline: c.timeline_count || 0, attachments: c.attachment_count || 0 }}
              variant="icon"
              redirectOnPurge={false}
            />
          </div>
        </div>

        {excerpt ? (
          <p className="text-sm text-warm-500 dark:text-disc-muted line-clamp-1 break-words">{excerpt}</p>
        ) : (
          <p className="text-sm text-warm-400 dark:text-disc-muted italic">{t('manage.noDetail')}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-warm-500 dark:text-disc-muted">{c.ref}</span>
          <span className="px-2 py-0.5 rounded-full bg-warm-100 dark:bg-disc-hover text-warm-600 dark:text-disc-muted">
            {c.province}
          </span>
          {c.category && (
            <span className="px-2 py-0.5 rounded-full bg-warm-100 dark:bg-disc-hover text-warm-600 dark:text-disc-muted max-w-[12rem] truncate">
              {c.category}
            </span>
          )}
          {c.attachment_count > 0 && (
            <span
              className="flex items-center gap-1 text-warm-500 dark:text-disc-muted"
              title={t('manage.attachmentsCount', { count: c.attachment_count })}
            >
              <Paperclip size={12} />{c.attachment_count}
            </span>
          )}
          {/* ผู้รับผิดชอบ — ชื่อแรกเต็มๆ ที่เหลือย่อเป็น +n (การ์ดต้องกวาดตาได้ ไม่ใช่รายชื่อยาว) */}
          {names.length > 0 ? (
            <span className="flex items-center gap-1 max-w-[14rem] px-2 py-0.5 rounded-full bg-orange/10 text-orange">
              <User size={12} className="shrink-0" />
              <span className="truncate">{names[0]}</span>
              {names.length > 1 && <span className="shrink-0">+{names.length - 1}</span>}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-warm-400 dark:text-disc-muted">
              <User size={12} />{t('manage.noAssignees')}
            </span>
          )}
        </div>

        {/* ความคืบหน้า — แถบ + ขั้นต่อไป (ตัวเลข % อย่างเดียวไม่บอกว่าต้องไปทำอะไรต่อ) */}
        <div className="flex items-center gap-2 mt-0.5">
          <div className="w-24 sm:w-32 shrink-0"><ProgressBar pct={pct} tone={tone} /></div>
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${closed ? 'text-green-600 dark:text-green-500' : 'text-warm-600 dark:text-disc-text'}`}>
            {pct}%
          </span>
          <span className="min-w-0 text-xs text-warm-400 dark:text-disc-muted truncate">
            {closed
              ? <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-500"><Check size={12} />{stepText}</span>
              : stepText}
          </span>
        </div>
      </div>
    </div>
  )
}
