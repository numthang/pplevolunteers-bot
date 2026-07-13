'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

// Nominatim → province name ไทย (address.state)
// ถ้า state ไม่ตรงกับชื่อจังหวัด Nominatim มักคืนรูปแบบ "จังหวัดราชบุรี" — ตัด "จังหวัด" ออก
function extractProvince(address) {
  const raw = address?.state || address?.county || ''
  return raw.replace(/^จังหวัด/, '').trim()
}

export default function LocationButton() {
  const t = useTranslations('case')
  const router = useRouter()
  const [status, setStatus] = useState('idle') // idle | locating | error

  async function handleClick() {
    if (!navigator.geolocation) {
      setStatus('error')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lon } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=th`,
            { headers: { 'User-Agent': 'pple-volunteers/1.0' } },
          )
          const data = await res.json()
          const province = extractProvince(data.address)
          if (province) {
            router.push(`/case/new/${encodeURIComponent(province)}`)
          } else {
            setStatus('error')
          }
        } catch {
          setStatus('error')
        }
      },
      () => setStatus('error'),
      { timeout: 10000 },
    )
  }

  if (status === 'error') {
    return (
      <p className="text-sm text-red-500 dark:text-red-400 text-center">
        {t('location.errorMessage')}{' '}
        <button onClick={() => setStatus('idle')} className="underline">{t('location.retry')}</button>
        {' '}{t('location.or')}{' '}
        <a href="/case/new" className="underline">{t('location.chooseManually')}</a>
      </p>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'locating'}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-200 dark:border-disc-border text-base text-gray-600 dark:text-disc-muted hover:bg-gray-50 dark:hover:bg-disc-hover disabled:opacity-60 transition"
    >
      {status === 'locating' ? (
        <>
          <span className="animate-spin text-lg">⊙</span>
          {t('location.locating')}
        </>
      ) : (
        <>
          <span>📍</span>
          {t('location.useMyLocation')}
        </>
      )}
    </button>
  )
}
