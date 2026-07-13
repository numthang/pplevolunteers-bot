'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

const inputCls = 'w-full border border-gray-300 dark:border-disc-border bg-white dark:bg-disc-hover text-gray-900 dark:text-disc-text p-3 text-base rounded-lg placeholder-gray-400 dark:placeholder-disc-muted focus:outline-none focus:ring-2 focus:ring-indigo-500'

export default function CaseRefLookup() {
  const t = useTranslations('case')
  const router = useRouter()
  const [ref, setRef] = useState('')

  function go(e) {
    e.preventDefault()
    const v = ref.trim().toUpperCase()
    if (v) router.push(`/case/${encodeURIComponent(v)}`)
  }

  return (
    <form onSubmit={go} className="flex gap-2">
      <input value={ref} onChange={e => setRef(e.target.value)}
        placeholder={t('lookup.placeholder')} className={inputCls} />
      <button type="submit"
        className="shrink-0 px-5 bg-brand-orange text-white rounded-lg text-base font-semibold hover:bg-brand-orange-light transition">
        {t('lookup.trackButton')}
      </button>
    </form>
  )
}
