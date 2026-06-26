import Link from 'next/link'
import { getCaseByRefPublic } from '@/db/cases.js'
import { statusLabel } from '@/lib/caseOptions.js'

export const metadata = { title: 'ติดตามเรื่องร้องเรียน' }

// ลำดับ + สีของแต่ละสถานะ (public)
const STATUS_STYLE = {
  open:        'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  resolved:    'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  closed:      'bg-gray-200 text-gray-600 dark:bg-disc-hover dark:text-disc-muted',
  rejected:    'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

function fmtDate(d) {
  return new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })
}

export default async function CaseTrackPage({ params }) {
  const { ref } = await params
  const c = await getCaseByRefPublic(ref)

  if (!c) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <div className="text-5xl mb-3">🔍</div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text mb-2">ไม่พบเรื่องร้องเรียนนี้</h1>
        <p className="text-base text-gray-500 dark:text-disc-muted mb-6">กรุณาตรวจสอบรหัสอ้างอิงอีกครั้ง</p>
        <Link href="/case" className="text-orange hover:underline text-base">← กลับหน้าหลัก</Link>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto">
      <Link href="/case" className="text-orange hover:underline mb-6 block text-base">← หน้าหลัก</Link>

      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6 mb-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-sm text-gray-400 dark:text-disc-muted mb-1">รหัสอ้างอิง</p>
            <p className="text-xl font-mono font-bold tracking-wider text-gray-900 dark:text-disc-text">{c.ref}</p>
          </div>
          <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${STATUS_STYLE[c.status] || ''}`}>
            {statusLabel(c.status)}
          </span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-base">
          <dt className="text-gray-400 dark:text-disc-muted">จังหวัด</dt>
          <dd className="text-gray-900 dark:text-disc-text">{c.province}</dd>
          {c.category && (<>
            <dt className="text-gray-400 dark:text-disc-muted">ประเภท</dt>
            <dd className="text-gray-900 dark:text-disc-text">{c.category}</dd>
          </>)}
          <dt className="text-gray-400 dark:text-disc-muted">รับเรื่องเมื่อ</dt>
          <dd className="text-gray-900 dark:text-disc-text">{fmtDate(c.created_at)}</dd>
        </dl>
      </div>

      <div className="bg-card-bg border border-gray-200 dark:border-disc-border rounded-xl p-6">
        <h2 className="text-base font-semibold text-gray-700 dark:text-disc-text mb-4">ความคืบหน้า</h2>
        {c.publicNotes.length === 0 ? (
          <p className="text-base text-gray-400 dark:text-disc-muted">ยังไม่มีอัปเดตจากทีมงาน</p>
        ) : (
          <ol className="space-y-4">
            {c.publicNotes.map((n, i) => (
              <li key={i} className="relative pl-5 border-l-2 border-orange/40">
                <span className="absolute -left-[5px] top-1.5 w-2 h-2 rounded-full bg-orange" />
                <p className="text-sm text-gray-400 dark:text-disc-muted mb-0.5">{fmtDate(n.created_at)}</p>
                <p className="text-base text-gray-900 dark:text-disc-text whitespace-pre-wrap">{n.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
