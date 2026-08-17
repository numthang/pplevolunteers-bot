import { getTranslations } from 'next-intl/server'
import { getSession, redirectToLogin } from '@/lib/auth.js'
import { getUserGuilds, guildsOfOrg } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import GuildSwitcherBar from '@/components/GuildSwitcherBar.jsx'

// โซน /team — "ทีม" · ย้ายผังทีมออกจาก /bot/orgchart (2026-08-17)
//
// ทำไมต้องย้าย: ผังทีมเป็นของ **อ่านอย่างเดียว เปิดให้สมาชิกทุกคน** แต่ไปนั่งอยู่ในเมนู
// ตั้งค่าบอทที่เหลือทั้งหมดเป็นของแอดมิน · แถมโดน sidebar + max-w-5xl ของโซนนั้นบีบจนเต็มจอไม่ได้
//
// ⚠️ **ไม่ล็อกความกว้าง** (เหมือน /kanban) — ผังเป็น canvas แนวนอน ยิ่งกว้างยิ่งอ่านง่าย
// ⚠️ ข้อมูลผูกกับ guild (ยศ/กิจกรรมในดิสฯ) ไม่ใช่ org → ต้องมี GuildSwitcherBar ติดมาด้วย
//    org ที่ยังไม่ผูก Discord จะไม่มีอะไรให้ดู → ขึ้นคำอธิบายแทนหน้าเปล่า (โครงเดียวกับ /bot)
export default async function TeamLayout({ children }) {
  const session = await getSession()
  if (!session) await redirectToLogin()

  let guilds = []
  let currentGuildId = null
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

  if (!guilds.length) {
    const t = await getTranslations('team.noGuild')
    return (
      <div className="-mx-1 sm:-mx-4 -mt-3 min-h-screen bg-warm-50 dark:bg-disc-bg2">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-4">
          <div className="rounded-lg border border-warm-200 dark:border-disc-border bg-card-bg p-8 text-center">
            <p className="text-base font-semibold text-warm-900 dark:text-disc-text">{t('title')}</p>
            <p className="mt-2 text-base text-warm-500 dark:text-disc-muted">{t('body')}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="-mx-1 sm:-mx-4 -mt-3 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="px-3 sm:px-4 py-4">
        <GuildSwitcherBar guilds={guilds} currentGuildId={currentGuildId} />
        {children}
      </div>
    </div>
  )
}
