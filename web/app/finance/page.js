import { requireAuth } from '@/lib/auth.js'
import { getAccountsAll } from '@/db/finance/accounts.js'
import { getAccountSummary } from '@/db/finance/transactions.js'
import { canViewAccount, canEditAccount } from '@/lib/financeAccess.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { can } from '@/lib/permissions.js'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import AccountCard from '@/components/finance/AccountCard'
import AddAccountButton from '@/components/finance/AddAccountButton'

function fmt(n) {
  return Math.abs(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0฿'
}
export default async function FinancePage() {
  const t = await getTranslations('finance')
  const session = await requireAuth()
  const { userId, access } = await getEffectiveOrgIdentity(session)
  const ORG_ID = await getOrgId(session)
  const raw = await getAccountsAll(ORG_ID, userId, can('viewPrivateOther', access.permissions))
  const accounts = raw.filter(a => canViewAccount(a, userId, access))

  const summaries = await Promise.all(
    accounts.map(async acc => {
      const s = await getAccountSummary(ORG_ID, acc.id)
      return { ...acc, balance: Number(s.total_income || 0) - Number(s.total_expense || 0) }
    })
  )

  const groups = [
    { key: 'public',   label: `🌐 ${t('visibility.public')}` },
    { key: 'internal', label: `👥 ${t('visibility.internal')}` },
    { key: 'private',  label: `🔒 ${t('visibility.private')}` },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-balance">{t('dashboard.title')}</h1>
        <AddAccountButton />
      </div>

      {summaries.length === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p className="mb-4">{t('dashboard.empty')}</p>
          <Link href="/finance/accounts" className="text-indigo-600 hover:underline">+ {t('dashboard.addAccountLink')}</Link>
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
                  <h2 className="text-sm font-semibold text-gray-500 dark:text-disc-muted uppercase">{label}</h2>
                  <span className={`text-sm font-mono font-semibold tabular-nums ${total >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                    {total < 0 ? '-' : ''}{fmt(total)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {group.map(acc => <AccountCard key={acc.id} account={{ ...acc, balance: acc.balance }} canEdit={canEditAccount(acc, userId, access)} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8 flex gap-4 text-sm">
        <Link href="/finance/transactions" className="text-indigo-600 hover:underline">{t('dashboard.allTransactionsLink')}</Link>
        <Link href="/finance/categories" className="text-indigo-600 hover:underline">{t('categories.title')}</Link>
      </div>
    </div>
  )
}

