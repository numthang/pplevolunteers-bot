'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import BankBadge from '@/components/BankBadge'

function fmt(n) {
  return Math.abs(n).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00A0฿'
}

export default function AccountCard({ account }) {
  const { balance } = account
  const [copied, setCopied] = useState(false)

  function copyAll(e) {
    e.preventDefault()
    e.stopPropagation()
    const parts = [account.name, account.bank, account.account_no].filter(Boolean)
    navigator.clipboard.writeText(parts.join(' ')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <Link href={`/finance/transactions?accountId=${account.id}`}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 hover:shadow-md transition cursor-pointer flex items-center gap-3">
        <BankBadge bank={account.bank} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 leading-snug">{account.name}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {account.bank || 'เงินสด'}
            {account.account_no && <span className="font-mono ml-1">{account.account_no}</span>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <p className={`font-mono font-bold ${balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
            {balance < 0 ? '-' : ''}{fmt(balance)}
          </p>
          <button
            onClick={copyAll}
            className="flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition"
            title="คัดลอกชื่อ ธนาคาร เลขบัญชี"
          >
            {copied ? <Check size={11} className="text-green-500" /> : <Copy size={11} />}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
        </div>
      </div>
    </Link>
  )
}
