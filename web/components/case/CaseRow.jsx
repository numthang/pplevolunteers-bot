'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Image as ImageIcon, User, Check } from 'lucide-react'
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
    <div className="group relative flex flex-col gap-2 bg-card-bg border border-warm-200 dark:border-disc-border rounded-lg p-3 [@media(hover:hover)]:hover:border-orange [@media(hover:hover)]:hover:shadow-md transition">
      <div className="flex gap-3">
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
          {/* สถานะ + ถังขยะ อยู่แถวบนขวาลำพัง · หัวข้อลงบรรทัดใหม่เต็มความกว้าง
              (เคาะ 2026-09-13) — ของเดิมหัวข้อแชร์บรรทัดกับป้ายสถานะ เหลือที่ไม่กี่ตัวอักษรบนมือถือ
              แล้วโดน truncate จนอ่านไม่รู้เรื่อง */}
          <div className="flex items-center justify-end gap-2">
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

          {/* ⛔ `truncate`/`line-clamp` ต้องอยู่ที่ <a> ไม่ใช่ที่ <h3> — <a> เป็น inline กล่องมันกว้าง
              เท่าข้อความจริง แม้พ่อจะ overflow-hidden ให้ (ตาไม่เห็น แต่ mobileAudit จับได้ว่าล้นจอ) */}
          <h3 className="min-w-0 text-base font-semibold text-warm-900 dark:text-disc-text [@media(hover:hover)]:group-hover:text-orange transition">
            <Link href={`/cases/${c.ref}`} className="block line-clamp-2 break-words after:absolute after:inset-0">
              {c.title || t('manage.noTitle')}
            </Link>
          </h3>

          {excerpt ? (
            <p className="text-sm text-warm-500 dark:text-disc-muted line-clamp-2 break-words">{excerpt}</p>
          ) : (
            <p className="text-sm text-warm-400 dark:text-disc-muted italic">{t('manage.noDetail')}</p>
          )}

          {/* ⛔ ไม่มีเลขเคสและจำนวนไฟล์แนบในการ์ดแล้ว (เคาะ 2026-09-13) — บนมือถือมันเบียดหัวข้อ
              ทั้งที่ไม่มีใครกวาดตาหาเลขเคสจากรายการ · ดูได้ในหน้าเคส */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded-full bg-warm-100 dark:bg-disc-hover text-warm-600 dark:text-disc-muted">
              {c.province}
            </span>
            {c.category && (
              <span className="px-2 py-0.5 rounded-full bg-warm-100 dark:bg-disc-hover text-warm-600 dark:text-disc-muted max-w-[12rem] truncate">
                {c.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ผู้รับผิดชอบ + ความคืบหน้า — เต็มความกว้างใต้รูป ชิดซ้ายสุดของการ์ด (เคาะ 2026-09-13)
          อยู่ในคอลัมน์ข้างรูปเหมือนเดิม = เหลือที่ไม่พอ แถบสั้นจนอ่านไม่ออกบนมือถือ */}
      <div className="flex flex-col gap-1.5 text-xs">
        {/* ผู้รับผิดชอบ — ชื่อแรกเต็มๆ ที่เหลือย่อเป็น +n (การ์ดต้องกวาดตาได้ ไม่ใช่รายชื่อยาว) */}
        {names.length > 0 ? (
          <span className="flex items-center gap-1 self-start max-w-full px-2 py-0.5 rounded-full bg-orange/10 text-orange">
            <User size={12} className="shrink-0" />
            <span className="truncate">{names[0]}</span>
            {names.length > 1 && <span className="shrink-0">+{names.length - 1}</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1 self-start text-warm-400 dark:text-disc-muted">
            <User size={12} />{t('manage.noAssignees')}
          </span>
        )}

        {/* ความคืบหน้า — แถบ + ขั้นต่อไป (ตัวเลข % อย่างเดียวไม่บอกว่าต้องไปทำอะไรต่อ) */}
        <div className="flex items-center gap-2">
          {/* แถบกินที่ที่เหลือ แต่มีพื้นขั้นต่ำ — ข้อความขั้นต่อไปยาวๆ ต้องหด ไม่ใช่บีบแถบจนหาย */}
          <div className="flex-1 min-w-[5rem]"><ProgressBar pct={pct} tone={tone} /></div>
          <span className={`shrink-0 font-semibold tabular-nums ${closed ? 'text-green-600 dark:text-green-500' : 'text-warm-600 dark:text-disc-text'}`}>
            {pct}%
          </span>
          <span className="min-w-0 truncate text-warm-400 dark:text-disc-muted">
            {closed
              ? <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-500"><Check size={12} />{stepText}</span>
              : stepText}
          </span>
        </div>
      </div>
    </div>
  )
}
