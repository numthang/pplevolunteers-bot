import { getSession } from '@/lib/auth.js'
import { requireFeature } from '@/lib/featureGate.js'

// โซน kanban แหกกรอบ max-w-5xl ของ app/layout.js เหมือน calling/posts/docs
// (เดิมไม่มีไฟล์นี้ → หน้าการบ้านเลยติดกรอบ 1024px ทั้งที่กระดานต้องการความกว้าง)
//
// ⚠️ ที่นี่ **ไม่ล็อกความกว้าง** ต่างจาก 3 โซนนั้นที่ครอบ max-w-7xl ไว้
//    เพราะกระดาน 6 ช่อง × 288px ≈ 1,800px — ครอบ 7xl (1280px) แล้วต้องปัดแนวนอนทั้งที่จอมีที่ว่าง
//    หน้าที่เป็น list (การบ้านของฉัน) ไปครอบความกว้างอ่านง่ายเองในคอมโพเนนต์
// ไม่ตั้ง metadata template ที่นี่ — ทั้ง 2 หน้าตั้ง title ผ่าน t() ของตัวเองแล้ว
// (ใส่ template จะได้ "การบ้านของฉัน — การบ้าน" ซ้ำซ้อน + เป็นข้อความไทย hardcode ผิดกฎ i18n)

export default async function KanbanLayout({ children }) {
  const session = await getSession()
  await requireFeature(session, 'kanban')

  return (
    <div data-wide className="-mx-1 sm:-mx-4 -mt-3 min-h-screen bg-warm-50 dark:bg-disc-bg2">
      <div className="px-3 sm:px-4 py-4">
        {children}
      </div>
    </div>
  )
}
