import Link from 'next/link'
import { countByStatus } from '@/db/cases.js'
import { statusLabel } from '@/lib/caseOptions.js'
import CaseRefLookup from '@/components/case/CaseRefLookup.jsx'

export const metadata = { title: 'ศูนย์รับเรื่องร้องเรียน' }

export default async function CasePublicHome() {
  let counts = {}
  try {
    counts = await countByStatus(process.env.GUILD_ID) // public — guild หลัก, ทุกจังหวัด
  } catch { counts = {} }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const cards = [
    { key: 'total', label: 'รับเรื่องทั้งหมด', value: total },
    { key: 'in_progress', label: statusLabel('in_progress'), value: counts.in_progress || 0 },
    { key: 'resolved', label: statusLabel('resolved'), value: (counts.resolved || 0) + (counts.closed || 0) },
  ]

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-disc-text mb-2">ศูนย์รับเรื่องร้องเรียน</h1>
        <p className="text-base text-gray-500 dark:text-disc-muted">
          แจ้งปัญหาในพื้นที่ ถนน ไฟฟ้า น้ำประปา หรือเรื่องที่ไม่ได้รับความเป็นธรรม
        </p>
      </div>

      {/* stat headline */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {cards.map(c => (
          <div key={c.key} className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-orange">{c.value}</p>
            <p className="text-sm text-gray-500 dark:text-disc-muted mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* แจ้งเรื่องใหม่ */}
      <Link href="/case/new"
        className="block w-full bg-indigo-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-indigo-700 transition text-center mb-8">
        + แจ้งเรื่องร้องเรียนใหม่
      </Link>

      {/* ติดตาม ref */}
      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-700 dark:text-disc-text mb-3">ติดตามเรื่องที่แจ้งไว้</h2>
        <CaseRefLookup />
        <p className="mt-2 text-sm text-gray-400 dark:text-disc-muted">ใช้รหัสอ้างอิงที่ได้รับทาง SMS ตอนแจ้งเรื่อง</p>
      </div>
    </div>
  )
}
