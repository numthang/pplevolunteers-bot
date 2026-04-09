import { requireAuth } from '@/lib/auth.js'
import { getAccountsForUser } from '@/db/finance/accounts.js'
import { getAccountSummary } from '@/db/finance/transactions.js'
import Link from 'next/link'

const GUILD_ID = process.env.GUILD_ID

export default async function DashboardPage() {
  const session = await requireAuth()
  const accounts = await getAccountsForUser(GUILD_ID, session.user.discordId)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ภาพรวม</h1>
        <span className="text-sm text-gray-500">สวัสดี {session.user.nickname}</span>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p className="mb-4">ยังไม่มีบัญชีที่คุณเข้าถึงได้</p>
          <Link href="/finance/accounts" className="text-indigo-600 hover:underline">+ เพิ่มบัญชีใหม่</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map(acc => (
            <AccountCard key={acc.id} account={acc} guildId={GUILD_ID} />
          ))}
        </div>
      )}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/finance/transactions" className="text-indigo-600 hover:underline">รายการทั้งหมด</Link>
        <Link href="/finance/accounts" className="text-indigo-600 hover:underline">จัดการบัญชี</Link>
        <Link href="/finance/categories" className="text-indigo-600 hover:underline">หมวดหมู่</Link>
      </div>
    </div>
  )
}

async function AccountCard({ account, guildId }) {
  const summary = await getAccountSummary(guildId, account.id)
  const balance = Number(summary.total_income || 0) - Number(summary.total_expense || 0)

  return (
    <Link href={`/finance/transactions?accountId=${account.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 hover:shadow-md transition cursor-pointer">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{account.name}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">{account.bank}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            account.visibility === 'public'   ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' :
            account.visibility === 'internal' ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400' :
                                                'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}>
            {account.visibility}
          </span>
        </div>
        <p className={`mt-3 text-xl font-mono font-bold ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
          {balance.toLocaleString('th-TH')} ฿
        </p>
      </div>
    </Link>
  )
}
