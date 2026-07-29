import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getUserGuilds, guildsOfOrg } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import GuildSwitcherBar from '@/components/GuildSwitcherBar.jsx'

export const metadata = { title: { template: '%s — Bot', default: 'Bot Settings' } }

// หมวด /bot/* scope ด้วย guild (ยศ/ห้อง/บัญชีโซเชียลของเพจ) ไม่ใช่ org
// → guild switcher ต้องอยู่ตรงนี้ ไม่ใช่ซ่อนใน hamburger (bug-063)
export default async function BotLayout({ children }) {
  const session = await getSession()

  let guilds = []
  let currentGuildId = null
  if (session?.user?.userId) {
    const { activeOrg } = await resolveActiveOrg(session.user.userId)
    if (activeOrg) {
      const orgGuilds = await guildsOfOrg(activeOrg.id)
      if (orgGuilds.length > 0) {
        currentGuildId = await getGuildId(session)
        guilds = session.user.discordId
          ? (await getUserGuilds(session.user.discordId, { all: session.user.isSuperAdmin }))
              .filter(g => g.org_id === activeOrg.id)
          : orgGuilds
      }
    }
  }

  // org ไม่มี guild → ไม่มี guild context เลย · แสดงคำอธิบายแทนหน้าเปล่า/ข้อมูล guild อื่น
  if (!guilds.length) {
    const t = await getTranslations('bot.noGuild')
    return (
      <div className="-mx-3 sm:-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-disc-bg2">
        <div className="max-w-5xl mx-auto px-1 sm:px-4 py-4">
          <div className="rounded-xl border border-warm-200 dark:border-disc-border bg-card-bg p-8 text-center">
            <p className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('title')}</p>
            <p className="mt-2 text-sm text-warm-500 dark:text-disc-muted">{t('body')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-3 sm:-mx-4 -mt-6 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="max-w-5xl mx-auto px-1 sm:px-4 py-4">
        <GuildSwitcherBar guilds={guilds} currentGuildId={currentGuildId} />
        {children}
      </div>
    </div>
  )
}
