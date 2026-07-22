import './globals.css'
import NextTopLoader from 'nextjs-toploader'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getUserGuilds, guildsOfOrg } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import { resolveActiveOrg } from '@/lib/activeOrg.js'
import Providers from '@/components/Providers.jsx'
import Nav from '@/components/Nav.jsx'
import { getOrgEnabledFeatures } from '@/lib/orgFeatures.js'

export const metadata = {
  title: {
    default: 'PLATFOR{m}.ORG',
    template: '%s · PLATFOR{m}.ORG',
  },
  description: 'platfor.org · แพลตฟอร์มบริหารองค์กรอาสาและเครือข่าย',
}

export default async function RootLayout({ children }) {
  const session = await getSession()
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  // org-first: switcher อ่าน org ของ user (รวม guildless self-serve org) แทน guild
  let orgs = []
  let activeOrgId = null
  let guilds = []
  let currentGuildId = null
  let enabledFeatures = []
  if (session?.user?.userId) {
    const { activeOrg, orgs: allOrgs } = await resolveActiveOrg(session.user.userId)
    orgs = allOrgs.filter(o => o.status === 'active')
    activeOrgId = activeOrg?.id ?? null
    if (activeOrg) {
      // สวิตช์ฟีเจอร์อยู่ที่ org ที่เดียว (2026-07-22) — ไม่แตกสาขาตามว่ามี guild ไหมอีกแล้ว
      enabledFeatures = await getOrgEnabledFeatures(activeOrg.id)
      const orgGuilds = await guildsOfOrg(activeOrg.id)
      if (orgGuilds.length > 0) {
        // guild switcher ยังต้องใช้ (Discord artifact: ยศ/ห้อง/ai_mention ยังราย guild)
        currentGuildId = await getGuildId(session)
        guilds = session.user.discordId
          ? (await getUserGuilds(session.user.discordId, { all: session.user.isSuperAdmin }))
              .filter(g => g.org_id === activeOrg.id)
          : orgGuilds
      }
    }
  }

  // ไม่ block ด้วย guild membership อีกต่อไป (org platform หลาย tenant — ใครก็เข้าหน้าแรกได้)
  // feature ราย guild มี permission check ของตัวเอง · switcher + สร้างองค์กรอยู่ใน Nav
  return (
    <html lang={locale}>
      <body className="bg-gray-100 dark:bg-disc-bg2 text-gray-900 dark:text-disc-text min-h-screen">
        <NextIntlClientProvider locale={locale} messages={messages}>
        <Providers session={session}>
          <NextTopLoader color="#ff6a13" showSpinner={false} />
          <Nav session={session} orgs={orgs} activeOrgId={activeOrgId} guilds={guilds} currentGuildId={currentGuildId} enabledFeatures={enabledFeatures} />
          {/* key=currentGuildId: บังคับ remount ทั้ง subtree ตอนสลับ guild
              กัน NotFoundBoundary ที่เคย trip (จาก requireFeature) ค้างสถานะ 404
              ข้าม guild ที่ enable feature ไม่เหมือนกัน — router.refresh() อย่างเดียวไม่พอ
              เพราะ error boundary ไม่ reset เองถ้า component ไม่ remount */}
          <main key={currentGuildId} className="max-w-5xl mx-auto px-1 sm:px-4 pt-3 pb-4">
            {children}
          </main>
        </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
