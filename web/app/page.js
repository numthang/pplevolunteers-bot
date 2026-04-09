import { getPublicAccounts } from '@/db/finance/accounts.js'
import { getTransactions } from '@/db/finance/transactions.js'
import BankBadge from '@/components/BankBadge'

const GUILD_ID = process.env.GUILD_ID

export default async function PublicDashboard() {
  const accounts = await getPublicAccounts(GUILD_ID)

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">รายงานการเงิน PPLE Volunteers</h1>

      {accounts.length === 0 ? (
        <p className="text-gray-500">ยังไม่มีข้อมูลบัญชีสาธารณะ</p>
      ) : (
        <div className="space-y-8">
          {accounts.map((acc) => (
            <AccountPublicCard key={acc.id} account={acc} />
          ))}
        </div>
      )}
    </div>
  )
}

async function AccountPublicCard({ account }) {
  const txns = await getTransactions(account.guild_id, { accountId: account.id, limit: 10 })

  const income  = txns.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0)
  const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <BankBadge bank={account.bank} size={40} />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{account.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{account.bank} · {account.account_no}</p>
          </div>
        </div>
        <div className="text-right text-sm">
          <p className="text-green-600 dark:text-green-400">+{income.toLocaleString('th-TH')} ฿</p>
          <p className="text-red-500 dark:text-red-400">-{expense.toLocaleString('th-TH')} ฿</p>
        </div>
      </div>

      {txns.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
              <th className="pb-1">วันที่</th>
              <th className="pb-1">รายการ</th>
              <th className="pb-1 text-right">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => (
              <tr key={t.id} className="border-b dark:border-gray-700 last:border-0">
                <td className="py-1 text-gray-500 dark:text-gray-400">
                  {new Date(t.txn_at).toLocaleDateString('th-TH')}
                </td>
                <td className="py-1 text-gray-900 dark:text-gray-100">{t.description}</td>
                <td className={`py-1 text-right font-mono ${t.type === 'income' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                  {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString('th-TH')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
