'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'

export default function DocsProvinceFilter({ provinces, selected }) {
  const t = useTranslations('docs')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function select(province) {
    const p = new URLSearchParams(searchParams)
    if (province) p.set('province', province)
    else p.delete('province')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => select(null)}
        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border
          ${!selected
            ? 'bg-orange text-white border-orange'
            : 'bg-card-bg text-warm-600 dark:text-disc-muted border-warm-200 dark:border-disc-border hover:border-orange hover:text-orange dark:hover:text-orange'
          }`}
      >
        {t('provinceFilter.all')}
      </button>
      {provinces.map(p => (
        <button
          key={p}
          onClick={() => select(p)}
          className={`px-3 py-1 rounded-full text-sm font-medium transition-colors border
            ${selected === p
              ? 'bg-orange text-white border-orange'
              : 'bg-card-bg text-warm-600 dark:text-disc-muted border-warm-200 dark:border-disc-border hover:border-orange hover:text-orange dark:hover:text-orange'
            }`}
        >
          {p}
        </button>
      ))}
    </div>
  )
}
