'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'

const LOCALES = [
  { code: 'th', label: 'ไทย' },
  { code: 'en', label: 'EN' },
]

// สลับภาษาเว็บ — เขียน cookie `locale` แล้ว router.refresh() ให้ server อ่าน locale ใหม่
// (i18n/request.js อ่าน cookie ตอน render, default th)
export default function LocaleSwitcher({ onSwitch }) {
  const locale = useLocale()
  const t = useTranslations('common')
  const router = useRouter()

  const change = (code) => {
    if (code !== locale) {
      document.cookie = `locale=${code}; path=/; max-age=31536000`
      router.refresh()
    }
    onSwitch?.()
  }

  return (
    <div className="w-full flex items-center justify-between px-4 py-2.5 text-base text-warm-900 dark:text-disc-muted">
      <span className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
             strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 shrink-0">
          <circle cx="12" cy="12" r="9" />
          <path d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
        </svg>
        {t('language')}
      </span>
      <span className="flex rounded-md overflow-hidden border border-warm-200 dark:border-disc-border shrink-0">
        {LOCALES.map(l => (
          <button
            key={l.code}
            onClick={() => change(l.code)}
            className={`px-2.5 py-1 text-sm transition ${
              l.code === locale
                ? 'bg-teal text-white font-medium'
                : 'text-warm-500 dark:text-disc-muted hover:bg-warm-100 dark:hover:bg-disc-hover'
            }`}
          >
            {l.label}
          </button>
        ))}
      </span>
    </div>
  )
}
