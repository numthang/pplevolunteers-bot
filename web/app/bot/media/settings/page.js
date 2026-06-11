'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Quote, Droplets } from 'lucide-react'
import QuotePanel from '@/components/config/QuotePanel.jsx'
import WatermarkPanel from '@/components/config/WatermarkPanel.jsx'

// รวม config ที่เกี่ยวกับ "สื่อ" หน้าเดียว — Quote (ค่าเริ่มต้น) + ลายน้ำ
const TABS = [
  { key: 'quote',     label: 'Quote', icon: Quote },
  { key: 'watermark', label: 'ลายน้ำ', icon: Droplets },
]

export default function MediaConfigPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const [tab, setTab] = useState('quote')

  // รองรับลิงก์ตรง ?tab=watermark
  useEffect(() => {
    const t = params.get('tab')
    if (t && TABS.some(x => x.key === t)) setTab(t)
  }, [params])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  if (status !== 'authenticated') {
    return <p className="text-warm-500 dark:text-disc-muted text-sm">กำลังโหลด...</p>
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-disc-text mb-4">สื่อ</h1>

      <div className="flex gap-2 mb-5 border-b border-warm-200 dark:border-disc-border">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 -mb-px border-b-2 text-base transition ${
                tab === t.key
                  ? 'border-orange text-orange font-medium'
                  : 'border-transparent text-warm-600 dark:text-disc-muted hover:text-warm-900 dark:hover:text-disc-text'
              }`}>
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'quote' ? <QuotePanel /> : <WatermarkPanel />}
    </div>
  )
}
