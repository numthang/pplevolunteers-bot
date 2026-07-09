// i18n/request.js — next-intl config (ไม่ใช้ locale routing)
// locale มาจาก cookie `locale` (user override) → default 'th'
// อนาคต: fallback เป็น locale ของ guild (dc_guild_config key `locale`) ก่อนถึง default
import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'

export const SUPPORTED_LOCALES = ['th', 'en']
export const DEFAULT_LOCALE = 'th'

export default getRequestConfig(async () => {
  const store = await cookies()
  const requested = store.get('locale')?.value
  const locale = SUPPORTED_LOCALES.includes(requested) ? requested : DEFAULT_LOCALE

  return {
    locale,
    messages: (await import(`../locales/${locale}.json`)).default,
  }
})
