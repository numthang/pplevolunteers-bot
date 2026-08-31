import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canAccessCaseProvince, canManageCases, isAdmin } from '@/lib/caseAccess.js'
import { getCaseByRefFull, getAssigneesWithNames, getAttachments, getTimeline } from '@/db/cases.js'
import { getThreadName } from '@/lib/caseDiscord.js'
import { smsConfigured } from '@/lib/sendSms.js'
import { statusLabel, CASE_CLOSE_REASONS, CASE_CATEGORIES, ALL_PROVINCES } from '@/lib/caseOptions.js'
import CaseManageActions from '@/components/case/CaseManageActions.jsx'
import CaseTimeline from '@/components/case/CaseTimeline.jsx'
import CaseContentEditor from '@/components/case/CaseContentEditor.jsx'
import CaseMetaEditor from '@/components/case/CaseMetaEditor.jsx'
import CaseComplainantEditor from '@/components/case/CaseComplainantEditor.jsx'
import CaseAttachmentGallery from '@/components/case/CaseAttachmentGallery.jsx'
import CaseDeleteButton from '@/components/case/CaseDeleteButton.jsx'

export async function generateMetadata({ params }) {
  const { ref } = await params
  return { title: ref }
}

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

const cardCls = 'bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5'

/**
 * หน้าจัดการเคส — โครงเดียวกับ /posts/[id]: เนื้อหาซ้าย · การ์ดจัดการ/ข้อมูลขวา
 *
 * ⛔ ไม่มีปุ่ม "แก้ไขข้อมูลเคส" + โมดัลแล้ว (เอาออก 2026-08-31) — แก้ในหน้าเลย + autosave
 *    ตามกฎ CLAUDE.md §กฎการบันทึก (หน้า Update ที่มี autosave ห้ามมีปุ่มบันทึก)
 * ⚠️ หน้านี้ยังต้องเป็น server component: CaseManageActions เรียก router.refresh() ทุก action
 *    ของ read-only (สถานะ/ผู้รับผิดชอบ/timeline) จึงต้องมาจาก props ฝั่ง server ไม่ใช่ state ใน client
 *    ถ้าห่อทั้งหน้าเป็น client component ก้อนเดียว ค่าที่ refresh มาจะไม่เข้าจอ
 */
export default async function CaseManageDetail({ params }) {
  const { ref } = await params
  const t = await getTranslations('case')
  const session = await getSession()
  const { access } = await getEffectiveIdentity(session)
  const orgId = await getOrgId(session)

  const c = await getCaseByRefFull(orgId, ref)
  if (!c) notFound()
  if (!canAccessCaseProvince(c.province, access)) redirect('/case')

  const [assignees, attachments, timeline, threadName] = await Promise.all([
    getAssigneesWithNames(c.id, orgId), getAttachments(c.id), getTimeline(c.id),
    c.discord_thread_id ? getThreadName(c.discord_thread_id) : Promise.resolve(null),
  ])
  const isAssigned = assignees.some(a => a.user_id === session.user.userId)
  // เข้าหน้านี้ได้ = เห็นจังหวัดนี้ · แต่ PATCH ต้องมี manageCases ด้วย (gateCase)
  // → คนที่แก้ไม่ได้ต้องเห็นเป็นข้อความ ไม่ใช่ช่องกรอกที่พิมพ์แล้วเด้ง 403
  const canEdit = canManageCases(access)
  // จังหวัดปลายทางที่ย้ายไปได้ = เฉพาะที่คนนี้ดูแล (API เช็คซ้ำอีกชั้น) — ย้ายออกนอก scope
  // ตัวเองแล้วเคสหลุดมือทันที จึงไม่ควรมีให้เลือกตั้งแต่ในจอ
  const movableProvinces = canEdit ? ALL_PROVINCES.filter(p => canAccessCaseProvince(p, access)) : []
  // ลิงก์ thread ต้องใช้ guild ที่เคสนี้อยู่จริง (artifact) ไม่ใช่ guild ที่กำลัง browse
  const threadUrl = c.discord_thread_id && c.discord_guild_id ? `https://discord.com/channels/${c.discord_guild_id}/${c.discord_thread_id}` : null

  return (
    <div>
      <Link href="/case" className="text-orange hover:underline mb-5 block text-base">{t('manage.backToListLink')}</Link>

      {/* เคสในกรุเปิดได้ทาง URL ตรงๆ เท่านั้น (ไม่อยู่ในรายการแล้ว) → ต้องบอกให้รู้ว่าทำไมหาไม่เจอ */}
      {c.archived_at && (
        <div className="mb-5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-5 py-3 text-base text-amber-800 dark:text-amber-200">
          {t('archive.banner')}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {/* ── ซ้าย: เนื้อหาเคส ── */}
        <div className="flex flex-col gap-6 min-w-0">
          <div className={cardCls}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="font-mono text-sm text-gray-400 dark:text-disc-muted">{c.ref}</p>
              <span className="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-100 dark:bg-disc-hover text-gray-700 dark:text-disc-text">
                {statusLabel(c.status)}{c.close_reason ? ` · ${c.close_reason}` : ''}
              </span>
            </div>
            <CaseContentEditor
              refId={c.ref}
              canEdit={canEdit}
              aiSummary={c.ai_summary}
              initial={{ title: c.title, detail: c.detail }}
            />
            {/* ปุ่มลบอยู่มุมขวาล่างของการ์ดเนื้อหา — ตำแหน่งเดียวกับ "เก็บเข้ากรุ" ใน /posts/[id] */}
            {canEdit && (
              <div className="flex pt-3 mt-3 border-t border-gray-100 dark:border-disc-border">
                <CaseDeleteButton
                  refId={c.ref}
                  title={c.title || c.ref}
                  archived={Boolean(c.archived_at)}
                  canPurge={isAdmin(access)}
                  counts={{ timeline: timeline.length, attachments: attachments.length }}
                />
              </div>
            )}
          </div>

          <CaseTimeline
            refId={c.ref}
            initialEntries={timeline}
            hasThread={!!c.discord_thread_id}
          />
        </div>

        {/* ── ขวา: ไฟล์แนบ (บนสุด เหมือนการ์ด "สื่อ" ของ posts) · จัดการเคส · ข้อมูลเคส · ผู้ร้องเรียน ── */}
        <div className="flex flex-col gap-6 min-w-0">
          {attachments.length > 0 && (
            <div className={cardCls}>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted mb-2">
                {t('manage.attachmentsCount', { count: attachments.length })}
              </h2>
              <CaseAttachmentGallery refId={c.ref} attachments={attachments} />
            </div>
          )}

          <CaseManageActions
            refId={c.ref}
            status={c.status}
            isAssigned={isAssigned}
            closeReasons={CASE_CLOSE_REASONS}
          />

          <div className={cardCls}>
            <CaseMetaEditor
              refId={c.ref}
              canEdit={canEdit}
              initial={{ category: c.category }}
              categories={CASE_CATEGORIES}
              province={c.province}
              provinces={movableProvinces}
              sourceLabel={c.source === 'discord' ? t('manage.sourceDiscord') : t('manage.sourceForm')}
              receivedAt={fmtDate(c.created_at)}
              threadUrl={threadUrl}
              threadName={threadName || c.discord_thread_id}
              assignees={assignees}
            />
          </div>

          <div className={cardCls}>
            <CaseComplainantEditor
              refId={c.ref}
              canEdit={canEdit}
              smsEnabled={smsConfigured()}
              initial={{
                complainant_name: c.complainant_name,
                complainant_phone: c.complainant_phone,
                complainant_line_id: c.complainant_line_id,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
