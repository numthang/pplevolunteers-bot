// dashboard body ของ /org (render ใน OrgShell — switcher/ออกจากระบบ อยู่ที่ shell แล้ว)
export default function OrgHome({ orgs, activeOrg }) {
  const invited = orgs.filter(o => o.status === 'invited')

  // ยังไม่มีองค์กร active → onboarding
  if (!activeOrg) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-8">
          <div className="text-3xl">🏢</div>
          <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-disc-text">ยังไม่มีองค์กร</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">สร้างองค์กรแรกของคุณเพื่อเริ่มต้น</p>
          <a href="/org/new" className="mt-4 inline-block rounded-lg bg-orange px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            สร้างองค์กร
          </a>
        </div>
        {invited.length > 0 && <InvitedNote invited={invited} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6">
        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-disc-muted">องค์กรที่กำลังใช้งาน</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-disc-text">{activeOrg.name}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">บทบาทของคุณ: {activeOrg.role}</p>
        <a href="/org/settings" className="mt-4 inline-block text-sm text-orange hover:underline">จัดการองค์กร →</a>
      </div>
      {invited.length > 0 && <InvitedNote invited={invited} />}
    </div>
  )
}

function InvitedNote({ invited }) {
  return (
    <div className="mt-4 rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 text-left">
      <p className="text-sm font-medium text-gray-700 dark:text-disc-text">คำเชิญ</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">
        {invited.map(o => o.name).join(', ')} — ยืนยันอัตโนมัติเมื่อคุณเข้าสู่ระบบด้วยอีเมลที่ถูกเชิญ
      </p>
    </div>
  )
}
