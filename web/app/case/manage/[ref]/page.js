import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canAccessCaseProvince } from '@/lib/caseAccess.js'
import { getCaseByRefFull, getAssigneesWithNames, getAttachments, getTimeline } from '@/db/cases.js'
import { getThreadName } from '@/lib/caseDiscord.js'
import { statusLabel, CASE_CLOSE_REASONS } from '@/lib/caseOptions.js'
import CaseManageActions from '@/components/case/CaseManageActions.jsx'
import CaseTimeline from '@/components/case/CaseTimeline.jsx'

export async function generateMetadata({ params }) {
  const { ref } = await params
  return { title: ref }
}

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function CaseManageDetail({ params }) {
  const { ref } = await params
  const t = await getTranslations('case')
  const session = await getSession()
  const { access } = await getEffectiveIdentity(session)
  const orgId = await getOrgId(session)

  const c = await getCaseByRefFull(orgId, ref)
  if (!c) notFound()
  if (!canAccessCaseProvince(c.province, access)) redirect('/case/manage')

  const [assignees, attachments, timeline, threadName] = await Promise.all([
    getAssigneesWithNames(c.id, orgId), getAttachments(c.id), getTimeline(c.id),
    c.discord_thread_id ? getThreadName(c.discord_thread_id) : Promise.resolve(null),
  ])
  const isAssigned = assignees.some(a => a.user_id === session.user.userId)
  // ลิงก์ thread ต้องใช้ guild ที่เคสนี้อยู่จริง (artifact) ไม่ใช่ guild ที่กำลัง browse
  const threadUrl = c.discord_thread_id && c.discord_guild_id ? `https://discord.com/channels/${c.discord_guild_id}/${c.discord_thread_id}` : null

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/case/manage" className="text-orange hover:underline mb-5 block text-base">{t('manage.backToListLink')}</Link>

      {/* header */}
      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6 mb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="font-mono text-sm text-gray-400 dark:text-disc-muted mb-1">{c.ref}</p>
            <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">{c.title || t('manage.noTitle')}</h1>
          </div>
          <span className="shrink-0 px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-100 dark:bg-disc-hover text-gray-700 dark:text-disc-text">
            {statusLabel(c.status)}{c.close_reason ? ` · ${c.close_reason}` : ''}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
          <dt className="text-gray-400 dark:text-disc-muted">{t('manage.provinceLabel')}</dt>
          <dd className="text-gray-900 dark:text-disc-text">{c.province}</dd>
          {c.category && (<>
            <dt className="text-gray-400 dark:text-disc-muted">{t('manage.categoryLabel')}</dt><dd className="text-gray-900 dark:text-disc-text">{c.category}</dd>
          </>)}
          <dt className="text-gray-400 dark:text-disc-muted">{t('manage.channelLabel')}</dt>
          <dd className="text-gray-900 dark:text-disc-text">{c.source === 'discord' ? t('manage.sourceDiscord') : t('manage.sourceForm')}</dd>
          <dt className="text-gray-400 dark:text-disc-muted">{t('manage.receivedAtLabel')}</dt>
          <dd className="text-gray-900 dark:text-disc-text">{fmtDate(c.created_at)}</dd>
        </dl>
      </div>

      {/* รายละเอียด + ผู้ร้องเรียน (PII) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-5">
        <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted mb-2">{t('manage.detailHeading')}</h2>
          <p className="text-base text-gray-900 dark:text-disc-text whitespace-pre-wrap">{c.detail || '—'}</p>
          {c.ai_summary && (
            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-disc-border">
              <h3 className="text-sm font-semibold text-orange mb-1">{t('manage.aiSummaryHeading')}</h3>
              <p className="text-sm text-gray-700 dark:text-disc-muted whitespace-pre-wrap">{c.ai_summary}</p>
            </div>
          )}
        </div>
        <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted mb-2">{t('manage.complainantHeading')}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-base">
            <dt className="text-gray-400 dark:text-disc-muted">{t('manage.nameLabel')}</dt><dd className="text-gray-900 dark:text-disc-text">{c.complainant_name || '—'}</dd>
            <dt className="text-gray-400 dark:text-disc-muted">{t('manage.phoneLabel')}</dt><dd className="text-gray-900 dark:text-disc-text">{c.complainant_phone || '—'}</dd>
            {c.complainant_line_id && (<><dt className="text-gray-400 dark:text-disc-muted">LINE</dt><dd className="text-gray-900 dark:text-disc-text">{c.complainant_line_id}</dd></>)}
          </dl>
          {c.discord_thread_id && (
            <p className="mt-3 text-sm">
              <span className="text-gray-400 dark:text-disc-muted">{t('manage.threadLabel')}</span>
              <a href={threadUrl} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                {threadName || c.discord_thread_id}
              </a>
            </p>
          )}
          {attachments.length > 0 && (
            <div className="mt-3">
              <p className="text-sm text-gray-400 dark:text-disc-muted mb-1">{t('manage.attachmentsCount', { count: attachments.length })}</p>
              <ul className="space-y-1">
                {attachments.map(a => (
                  <li key={a.id}>
                    <a href={`/api/case/${c.ref}/attachments/${a.id}`} target="_blank" rel="noreferrer"
                      className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                      📎 {a.original_name || a.mime}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ผู้รับผิดชอบ */}
      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-5 mb-5">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted mb-2">{t('manage.assigneesHeading')}</h2>
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

      {/* actions (client) */}
      <CaseManageActions
        refId={c.ref}
        status={c.status}
        isAssigned={isAssigned}
        closeReasons={CASE_CLOSE_REASONS}
      />

      <CaseTimeline
        refId={c.ref}
        initialEntries={timeline}
        hasThread={!!c.discord_thread_id}
      />
    </div>
  )
}
