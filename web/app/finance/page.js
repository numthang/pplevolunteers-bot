import { requireAuth } from '@/lib/auth.js'
import { getAccountsAll } from '@/db/finance/accounts.js'
import { getAccountSummary } from '@/db/finance/transactions.js'
import { canViewAccount, canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { isAdmin } from '@/lib/roles.js'
import Link from 'next/link'
import AccountCard from '@/components/finance/AccountCard'
import AddAccountButton from '@/components/finance/AddAccountButton'

const GUILD_ID = process.env.GUILD_ID

const VISIBILITY_LABEL = {
  public:   { label: 'สาธารณะ', cls: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400' },
  internal: { label: 'ภายใน',   cls: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400' },
  private:  { label: 'ส่วนตัว', cls: 'bg-gray-100 dark:bg-disc-hover text-gray-500 dark:text-disc-muted' },
}

function fmt(n) {
  return Math.abs(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0฿'
}
export default async function FinancePage() {
  const session = await requireAuth()
  const { roles, discordId } = await getEffectiveIdentity(session)
  const raw = await getAccountsAll(GUILD_ID, discordId, roles.includes('Admin'))
  const accounts = raw.filter(a => canViewAccount(a, discordId, roles))

  const summaries = await Promise.all(
    accounts.map(async acc => {
      const s = await getAccountSummary(GUILD_ID, acc.id)
      return { ...acc, balance: Number(s.total_income || 0) - Number(s.total_expense || 0) }
    })
  )

  const groups = [
    { key: 'public',   label: '🌐 สาธารณะ' },
    { key: 'internal', label: '👥 ภายใน' },
    { key: 'private',  label: '🔒 ส่วนตัว' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ภาพรวม</h1>
        <AddAccountButton />
      </div>

      {summaries.length === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p className="mb-4">ยังไม่มีบัญชีที่คุณเข้าถึงได้</p>
          <Link href="/finance/accounts" className="text-indigo-600 hover:underline">+ เพิ่มบัญชีใหม่</Link>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(({ key, label }) => {
            const group = summaries.filter(a => a.visibility === key)
            if (!group.length) return null
            const total = group.reduce((s, a) => s + a.balance, 0)
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-3">
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted uppercase tracking-wide">{label}</h2>
                  <span className={`text-sm font-mono font-semibold ${total >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {total < 0 ? '-' : ''}{fmt(total)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {group.map(acc => <AccountCard key={acc.id} account={{ ...acc, balance: acc.balance }} canEdit={canEditAccount(acc, discordId, roles)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/finance/transactions" className="text-indigo-600 hover:underline">รายการทั้งหมด</Link>
        <Link href="/finance/categories" className="text-indigo-600 hover:underline">หมวดหมู่</Link>
      </div>
    </div>
  )
}

