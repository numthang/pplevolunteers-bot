import OrgSettingsNav from '@/components/org/OrgSettingsNav.jsx'

export const metadata = { title: 'ตั้งค่าองค์กร' }

// mobile = nav แนวตั้ง stack บนเนื้อหา · desktop (md+) = sidebar ซ้าย + เนื้อหาขวา
export default function OrgSettingsLayout({ children }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text mb-4">ตั้งค่าองค์กร</h1>
      <div className="md:grid md:grid-cols-[200px_minmax(0,1fr)] md:gap-8">
        <aside className="mb-4 md:mb-0">
          <OrgSettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
