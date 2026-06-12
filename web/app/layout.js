import './globals.css'
import { getSession } from '@/lib/auth.js'
import { getUserGuilds } from '@/db/guilds.js'
import { getGuildId } from '@/lib/guildContext.js'
import Providers from '@/components/Providers.jsx'
import Nav from '@/components/Nav.jsx'

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
  if (session?.user?.discordId) {
    ;[guilds, currentGuildId] = await Promise.all([
      getUserGuilds(session.user.discordId),
      getGuildId(session),
    ])
  }

  return (
    <html lang="th">
      <body className="bg-gray-100 dark:bg-disc-bg2 text-gray-900 dark:text-disc-text min-h-screen">
        <Providers session={session}>
          <Nav session={session} guilds={guilds} currentGuildId={currentGuildId} />
          <main className="max-w-5xl mx-auto px-3 sm:px-4 pt-3 pb-6">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
