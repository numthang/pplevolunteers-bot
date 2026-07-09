import './globals.css'
import NextTopLoader from 'nextjs-toploader'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { getUserGuilds, getEnabledFeatures } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import Providers from '@/components/Providers.jsx'
import Nav from '@/components/Nav.jsx'
import NoGuildNotice from '@/components/NoGuildNotice.jsx'

export const metadata = {
  title: {
    default: 'PPLE Volunteers',
    template: '%s — PPLE Volunteers',
  },
  description: 'PPLE Volunteers',
}

export default async function RootLayout({ children }) {
  const session = await getSession()
  const [locale, messages] = await Promise.all([getLocale(), getMessages()])

  let guilds = []
  let currentGuildId = null
  let enabledFeatures = []
  if (session?.user?.discordId) {
    currentGuildId = await getGuildId(session)
    ;[guilds, enabledFeatures] = await Promise.all([
      getUserGuilds(session.user.discordId, { all: session.user.isSuperAdmin }),
      getEnabledFeatures(currentGuildId),
    ])
  }

  // login แล้วแต่ไม่ได้เป็น member ของ guild ใดเลย → block (ยกเว้น super_admin ที่เห็นทุก guild)
  const noGuild = !!session?.user && guilds.length === 0 && !session.user.isSuperAdmin

  return (
    <html lang={locale}>
      <body className="bg-gray-100 dark:bg-disc-bg2 text-gray-900 dark:text-disc-text min-h-screen">
        <NextIntlClientProvider locale={locale} messages={messages}>
        <Providers session={session}>
          <NextTopLoader color="#ff6a13" showSpinner={false} />
          <Nav session={session} guilds={guilds} currentGuildId={currentGuildId} enabledFeatures={enabledFeatures} />
          {/* key=currentGuildId: บังคับ remount ทั้ง subtree ตอนสลับ guild
              กัน NotFoundBoundary ที่เคย trip (จาก requireFeature) ค้างสถานะ 404
              ข้าม guild ที่ enable feature ไม่เหมือนกัน — router.refresh() อย่างเดียวไม่พอ
              เพราะ error boundary ไม่ reset เองถ้า component ไม่ remount */}
          <main key={currentGuildId} className="max-w-5xl mx-auto px-1 sm:px-4 pt-3 pb-4">
            {noGuild ? <NoGuildNotice /> : children}
          </main>
        </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
