import { Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import LoginPanel from '@/components/LoginPanel.jsx'
import LinkAccountsBanner from '@/components/LinkAccountsBanner.jsx'
import { getPendingCallCount } from '@/db/calling/members.js'
import { getContactPendingCount } from '@/db/calling/contacts.js'
import { getPendingSignaturesForUser } from '@/db/docs/entries.js'
import { countMyOpenCards } from '@/db/kanban/cards.js'
import { countByStatus } from '@/db/cases.js'
import { countPendingReview } from '@/db/posts/episodes.js'
import { getFavoriteAccounts } from '@/db/finance/accounts.js'
import { listMemberRoleNames } from '@/db/orgMemberRoles.js'
import { getUserIdentities } from '@/db/userIdentities.js'
import { getGuilds } from '@/db/guilds.js'
import { canViewAccount } from '@/lib/financeAccess.js'
import { canManageCases, getUserScope } from '@/lib/caseAccess.js'
import { kanbanViewer } from '@/lib/kanbanGuard.js'
import { normalizeAccess } from '@/lib/roleAccess.js'
import { getOrgEnabledFeatures } from '@/lib/orgFeatures.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'

const BOT_INVITE_URL = process.env.DISCORD_BOT_INVITE_URL

const fmt = (n) => Number(n || 0).toLocaleString('th-TH')
const fmtBaht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })}`

const ICON = {
  sign:    'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10',
  card:    'M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z',
  phone:   'M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z',
  case:    'M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z',
  pen:     'M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125',
  wallet:  'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3',
  arrow:   'M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3',
}

function Ic({ d, className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  )
}

/**
 * ตัวเลข 1 บรรทัดในการ์ดโมดูล — **กดได้ทุกบรรทัด** ลิงก์ไปหน้าที่กรองไว้แล้ว
 *
 * ⛔ หน้าแรกเป็น aggregator อ่านอย่างเดียว ห้ามมีปุ่มที่แก้ข้อมูลได้
 *    (kanban ผูกเคส/โพสต์อยู่แล้ว — ถ้าหน้านี้เริ่มแก้สถานะได้ มันจะกลายเป็นที่เก็บงานที่ 7)
 * ⚠️ ศูนย์ก็ยังโชว์ **ไม่ซ่อน** — การ์ดต้องหน้าตาเหมือนเดิมทุกวันถึงจะกวาดตาอ่านเร็ว
 *    (ต่างจากรอบก่อนที่ซ่อนแถวศูนย์ แล้วตำแหน่งตัวเลขขยับทุกวันจนต้องอ่านใหม่ทุกครั้ง)
 */
function StatRow({ href, label, count, value, tone = 'normal' }) {
  const zero = value == null && !count
  const badge = zero
    ? 'text-warm-400 dark:text-disc-muted'
    : tone === 'alert'
      ? 'text-red-600 dark:text-red-400 font-semibold'
      : 'text-warm-900 dark:text-disc-text font-semibold'
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 -mx-2 px-2 py-1 rounded-md hover:bg-warm-50 dark:hover:bg-disc-hover transition-colors"
    >
      <span className="text-base text-warm-500 dark:text-disc-muted truncate min-w-0">{label}</span>
      <span className={`text-base shrink-0 ${badge}`}>{value != null ? value : fmt(count)}</span>
    </Link>
  )
}

/** การ์ด 1 โมดูล — หัวการ์ดกดเข้าโมดูล · ข้างในมีสถานะกดได้ 2-3 บรรทัด */
function ModuleCard({ href, icon, title, children }) {
  return (
    <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg px-4 py-3">
      <Link href={href} className="flex items-center gap-2 mb-1.5 group">
        <span className="w-8 h-8 rounded-lg bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0 text-brand-orange">
          <Ic d={icon} className="w-[18px] h-[18px]" />
        </span>
        <span className="font-semibold text-base text-warm-900 dark:text-disc-text flex-1 group-hover:text-brand-orange transition-colors">
          {title}
        </span>
        <Ic d={ICON.arrow} className="w-4 h-4 text-warm-400 dark:text-disc-muted shrink-0" />
      </Link>
      <div>{children}</div>
    </div>
  )
}

// org icon (emoji / รูปอัปโหลด / fallback ตัวอักษร) — server-safe, mirror OrgAvatar
function OrgIcon({ icon, name }) {
  const isImg = typeof icon === 'string' && (icon.startsWith('/') || icon.startsWith('http'))
  return (
    <div className="w-12 h-12 rounded-full bg-warm-100 dark:bg-disc-hover flex items-center justify-center shrink-0 overflow-hidden text-2xl">
      {isImg ? (
        <Image src={icon} alt="" width={48} height={48} className="w-full h-full object-cover" />
      ) : icon ? (
        <span>{icon}</span>
      ) : (
        <span className="font-semibold text-warm-500 dark:text-disc-muted">{(name || '?').charAt(0).toUpperCase()}</span>
      )}
    </div>
  )
}

export default async function HomePage() {
  const t = await getTranslations('home')
  const session = await getSession()

  if (!session) {
    const guilds = await getGuilds()

    return (
      <div className="space-y-3">
        <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg px-6 py-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-center justify-items-center">
            <div className="flex flex-col items-center text-center">
              <Image src="/logo.png" alt="PPLE" width={200} height={200} className="drop-shadow mb-3" />
              <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-3">
                Pe<span className="text-brand-orange">O</span>ple&apos;s volunteers
              </h1>
              <p className="text-base text-warm-500 dark:text-disc-muted mb-1">{t('hero.tagline')}</p>
              <p className="text-base text-warm-500 dark:text-disc-muted">{t('hero.taglineTh')}</p>
            </div>
            <div className="w-full max-w-[360px]">
              <Suspense>
                <LoginPanel />
              </Suspense>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-brand-blue-light dark:border-disc-border flex items-center justify-center gap-2 text-base text-warm-500 dark:text-disc-muted">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#5865F2] shrink-0">
              <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
            </svg>
            <Link href="/integrations#discord-bot" className="hover:text-warm-900 dark:hover:text-disc-text transition-colors">
              {t('hero.botServers', { count: guilds.length })}
            </Link>
            <a href={BOT_INVITE_URL} target="_blank" rel="noopener noreferrer" className="text-brand-orange hover:text-brand-orange-light font-medium">
              {t('hero.addToServer')}
            </a>
          </div>
        </div>
      </div>
    )
  }

  // --- Logged in ---
  const discordId = session.user.discordId
  const userId = session.user.userId

  const { activeOrg } = userId ? await resolveActiveOrg(userId) : { activeOrg: null }

  // ยังไม่มีองค์กร (email signup ก่อนสร้าง org / Discord user ที่ไม่มี membership) → CTA
  //
  // เคสที่เจอบ่อยที่สุดตรงนี้คือ "คนเดิมที่หลงเข้าประตูใหม่": เคยอยู่ในดิสคอร์ดมานาน ยศครบ
  // แต่มา login ด้วย Google/อีเมล → ระบบหาอีเมลนั้นไม่เจอ (แถวเก่ามี email = NULL) เลยได้บัญชีเปล่า
  // → ถ้ายังไม่ผูก Discord ต้องชวนผูกก่อนเป็นอันดับแรก กดแล้วบัญชีเก่าจะถูกยุบรวมกลับมาให้เอง
  if (!activeOrg) {
    return (
      <div className="space-y-3">
        {!discordId && (
          <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg px-6 py-8 text-center">
            <h1 className="text-lg font-medium text-warm-900 dark:text-disc-text mb-2">{t('noOrg.discordHeading')}</h1>
            <p className="text-base text-warm-500 dark:text-disc-muted mb-6">{t('noOrg.discordBody')}</p>
            <a href="/api/link/discord" className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752c4] text-white font-medium px-4 py-2 text-base rounded-lg transition-colors">
              <svg viewBox="0 0 24 24" fill="#fff" width="18" height="18" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
              </svg>
              {t('noOrg.discordCta')}
            </a>
          </div>
        )}
        <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg px-6 py-10 text-center">
          <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-2">{t('noOrg.heading')}</h1>
          <p className="text-base text-warm-500 dark:text-disc-muted mb-6">{t('noOrg.body')}</p>
          <Link href="/org/new" className="inline-block bg-brand-orange hover:bg-brand-orange-light text-white font-medium px-4 py-2 text-base rounded-lg transition-colors">
            {t('noOrg.createCta')}
          </Link>
        </div>
      </div>
    )
  }

  const orgId = activeOrg.id
  const { access } = await getEffectiveOrgIdentity(session)
  const enabledFeatures = await getOrgEnabledFeatures(orgId)
  const on = (k) => enabledFeatures.includes(k)

  // ⚠️ เคสใช้ identity **คนละตัว** กับที่เหลือโดยตั้งใจ (2026-08-30)
  //    /case/manage ยังอ่านสิทธิ์ผ่าน getEffectiveIdentity (guild-based) + getUserScope
  //    ถ้าหน้าแรกใช้ org identity แล้วสองตัวให้ผลไม่เท่ากัน = โชว์ "เคสค้าง 12" กดเข้าไปเห็น 3
  //    → ยอมจ่าย query เพิ่ม 1 ครั้งเพื่อให้ตัวเลขตรงกับหน้าที่มันลิงก์ไป
  //    (ตะเข็บนี้ควรหายตอน ORG_ACCESS_REDESIGN ขั้น 6 — จดไว้ที่ md/PENDING.md แล้ว)
  const { access: caseAccess } = await getEffectiveIdentity(session)
  const caseScope = getUserScope(caseAccess)
  const casesOn = on('cases') && canManageCases(caseAccess)

  // ⛔ viewer ต้องมาจาก kanbanViewer() เท่านั้น — ประกอบเองเมื่อไหร่ = การ์ดที่ผูกเคสหายเงียบ
  const viewer = kanbanViewer(access, userId)
  // ⚠️ 'admin' เป็น **permission** ไม่ใช่ capability — can() จะ throw ถ้าส่งเข้าไป (เจอตอนกดจริง)
  //    เช็คแบบเดียวกับ canPurge() ใน lib/kanbanAccess.js
  const isOrgAdmin = (normalizeAccess(access).permissions || new Set()).has('admin')

  const [
    docsPending, myCards, callPending, contactPending,
    caseCounts, postsReview,
    favAccounts, roleNames, identities,
  ] = await Promise.all([
    on('docs') && userId ? getPendingSignaturesForUser(userId, orgId) : Promise.resolve({ recipient: [], payer: [] }),
    on('kanban') && userId ? countMyOpenCards(orgId, userId, viewer) : Promise.resolve({ total: 0, overdue: 0, dueSoon: 0 }),
    on('calling') && userId ? getPendingCallCount(userId) : Promise.resolve(0),
    on('calling') && userId ? getContactPendingCount(userId) : Promise.resolve(0),
    casesOn ? countByStatus(orgId, caseScope) : Promise.resolve({}),
    on('posts') ? countPendingReview(orgId) : Promise.resolve(0),
    on('finance') && userId
      ? getFavoriteAccounts(orgId, userId, { canView: (a) => canViewAccount(a, userId, access) })
      : Promise.resolve([]),
    userId ? listMemberRoleNames(orgId, userId) : Promise.resolve([]),
    discordId ? getUserIdentities(discordId) : Promise.resolve([]),
  ])

  // นับให้ตรงกับ badge บน Nav เป๊ะ — /api/docs/pending?count=true คืน recipient.length + payer.length
  // นับให้ตรงกับ badge บน Nav เป๊ะ — /api/docs/pending?count=true คืน recipient.length + payer.length
  const signCount = docsPending.recipient.length + docsPending.payer.length

  return (
    <div className="space-y-3">

      {/* ผูกบัญชีสำรอง — เฉพาะ login ด้วย Discord และยังไม่ผูกอะไรเลยสักอัน */}
      {discordId && <LinkAccountsBanner linkedProviders={identities.map(i => i.provider)} />}

      {/* 1 · โปรไฟล์ฉัน — user มาก่อน org (org สลับได้ที่ Nav)
          ⚠️ ชิปยศอยู่ **แถวของตัวเอง** ไม่ใช่ในคอลัมน์กลาง — บนมือถือมันเบียดจนชื่อองค์กรโดนตัด
             และดันปุ่มไปทับ (เจอตอนถ่ายจอที่ 430px) */}
      <div className="bg-card-bg rounded-lg border border-brand-blue-light dark:border-disc-border px-4 py-3">
        <div className="flex items-center gap-3">
          <OrgIcon icon={activeOrg.icon} name={activeOrg.name} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base text-warm-900 dark:text-disc-text truncate">
              {session.user.name || session.user.email}
            </p>
            <p className="text-sm text-warm-500 dark:text-disc-muted truncate">
              {t('profile.orgLine', { org: activeOrg.name, members: fmt(activeOrg.member_count) })}
            </p>
          </div>
          <Link
            href={isOrgAdmin ? '/org/settings' : '/profile'}
            className="shrink-0 text-base text-brand-orange hover:text-brand-orange-light border border-brand-orange/30 hover:border-brand-orange px-4 py-2 rounded-lg transition-colors"
          >
            {isOrgAdmin ? t('profile.orgSettings') : t('profile.myProfile')}
          </Link>
        </div>

        {(activeOrg.role === 'owner' || roleNames.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {activeOrg.role === 'owner' && (
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-brand-orange/10 text-brand-orange">
                {t('profile.owner')}
              </span>
            )}
            {roleNames.slice(0, 3).map((r) => (
              <span key={r} className="px-3 py-1 text-sm font-medium rounded-full bg-warm-100 dark:bg-disc-hover text-warm-700 dark:text-disc-text">
                {r}
              </span>
            ))}
            {roleNames.length > 3 && (
              <span className="text-sm text-warm-500 dark:text-disc-muted">
                {t('profile.moreRoles', { count: roleNames.length - 3 })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 2 · การ์ดโมดูล — ใบละฟีเจอร์ · ทุกบรรทัดกดได้ ลิงก์ไปหน้าที่กรองไว้แล้ว
          ⚠️ items-start สำคัญ: ค่าตั้งต้นของ grid คือ stretch → การ์ดที่มี 1-2 บรรทัด
             จะถูกยืดให้สูงเท่าใบที่สูงสุดในแถว แล้วเหลือที่ว่างโล่งใต้ตัวเลข */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-start">

        {on('kanban') && (
          <ModuleCard href="/kanban" icon={ICON.card} title={t('card.kanban')}>
            <StatRow href="/kanban?status=backlog" label={t('kanban.backlog')} count={myCards.backlog} />
            <StatRow href="/kanban?status=doing" label={t('kanban.doing')} count={myCards.doing} />
            <StatRow href="/kanban?group=due" label={t('kanban.overdue')} count={myCards.overdue} tone="alert" />
          </ModuleCard>
        )}

        {on('docs') && (
          <ModuleCard href="/docs" icon={ICON.sign} title={t('card.docs')}>
            <StatRow href="/docs/pending" label={t('docs.recipient')} count={docsPending.recipient.length} />
            <StatRow href="/docs/pending" label={t('docs.payer')} count={docsPending.payer.length} />
          </ModuleCard>
        )}

        {on('calling') && (
          <ModuleCard href="/calling" icon={ICON.phone} title={t('card.calling')}>
            <StatRow href="/calling/assignee" label={t('calling.members')} count={callPending} />
            <StatRow href="/calling/assignee" label={t('calling.contacts')} count={contactPending} />
          </ModuleCard>
        )}

        {casesOn && (
          <ModuleCard href="/case/manage" icon={ICON.case} title={t('card.cases')}>
            <StatRow href="/case/manage?status=open" label={t('cases.open')} count={caseCounts.open || 0} />
            <StatRow href="/case/manage?status=in_progress" label={t('cases.inProgress')} count={caseCounts.in_progress || 0} />
          </ModuleCard>
        )}

        {on('posts') && (
          <ModuleCard href="/posts" icon={ICON.pen} title={t('card.posts')}>
            <StatRow href="/posts?status=review" label={t('posts.review')} count={postsReview} />
          </ModuleCard>
        )}

        {on('finance') && (
          <ModuleCard href="/finance" icon={ICON.wallet} title={t('card.finance')}>
            {favAccounts.length === 0 ? (
              <p className="text-base text-warm-400 dark:text-disc-muted py-1.5">{t('finance.empty')}</p>
            ) : favAccounts.map((a) => (
              <StatRow
                key={a.id}
                href={`/finance/transactions?accountId=${a.id}`}
                label={a.name}
                value={fmtBaht(a.balance)}
              />
            ))}
          </ModuleCard>
        )}

      </div>

    </div>
  )
}
