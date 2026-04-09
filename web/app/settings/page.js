import { requireAuth } from '@/lib/auth.js'
import { getAccountsForUser } from '@/db/finance/accounts.js'
import SettingsClient from './SettingsClient.jsx'

const GUILD_ID = process.env.GUILD_ID

export default async function SettingsPage() {
  const session = await requireAuth()
  const accounts = await getAccountsForUser(GUILD_ID, session.user.discordId)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">ตั้งค่า</h1>
      <SettingsClient accounts={accounts} />
    </div>
  )
}
