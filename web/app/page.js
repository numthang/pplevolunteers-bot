import Link from 'next/link'
import Image from 'next/image'
import { getSession } from '@/lib/auth.js'
import LoginButton from '@/components/LoginButton.jsx'
import CopyButton from '@/components/CopyButton.jsx'
import { getMembersCount, getPendingCallCount } from '@/db/calling/members.js'
import { getContactPendingCount } from '@/db/calling/contacts.js'
import { getCampaigns } from '@/db/calling/campaigns.js'
import { getAccountsAll } from '@/db/finance/accounts.js'
import { canViewAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'
import { getGuilds } from '@/db/guilds.js'

const GUILD_ID = process.env.GUILD_ID
const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${process.env.DISCORD_BOT_CLIENT_ID}&permissions=1394003710544&scope=bot+applications.commands`

async function getTodayCallCount() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_logs WHERE DATE(created_at) = CURDATE()`
  )
  return Number(rows[0]?.count) || 0
}

async function getFINANCESummary(session) {
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


async function getGuildMemberCounts() {
  const [rows] = await pool.query(
    `SELECT g.guild_id, g.name, COUNT(m.discord_id) AS member_count
     FROM dc_guilds g
     LEFT JOIN dc_members m ON m.guild_id = g.guild_id COLLATE utf8mb4_unicode_ci
     GROUP BY g.guild_id, g.name
     ORDER BY member_count DESC`
  )
  return rows
}

async function getCONTACTSCount() {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS count FROM calling_contacts WHERE guild_id = ?`,
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


export default async function HomePage() {
  const session = await getSession()

  if (!session) {
    const guilds = await getGuilds()
    const fmt = (n) => Number(n || 0).toLocaleString('th-TH')

    return (
      <div className="space-y-3">

        {/* Hero */}
        <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-xl px-6 py-10 flex flex-col items-center text-center">
          <Image src="/logo.png" alt="PPLE" width={200} height={200} className="drop-shadow mb-3" />
          <h1 className="text-3xl font-bold text-warm-900 dark:text-disc-text mb-3">
            Pe<span className="text-brand-orange">O</span>ple's volunteers
          </h1>
          <p className="text-base text-warm-500 dark:text-disc-muted mb-1">the open project sandbox with ease</p>
          <p className="text-base text-warm-400 dark:text-disc-muted mb-7">
            พื้นที่โปรเจกต์แบบเปิด ที่ทำให้งานอาสาและไอที... เป็นเรื่องง่าย
          </p>
          <LoginButton />
        </div>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              href: '/calling',
              icon: 'M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z',
              title: 'CALLING',
              desc: 'แคมเปญโทรหาสมาชิก ติดตามผล และบริหารอาสาสมัคร',
            },
            {
              href: '/finance',
              icon: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z',
              title: 'FINANCE',
              desc: 'จัดการรายรับ-รายจ่าย บัญชีธนาคาร และรายงานการเงิน',
            },
            {
              href: '/contacts',
              icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
              title: 'CONTACTS',
              desc: 'CRM ผู้ติดต่อ ติดตาม pipeline และ calling assignments',
            },
          ].map(f => (
            <Link key={f.title} href={f.href} className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5 hover:border-brand-orange transition-colors">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-9 h-9 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-orange">
                    <path d={f.icon} />
                  </svg>
                </div>
                <p className="font-semibold text-base text-warm-900 dark:text-disc-text">{f.title}</p>
              </div>
              <p className="text-base text-warm-500 dark:text-disc-muted leading-relaxed">{f.desc}</p>
            </Link>
          ))}
        </div>

        {/* INTEGRATIONS card */}
        <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-orange">
                <path d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <p className="font-semibold text-base text-warm-900 dark:text-disc-text">INTEGRATIONS</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-brand-blue-light dark:border-disc-border rounded-lg p-4 hover:border-brand-orange transition-colors">
              <Link href="/integrations#discord-bot" className="block mb-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#5865F2] shrink-0">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
                  </svg>
                  <p className="text-base font-semibold text-warm-900 dark:text-disc-text">Discord Bot</p>
                </div>
                <p className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-0.5">{fmt(guilds.length)}</p>
                <p className="text-base text-warm-500 dark:text-disc-muted">servers · Slash commands · Role management</p>
              </Link>
              <a
                href={BOT_INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-semibold text-white bg-[#5865F2] hover:bg-[#4752C4] px-3 py-1.5 rounded-md transition-colors"
              >
                Add to Server
              </a>
            </div>
            <Link href="/integrations#api-access" className="border border-brand-blue-light dark:border-disc-border rounded-lg p-4 hover:border-brand-orange transition-colors block">
              <div className="flex items-center gap-1.5 mb-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-brand-orange shrink-0">
                  <path d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                <p className="text-base font-semibold text-warm-900 dark:text-disc-text">REST API</p>
              </div>
              <p className="text-base text-warm-500 dark:text-disc-muted mb-3">เชื่อมต่อระบบภายนอก — ดู docs หลัง login</p>
              <span className="inline-block text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold px-2.5 py-1 rounded-md">Active</span>
            </Link>
          </div>
        </div>

      </div>
    )
  }

  // --- Logged in: Dashboard ---
  const discordId = session.user.discordId
  const roles = Array.isArray(session.user.roles)
    ? session.user.roles
    : (session.user.roles || '').split(',').map(r => r.trim())
  const userIsAdmin = isAdmin(roles)

  const [memberCount, guilds, guildMemberCounts, campaigns, todayCalls, pendingCount, finance, displayName, contactsCount, contactPending] = await Promise.all([
    getMembersCount(),
    getGuilds(),
    getGuildMemberCounts(),
    getCampaigns(),
    getTodayCallCount(),
    discordId ? getPendingCallCount(discordId) : Promise.resolve(0),
    getFINANCESummary(session),
    discordId ? getDisplayName(discordId) : Promise.resolve(null),
    getCONTACTSCount(),
    discordId ? getContactPendingCount(discordId) : Promise.resolve(0),
  ])

  const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
  const fmtBaht = (n) => `฿${Number(n || 0).toLocaleString('th-TH')}`

  const arrowIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-warm-400 dark:text-disc-muted shrink-0">
      <path d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  )

  return (
    <div className="space-y-3">

      {/* Profile */}
      <div className="flex items-center gap-3 p-4 bg-card-bg rounded-xl border border-warm-200 dark:border-disc-border">
        {session.user.image && (
          <Image src={session.user.image} alt="" width={48} height={48} className="rounded-full shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="font-semibold text-base text-warm-900 dark:text-disc-text truncate">@{session.user.name}</span>
            <CopyButton text={session.user.name} />
          </div>
          <p className="text-sm text-warm-500 dark:text-disc-muted truncate">ID: {session.user.discordId}</p>
          {displayName && displayName !== session.user.name && (
            <p className="text-sm text-warm-500 dark:text-disc-muted truncate">Display name: {displayName}</p>
          )}
        </div>
        <Link href="/profile" className="shrink-0 text-sm text-brand-orange hover:text-brand-orange-light border border-brand-orange/30 hover:border-brand-orange px-3 py-1.5 rounded-lg transition-colors">
          แก้ไขโปรไฟล์
        </Link>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

        {/* CALLING */}
        <Link href="/calling" className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5 hover:border-brand-orange transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-orange">
                <path d="M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z" />
              </svg>
            </div>
            <p className="font-semibold text-base text-warm-900 dark:text-disc-text flex-1">CALLING</p>
            {arrowIcon}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-base">
              <span className="text-warm-500 dark:text-disc-muted">สมาชิกในระบบ</span>
              <span className="font-medium text-warm-900 dark:text-disc-text">{fmt(memberCount)}</span>
            </div>
            <div className="flex justify-between text-base">
              <span className="text-warm-500 dark:text-disc-muted">Campaigns</span>
              <span className="font-medium text-warm-900 dark:text-disc-text">{fmt(campaigns.length)}</span>
            </div>
            <div className="flex justify-between text-base">
              <span className="text-warm-500 dark:text-disc-muted">Calls วันนี้</span>
              <span className="font-medium text-warm-900 dark:text-disc-text">{fmt(todayCalls)}</span>
            </div>
            <div className="flex justify-between text-base">
              <span className="text-warm-500 dark:text-disc-muted">Pending calls</span>
              <span className="font-medium text-warm-900 dark:text-disc-text">{fmt(pendingCount)}</span>
            </div>
          </div>
        </Link>

        {/* FINANCE */}
        <Link href="/finance" className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5 hover:border-brand-orange transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-orange">
                <path d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
            </div>
            <p className="font-semibold text-base text-warm-900 dark:text-disc-text flex-1">FINANCE</p>
            {arrowIcon}
          </div>
          {!finance?.public && !finance?.internal && !finance?.private ? (
            <p className="text-base text-warm-400 dark:text-disc-muted">ยังไม่มีข้อมูล</p>
          ) : (
            <div className="space-y-2">
              {finance?.public && (
                <div>
                  <p className="text-sm text-warm-400 dark:text-disc-muted mb-1">🌐 สาธารณะ</p>
                  <div className="flex justify-between text-base"><span className="text-warm-500 dark:text-disc-muted">รายรับ</span><span className="font-medium text-warm-900 dark:text-disc-text">{fmtBaht(finance.public.total_income)}</span></div>
                  <div className="flex justify-between text-base"><span className="text-warm-500 dark:text-disc-muted">รายจ่าย</span><span className="font-medium text-warm-900 dark:text-disc-text">{fmtBaht(finance.public.total_expense)}</span></div>
                </div>
              )}
              {finance?.internal && (
                <div>
                  <p className="text-sm text-warm-400 dark:text-disc-muted mb-1">👥 ภายใน</p>
                  <div className="flex justify-between text-base"><span className="text-warm-500 dark:text-disc-muted">รายรับ</span><span className="font-medium text-warm-900 dark:text-disc-text">{fmtBaht(finance.internal.total_income)}</span></div>
                  <div className="flex justify-between text-base"><span className="text-warm-500 dark:text-disc-muted">รายจ่าย</span><span className="font-medium text-warm-900 dark:text-disc-text">{fmtBaht(finance.internal.total_expense)}</span></div>
                </div>
              )}
              {finance?.private && (
                <div>
                  <p className="text-sm text-warm-400 dark:text-disc-muted mb-1">🔒 ส่วนตัว</p>
                  <div className="flex justify-between text-base"><span className="text-warm-500 dark:text-disc-muted">รายรับ</span><span className="font-medium text-warm-900 dark:text-disc-text">{fmtBaht(finance.private.total_income)}</span></div>
                  <div className="flex justify-between text-base"><span className="text-warm-500 dark:text-disc-muted">รายจ่าย</span><span className="font-medium text-warm-900 dark:text-disc-text">{fmtBaht(finance.private.total_expense)}</span></div>
                </div>
              )}
            </div>
          )}
        </Link>

        {/* CONTACTS */}
        <Link href="/contacts" className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5 hover:border-brand-orange transition-colors">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-orange">
                <path d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <p className="font-semibold text-base text-warm-900 dark:text-disc-text flex-1">CONTACTS</p>
            {arrowIcon}
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-base">
              <span className="text-warm-500 dark:text-disc-muted">Contacts ทั้งหมด</span>
              <span className="font-medium text-warm-900 dark:text-disc-text">{fmt(contactsCount)}</span>
            </div>
            <div className="flex justify-between text-base">
              <span className="text-warm-500 dark:text-disc-muted">Pending calls</span>
              <span className="font-medium text-warm-900 dark:text-disc-text">{fmt(contactPending)}</span>
            </div>
          </div>
        </Link>

      </div>

      {/* INTEGRATIONS */}
        <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-orange">
                <path d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
              </svg>
            </div>
            <Link href="/integrations" className="font-semibold text-base text-brand-orange hover:text-brand-orange-light transition">INTEGRATIONS</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link href="/integrations#discord-bot" className="border border-brand-blue-light dark:border-disc-border rounded-lg p-4 hover:border-brand-orange transition-colors">
              <div className="flex items-center gap-1.5 mb-2">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#5865F2] shrink-0">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
                </svg>
                <p className="text-base font-semibold text-warm-900 dark:text-disc-text">Discord Bot</p>
              </div>
              <p className="text-2xl font-bold text-warm-900 dark:text-disc-text">{fmt(guilds.length)}</p>
              <p className="text-base text-warm-500 dark:text-disc-muted mb-2">servers</p>
              {guildMemberCounts.map(g => (
                <div key={g.guild_id} className="flex items-center justify-between text-base mt-1">
                  <span className="text-warm-700 dark:text-disc-text truncate">{g.name || g.guild_id}</span>
                  <span className="text-warm-500 dark:text-disc-muted shrink-0 ml-2">{fmt(g.member_count)} คน</span>
                </div>
              ))}
            </Link>
            <Link href="/integrations#api-access" className="border border-brand-blue-light dark:border-disc-border rounded-lg p-4 hover:border-brand-orange transition-colors">
              <div className="flex items-center gap-1.5 mb-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-brand-orange shrink-0">
                  <path d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
                <p className="text-base font-semibold text-warm-900 dark:text-disc-text">REST API</p>
              </div>
              <p className="text-base text-warm-500 dark:text-disc-muted mb-3">PPLEVOLUNTEERS API</p>
              <span className="inline-block text-sm bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-semibold px-2.5 py-1 rounded-md">
                {process.env.PPLEVOLUNTEERS_API_KEY ? 'Active' : 'ไม่ได้ตั้งค่า'}
              </span>
            </Link>
          </div>
        </div>

    </div>
  )
}
