import OrgSettingsNav from '@/components/org/OrgSettingsNav.jsx'

export const metadata = { title: 'ตั้งค่าองค์กร' }

export default function OrgSettingsLayout({ children }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-disc-text mb-4">ตั้งค่าองค์กร</h1>
      <OrgSettingsNav />
      {children}
    </div>
  )
}
