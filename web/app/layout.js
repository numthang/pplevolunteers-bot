import './globals.css'
import NextTopLoader from 'nextjs-toploader'
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
    <html lang="th">
      <body className="bg-gray-100 dark:bg-disc-bg2 text-gray-900 dark:text-disc-text min-h-screen">
        <Providers session={session}>
          <NextTopLoader color="#ff6a13" showSpinner={false} />
          <Nav session={session} guilds={guilds} currentGuildId={currentGuildId} enabledFeatures={enabledFeatures} />
          <main className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 pb-6">
            {noGuild ? <NoGuildNotice /> : children}
          </main>
        </Providers>
      </body>
    </html>
  )
}
