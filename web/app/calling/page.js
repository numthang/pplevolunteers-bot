export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Target, Phone, BarChart3, Users } from 'lucide-react'
import pool from '@/db/index.js'
import { getOrgId } from '@/lib/orgContext.js'
import { guildsOfOrg } from '@/db/guilds.js'
import { getMembersCount, getPendingCallCount } from '@/db/calling/members.js'
import { getContactPendingCount } from '@/db/calling/contacts.js'
import { getCampaigns } from '@/db/calling/campaigns.js'

async function getTotalCallStats(orgId) {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('answered','no_answer','met')) AS total,
       COUNT(*) FILTER (WHERE status IN ('answered','met')) AS answered
     FROM calling_logs
     WHERE org_id = $1`,
    [orgId]
  )
  const total = Number(rows[0]?.total) || 0
  const answered = Number(rows[0]?.answered) || 0
  return { total, answered, rate: total > 0 ? Math.round((answered / total) * 100) : 0 }
}

async function getMyTotalCallCount(userId, orgId) {
  if (!userId) return 0
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_logs
     WHERE called_by = $1 AND org_id = $2 AND status IN ('answered','no_answer','met')`,
    [userId, orgId]
  )
  return Number(rows[0]?.count) || 0
}

const fmt = (n) => Number(n || 0).toLocaleString('th-TH')

function StatCard({ label, value, sub, accent = 'teal', href }) {
  const accents = {
    teal:   'text-teal',
    orange: 'text-orange-600 dark:text-orange-400',
    blue:   'text-blue-600 dark:text-blue-400',
    purple: 'text-purple-600 dark:text-purple-400',
  }
  const inner = (
    <>
      <p className="text-sm text-warm-500 dark:text-disc-muted mb-1">{label}</p>
      <p className={`text-3xl font-bold ${accents[accent]}`}>{value}</p>
      {sub && <p className="text-sm text-warm-400 dark:text-disc-muted mt-1">{sub}</p>}
    </>
  )
  if (href) return (
    <Link href={href} className="block bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4 hover:border-teal hover:shadow-md transition">
      {inner}
    </Link>
  )
  return (
    <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-4">
      {inner}
    </div>
  )
}

function NavCard({ href, title, desc, Icon }) {
  return (
    <Link
      href={href}
      className="block bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-5 hover:border-teal hover:shadow-md transition"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
          {Icon && <Icon className="w-5 h-5 text-teal" />}
        </div>
        <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text">{title}</h2>
      </div>
      <p className="text-base text-warm-500 dark:text-disc-muted">{desc}</p>
    </Link>
  )
}

export default async function CallingDashboard() {
  const session = await getSession()
  if (!session) redirect('/')

  // calling เป็น org-native แล้ว (ทุก query scope ด้วย org_id) → guildless org เข้าได้
  //   (roster/campaign มาจาก guild ขององค์กร — org ที่ไม่มี guild เห็น 0 แต่ใช้ contacts ได้)
  //   feature gate อยู่ที่ layout requireFeature('calling') แล้ว
  const orgId = await getOrgId(session)
  if (!orgId) redirect('/')

  const t = await getTranslations('calling')
  const userId = session.user.userId

  const [
    memberCount,
    campaigns,
    callStats,
    myTotal,
    pendingMember,
    pendingContact,
  ] = await Promise.all([
    getMembersCount(orgId),
    getCampaigns(orgId),
    getTotalCallStats(orgId),
    getMyTotalCallCount(userId, orgId),
    userId ? getPendingCallCount(userId) : Promise.resolve(0),
    userId ? getContactPendingCount(userId) : Promise.resolve(0),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const activeCampaigns = campaigns.filter(c => !c.event_date || c.event_date >= today)
  const myPending = (pendingMember || 0) + (pendingContact || 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">{t('dashboard.pageTitle')}</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">{t('dashboard.subtitle')}</p>
      </div>

      {/* Personal stats — "ของฉัน" */}
      <div>
        <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-wider mb-3">{t('dashboard.myStatsHeading')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t('dashboard.pendingWorkLabel')}
            value={fmt(myPending)}
            sub={pendingMember + pendingContact > 0 ? t('dashboard.pendingWorkSub', { member: fmt(pendingMember), contact: fmt(pendingContact) }) : null}
            accent="orange"
            href="/calling/assignee?status=pending"
          />
          <StatCard
            label={t('dashboard.totalCallsLabel')}
            value={fmt(myTotal)}
            sub={t('dashboard.totalCallsPersonalSub')}
            accent="teal"
          />
        </div>
      </div>

      {/* System stats — "ภาพรวม" */}
      <div>
        <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-wider mb-3">{t('dashboard.systemStatsHeading')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label={t('dashboard.totalCallsLabel')} value={fmt(callStats.total)} sub={t('dashboard.allTimeSub')} accent="teal" />
          <StatCard label={t('assignee.answeredLabel')} value={fmt(callStats.answered)} sub={t('dashboard.answeredSub', { total: fmt(callStats.total) })} accent="blue" />
          <StatCard label={t('dashboard.answerRateLabel')} value={`${callStats.rate}%`} sub={t('dashboard.allTimeSub')} accent="purple" />
          <StatCard label={t('dashboard.activeCampaignsLabel')} value={fmt(activeCampaigns.length)} sub={t('dashboard.totalCampaignsSub', { count: fmt(campaigns.length) })} accent="orange" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-wider mb-3">{t('dashboard.navHeading')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NavCard href="/calling/campaigns" title={t('campaigns.pageTitle')} desc={t('dashboard.campaignsNavDesc', { count: fmt(activeCampaigns.length) })} Icon={Target} />
          <NavCard href="/calling/assignee" title={t('dashboard.assigneeNavTitle')} desc={myPending > 0 ? t('dashboard.assigneeNavDescPending', { count: fmt(myPending) }) : t('dashboard.assigneeNavDescDefault')} Icon={Phone} />
          <NavCard href="/calling/stats" title={t('dashboard.statsNavTitle')} desc={t('dashboard.statsNavDesc', { answered: fmt(callStats.answered), total: fmt(callStats.total) })} Icon={BarChart3} />
          <NavCard href="/calling/contacts" title={t('contacts.pageTitle')} desc={t('dashboard.contactsNavDesc', { count: fmt(memberCount) })} Icon={Users} />
        </div>
      </div>
    </div>
  )
}
