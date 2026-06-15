export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Target, Phone, BarChart3, Users } from 'lucide-react'
import pool from '@/db/index.js'
import { getMembersCount, getPendingCallCount } from '@/db/calling/members.js'
import { getContactPendingCount } from '@/db/calling/contacts.js'
import { getCampaigns } from '@/db/calling/campaigns.js'

async function getTotalCallStats() {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('answered','no_answer','met')) AS total,
       COUNT(*) FILTER (WHERE status IN ('answered','met')) AS answered
     FROM calling_logs`
  )
  const total = Number(rows[0]?.total) || 0
  const answered = Number(rows[0]?.answered) || 0
  return { total, answered, rate: total > 0 ? Math.round((answered / total) * 100) : 0 }
}

async function getMyTotalCallCount(discordId) {
  if (!discordId) return 0
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_logs
     WHERE called_by = $1 AND status IN ('answered','no_answer','met')`,
    [discordId]
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

  const discordId = session.user.discordId

  const [
    memberCount,
    campaigns,
    callStats,
    myTotal,
    pendingMember,
    pendingContact,
  ] = await Promise.all([
    getMembersCount(),
    getCampaigns(),
    getTotalCallStats(),
    getMyTotalCallCount(discordId),
    discordId ? getPendingCallCount(discordId) : Promise.resolve(0),
    discordId ? getContactPendingCount(discordId) : Promise.resolve(0),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const activeCampaigns = campaigns.filter(c => !c.event_date || c.event_date >= today)
  const myPending = (pendingMember || 0) + (pendingContact || 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-1">Calling</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">ภาพรวมระบบโทรหาสมาชิก</p>
      </div>

      {/* Personal stats — "ของฉัน" */}
      <div>
        <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-wider mb-3">ของฉัน</h2>
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="งานคงค้าง"
            value={fmt(myPending)}
            sub={pendingMember + pendingContact > 0 ? `${fmt(pendingMember)} สมาชิก · ${fmt(pendingContact)} contact` : null}
            accent="orange"
            href="/calling/assignee?status=pending"
          />
          <StatCard
            label="โทรทั้งหมด"
            value={fmt(myTotal)}
            sub="ตลอดกาล · นับเฉพาะที่โทรเอง"
            accent="teal"
          />
        </div>
      </div>

      {/* System stats — "ภาพรวม" */}
      <div>
        <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-wider mb-3">ภาพรวมระบบ</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="โทรทั้งหมด" value={fmt(callStats.total)} sub="ตลอดกาล" accent="teal" />
          <StatCard label="รับสาย" value={fmt(callStats.answered)} sub={`จาก ${fmt(callStats.total)} ครั้ง`} accent="blue" />
          <StatCard label="อัตรารับสาย" value={`${callStats.rate}%`} sub="ตลอดกาล" accent="purple" />
          <StatCard label="Campaign active" value={fmt(activeCampaigns.length)} sub={`รวม ${fmt(campaigns.length)} campaigns`} accent="orange" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-wider mb-3">เข้าหน้า</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <NavCard href="/calling/campaigns" title="Campaigns" desc={`จัดการ ${fmt(activeCampaigns.length)} campaign ที่ active · มอบหมายงาน`} Icon={Target} />
          <NavCard href="/calling/assignee" title="Assignee" desc={myPending > 0 ? `งานของคุณ ${fmt(myPending)} รายการ` : 'ดูรายการที่ได้รับมอบหมาย'} Icon={Phone} />
          <NavCard href="/calling/stats" title="Statistics" desc={`สถิติเชิงลึก · รับสาย ${fmt(callStats.answered)} จาก ${fmt(callStats.total)} ครั้ง`} Icon={BarChart3} />
          <NavCard href="/calling/contacts" title="Contacts" desc={`จัดการผู้ติดต่อนอกฐานสมาชิก · สมาชิก ${fmt(memberCount)} ในระบบ`} Icon={Users} />
        </div>
      </div>
    </div>
  )
}
