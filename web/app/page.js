import Image from 'next/image'
import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import LoginButton from '@/components/LoginButton.jsx'

export default async function HomePage() {
  const session = await getSession()
  if (session) redirect('/dashboard')

  return (
    <div className="space-y-3">

      {/* Hero */}
      <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border px-6 py-10 text-center rounded-xl">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="PPLE" width={300} height={300} className="drop-shadow-lg" />
        </div>
        <h1 className="text-4xl font-bold mb-3 tracking-tight text-warm-900 dark:text-disc-text">PPLE Volunteers</h1>
        <p className="text-warm-500 dark:text-disc-muted text-lg mb-2">IT Sandbox ของอาสาสมัครพรรคประชาชน</p>
        <p className="text-warm-400 dark:text-disc-muted text-sm mb-10 max-w-md mx-auto">
          ระบบบริหารงานอาสาสมัคร การเงิน และแคมเปญโทรหาสมาชิก
        </p>
        <LoginButton />
      </div>

      {/* Feature cards */}
      <div className="bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-warm-900 dark:bg-disc-hover flex items-center justify-center mb-4 shrink-0">
              <svg viewBox="0 0 24 24" fill="var(--brand-blue-light)" className="w-5 h-5">
                <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/>
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2 text-warm-900 dark:text-disc-text">Discord Bot</h3>
            <p className="text-warm-500 dark:text-disc-muted text-sm leading-relaxed flex-1">
              Bot สำหรับ Discord server — QR login สมาชิก บทบาท และคำสั่ง slash
            </p>
          </div>

          <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-warm-900 dark:bg-disc-hover flex items-center justify-center mb-4 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue-light)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2 text-warm-900 dark:text-disc-text">อาสาประชาชน</h3>
            <p className="text-warm-500 dark:text-disc-muted text-sm leading-relaxed flex-1">
              เครือข่ายอาสาสมัครทั่วประเทศ ติดตามกิจกรรม และประสานงานภาคสนาม
            </p>
          </div>

          <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-warm-900 dark:bg-disc-hover flex items-center justify-center mb-4 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue-light)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2 text-warm-900 dark:text-disc-text">PPLE Finance</h3>
            <p className="text-warm-500 dark:text-disc-muted text-sm leading-relaxed flex-1">
              จัดการรายรับ-รายจ่าย บัญชีธนาคาร และรายงานการเงิน
            </p>
          </div>

          <div className="flex flex-col bg-card-bg border border-brand-blue-light dark:border-disc-border rounded-lg p-6 hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-warm-900 dark:bg-disc-hover flex items-center justify-center mb-4 shrink-0">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand-blue-light)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <path d="M20.25 3.75v4.5m0-4.5h-4.5m4.5 0l-6 6m3 12c-8.284 0-15-6.716-15-15V4.5A2.25 2.25 0 014.5 2.25h1.372c.516 0 .966.351 1.091.852l1.106 4.423c.11.44-.054.902-.417 1.173l-1.293.97a1.062 1.062 0 00-.38 1.21 12.035 12.035 0 007.143 7.143c.441.162.928-.004 1.21-.38l.97-1.293a1.125 1.125 0 011.173-.417l4.423 1.106c.5.125.852.575.852 1.091V19.5a2.25 2.25 0 01-2.25 2.25h-2.25z" />
              </svg>
            </div>
            <h3 className="font-bold text-base mb-2 text-warm-900 dark:text-disc-text">PPLE Calling</h3>
            <p className="text-warm-500 dark:text-disc-muted text-sm leading-relaxed flex-1">
              แคมเปญโทรหาสมาชิก ติดตามผล และบริหารอาสาสมัคร
            </p>
          </div>

        </div>
      </div>

    </div>
  )
}
