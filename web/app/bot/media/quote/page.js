'use client'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import QuotePanel from '@/components/config/QuotePanel.jsx'

export default function QuotePage() {
  const { status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status !== 'authenticated') {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text">Quote</h1>
        <p className="text-sm text-gray-500 dark:text-disc-muted mt-1">ตั้งค่า template สำหรับโพสต์ quote</p>
      </div>
      <QuotePanel />
    </div>
  )
}
