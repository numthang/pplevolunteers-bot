import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function CallingDashboard() {
  const session = await getSession()
  if (!session) redirect('/')

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-2">Calling</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">
          ระบบโทรหาสมาชิก
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/calling/campaigns"
          className="block bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
        >
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-2">Campaigns</h2>
          <p className="text-base text-warm-500 dark:text-disc-muted">
            จัดการแคมเปญ มอบหมายงานให้ผู้โทร
          </p>
        </Link>

        <Link
          href="/calling/assignee"
          className="block bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
        >
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-2">Assignee</h2>
          <p className="text-base text-warm-500 dark:text-disc-muted">
            งานที่ได้รับมอบหมาย รายชื่อที่ต้องโทร
          </p>
        </Link>

        <Link
          href="/calling/stats"
          className="block bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
        >
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-2">Statistics</h2>
          <p className="text-base text-warm-500 dark:text-disc-muted">
            สถิติการโทร อัตราติด tier coverage
          </p>
        </Link>

        <Link
          href="/calling/contacts"
          className="block bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-6 hover:bg-warm-50 dark:hover:bg-disc-hover transition"
        >
          <h2 className="text-lg font-semibold text-warm-900 dark:text-disc-text mb-2">Contacts</h2>
          <p className="text-base text-warm-500 dark:text-disc-muted">
            จัดการผู้ติดต่อนอกฐานสมาชิก
          </p>
        </Link>
      </div>
    </div>
  )
}
