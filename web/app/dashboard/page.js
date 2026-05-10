import Link from 'next/link'
import Image from 'next/image'
import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import { getMembersCount, getPendingCallCount } from '@/db/calling/members.js'
import { getCampaigns } from '@/db/calling/campaigns.js'
import { getAccountsAll } from '@/db/finance/accounts.js'
import { canViewAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

const GUILD_ID = process.env.GUILD_ID

async function getTodayCallCount() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_logs WHERE DATE(created_at) = CURDATE()`
  )
  return Number(rows[0]?.count) || 0
}

async function getFinanceSummary(session) {
  const { roles, discordId } = await getEffectiveIdentity(session)
  const raw = await getAccountsAll(GUILD_ID, discordId, isAdmin(roles))
  const accessibleAccounts = raw.filter(a => canViewAccount(a, discordId, roles))

  const results = { public: null, internal: null, private: null }

  for (const visibility of ['public', 'internal', 'private']) {
    const visibleAccounts = accessibleAccounts.filter(a => a.visibility === visibility)
    if (visibleAccounts.length === 0) continue

    const accountIds = visibleAccounts.map(a => a.id)
    const [rows] = await pool.query(
      `SELECT
         SUM(CASE WHEN t.type='income'  THEN t.amount ELSE 0 END) AS total_income,
         SUM(CASE WHEN t.type='expense' THEN t.amount ELSE 0 END) AS total_expense
       FROM finance_transactions t
       WHERE t.account_id IN (${accountIds.join(',')})
         AND MONTH(t.txn_at) = MONTH(CURDATE()) AND YEAR(t.txn_at) = YEAR(CURDATE())`
    )
    results[visibility] = rows[0]
  }

  return results
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
    <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5">
      <p className="text-sm text-warm-500 dark:text-disc-muted mb-1">{label}</p>
      <p className="text-3xl font-bold text-warm-900 dark:text-disc-text">{value}</p>
      {sub && <p className="text-xs text-warm-400 dark:text-disc-muted mt-1">{sub}</p>}
    </div>
  )
}

function SectionIcon({ icon }) {
  const svgPath = {
    campaigns: 'M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z',
    transactions: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
    bot: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d={svgPath[icon]} />
    </svg>
  )
}

function Section({ title, href, icon, children }) {
  const titleContent = (
    <span className="inline-flex items-center gap-2">
      {icon && <SectionIcon icon={icon} />}
      {title}
    </span>
  )

  return (
    <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-xl p-6">
      {href ? (
        <Link href={href} className="text-xl font-bold text-brand-orange mb-4 hover:text-brand-orange-light transition inline-flex items-center gap-2">
          {titleContent}
        </Link>
      ) : (
        <p className="text-xl font-bold text-brand-orange mb-4">{titleContent}</p>
      )}
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
    getFinanceSummary(session),
    discordId ? getDisplayName(discordId) : Promise.resolve(null),
  ])

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
  const fmtBaht = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`

  return (
    <div className="space-y-3">

      {/* Profile */}
      <div className="flex items-center gap-3 p-4 bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border">
        {session.user.image && (
          <Image src={session.user.image} alt="" width={48} height={48} className="rounded-full shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={`https://discord.com/users/${session.user.discordId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-warm-900 dark:text-disc-text hover:underline truncate block"
          >
            @{session.user.name}
          </a>
          <p className="text-xs text-warm-500 dark:text-disc-muted truncate">ID: {session.user.discordId}</p>
          {displayName && displayName !== session.user.name && (
            <p className="text-xs text-warm-500 dark:text-disc-muted truncate">Display name: {displayName}</p>
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
      <Section title="Discord Bot" icon="bot">
        <StatCard label="สมาชิก Discord" value={fmt(dcMemberCount)} sub="ใน server" />
        <StatCard label="QR Login" value="—" sub="coming soon" />
      </Section>

      {/* Calling */}
      <Section title="PPLE Calling" href="/calling" icon="campaigns">
        <StatCard label="สมาชิกทั้งหมด" value={fmt(memberCount)} sub="ในระบบ" />
        <StatCard label="Campaigns" value={fmt(campaigns.length)} sub="ทั้งหมด" />
        <StatCard label="Calls วันนี้" value={fmt(todayCalls)} sub="ทั้งระบบ" />
        <StatCard label="Pending ของฉัน" value={fmt(pendingCount)} sub="รอโทร" />
      </Section>

      {/* Finance */}
      <Section title="PPLE Finance" href="/finance" icon="transactions">
        {finance?.public ? (
          <>
            <div className="col-span-2 text-xs font-semibold text-green-600 dark:text-green-400 mb-2">🌐 สาธารณะ</div>
            <StatCard label="รายรับ" value={fmtBaht(finance.public.total_income)} />
            <StatCard label="รายจ่าย" value={fmtBaht(finance.public.total_expense)} />
          </>
        ) : null}
        {finance?.internal ? (
          <>
            <div className="col-span-2 text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-2">👥 ภายใน</div>
            <StatCard label="รายรับ" value={fmtBaht(finance.internal.total_income)} />
            <StatCard label="รายจ่าย" value={fmtBaht(finance.internal.total_expense)} />
          </>
        ) : null}
        {finance?.private ? (
          <>
            <div className="col-span-2 text-xs font-semibold text-warm-500 dark:text-disc-muted mb-2">🔒 ส่วนตัว</div>
            <StatCard label="รายรับ" value={fmtBaht(finance.private.total_income)} />
            <StatCard label="รายจ่าย" value={fmtBaht(finance.private.total_expense)} />
          </>
        ) : null}
        {!finance?.public && !finance?.internal && !finance?.private ? (
          <div className="col-span-2 text-xs text-warm-400 dark:text-disc-muted text-center py-4">ยังไม่มีข้อมูล</div>
        ) : null}
      </Section>

    </div>
  )
}
