import './globals.css'
import { getSession } from '@/lib/auth.js'
import Providers from '@/components/Providers.jsx'
import Nav from '@/components/Nav.jsx'

export const metadata = {
  title: {
    default: 'PPLE Volunteers',
    template: '%s — PPLE Volunteers',
  },
  description: 'PPLE Volunteers',
  icons: { icon: '/logo.png' },
}

export default async function RootLayout({ children }) {
  const session = await getSession()
  return (
    <html lang="th">
      <body className="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 min-h-screen">
        <Providers session={session}>
          <Nav session={session} />
          <main className="max-w-5xl mx-auto px-4 py-6">{children}</main>
        </Providers>
      </body>
    </html>
  )
}
