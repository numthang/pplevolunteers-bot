import { requireOrgUser } from '@/lib/orgAuth.js'

export const metadata = { title: 'พื้นที่ส่วนตัว' }

// พื้นที่ส่วนตัว (ผูกกับ identity ไม่ใช่ org) — hub ของแอพส่วนตัว
// step ถัดไป: ต่อ cooking เข้า identity email (ตอนนี้ /cooking ยังใช้ Discord/anon)
export default async function PersonalPage() {
  await requireOrgUser()
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text">พื้นที่ส่วนตัว</h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">แอพส่วนตัวของคุณ — ผูกกับบัญชี ไม่ใช่องค์กร</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <a href="/cooking" className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-5 hover:border-orange/40">
          <div className="text-2xl">🍳</div>
          <h2 className="mt-2 font-semibold text-gray-900 dark:text-disc-text">Cooking</h2>
          <p className="text-sm text-gray-500 dark:text-disc-muted">ผู้ช่วยครัว — สุ่มเมนูจากของในครัว</p>
        </a>
      </div>
    </div>
  )
}
