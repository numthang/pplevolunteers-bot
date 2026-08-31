'use client'

import { useRouter } from 'next/navigation'

const selectCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange'

export default function CaseFilterSelect({ options }) {
  const router = useRouter()
  const current = options.find(o => o.on)?.href || options[0].href

  return (
    <select
      value={current}
      onChange={e => router.push(e.target.value)}
      className={selectCls}
    >
      {options.map(({ href, label }) => (
        <option key={href} value={href}>{label}</option>
      ))}
    </select>
  )
}
