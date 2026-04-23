import Link from 'next/link'
import Image from 'next/image'
import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import { getMembersCount, getPendingCallCount } from '@/db/calling/members.js'
import { getCampaigns } from '@/db/calling/campaigns.js'
import pool from '@/db/index.js'

const GUILD_ID = process.env.GUILD_ID

async function getTodayCallCount() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_logs WHERE DATE(created_at) = CURDATE()`
  )
  return Number(rows[0]?.count) || 0
}

async function getFinanceSummary() {
  const [rows] = await pool.query(
    `SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense
     FROM finance_transactions
     WHERE guild_id = ? AND MONTH(txn_at) = MONTH(CURDATE()) AND YEAR(txn_at) = YEAR(CURDATE())`,
    [GUILD_ID]
  )
  return rows[0]
}

async function getDcMemberCount() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM dc_members WHERE guild_id = ?`,
    [GUILD_ID]
  )
  return Number(rows[0]?.count) || 0
}

async function getDisplayName(discordId) {
  const [rows] = await pool.query(
    `SELECT display_name FROM dc_members WHERE guild_id = ? AND discord_id = ?`,
    [GUILD_ID, discordId]
  )
  return rows[0]?.display_name || null
}

export const metadata = { title: 'Dashboard' }

function StatCard({ label, value, sub }) {
  return (
    <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-gray-800 rounded-lg p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="bg-card-bg border border-brand-blue-light dark:border-gray-800 rounded-xl p-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-orange mb-4">{title}</p>
      <div className="grid grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const discordId = session.user.discordId

  const [memberCount, dcMemberCount, campaigns, todayCalls, pendingCount, finance, displayName] = await Promise.all([
    getMembersCount(),
    getDcMemberCount(),
    getCampaigns(),
    getTodayCallCount(),
    discordId ? getPendingCallCount(discordId) : Promise.resolve(0),
    getFinanceSummary(),
    discordId ? getDisplayName(discordId) : Promise.resolve(null),
  ])

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
  const fmtBaht = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`

  return (
    <div className="space-y-3">

      {/* Profile */}
      <div className="flex items-center gap-3 p-4 bg-card-bg rounded-xl border border-gray-200 dark:border-gray-700">
        {session.user.image && (
          <Image src={session.user.image} alt="" width={48} height={48} className="rounded-full shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={`https://discord.com/users/${session.user.discordId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-gray-900 dark:text-gray-100 hover:underline truncate block"
          >
            @{session.user.name}
          </a>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">ID: {session.user.discordId}</p>
          {displayName && displayName !== session.user.name && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">Display name: {displayName}</p>
          )}
        </div>
        <Link
          href="/profile"
          className="shrink-0 text-xs text-brand-orange hover:text-brand-orange-light border border-brand-orange/30 hover:border-brand-orange px-3 py-1.5 rounded-lg transition-colors"
        >
          แก้ไขโปรไฟล์
        </Link>
      </div>

      {/* Discord Bot */}
      <Section title="Discord Bot">
        <StatCard label="สมาชิก Discord" value={fmt(dcMemberCount)} sub="ใน server" />
        <StatCard label="QR Login" value="—" sub="coming soon" />
      </Section>

      {/* Calling */}
      <Section title="PPLE Calling">
        <StatCard label="สมาชิกทั้งหมด" value={fmt(memberCount)} sub="ในระบบ" />
        <StatCard label="Campaigns" value={fmt(campaigns.length)} sub="ทั้งหมด" />
        <StatCard label="Calls วันนี้" value={fmt(todayCalls)} sub="ทั้งระบบ" />
        <StatCard label="Pending ของฉัน" value={fmt(pendingCount)} sub="รอโทร" />
      </Section>

      {/* Finance */}
      <Section title="PPLE Finance">
        <StatCard label="รายรับเดือนนี้" value={fmtBaht(finance?.total_income)} sub="รายรับ" />
        <StatCard label="รายจ่ายเดือนนี้" value={fmtBaht(finance?.total_expense)} sub="รายจ่าย" />
      </Section>

    </div>
  )
}
