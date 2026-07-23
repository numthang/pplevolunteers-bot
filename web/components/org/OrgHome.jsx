// dashboard body ของ /org (render ใน OrgShell — switcher/ออกจากระบบ อยู่ที่ shell แล้ว)
import { getTranslations } from 'next-intl/server'
import CreateOrgButton from './CreateOrgButton.jsx'

export default async function OrgHome({ orgs, activeOrg }) {
  const t = await getTranslations('org')
  const invited = orgs.filter(o => o.status === 'invited')

  // ยังไม่มีองค์กร active → onboarding (soft CTA เด่น)
  if (!activeOrg) {
    return (
      <div className="mx-auto max-w-md text-center">
        <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-8">
          <div className="text-3xl">🏢</div>
          <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-disc-text">{t('home.noOrgTitle')}</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">{t('home.noOrgDesc')}</p>
          <CreateOrgButton className="mt-4 inline-block rounded-lg bg-orange px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            {t('home.createOrgButton')}
          </CreateOrgButton>
        </div>
        {invited.length > 0 && <InvitedNote invited={invited} title={t('home.invitedTitle')} suffix={t('home.invitedAutoConfirmSuffix')} />}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6">
        <p className="text-xs uppercase tracking-wide text-gray-400 dark:text-disc-muted">{t('home.activeOrgLabel')}</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900 dark:text-disc-text">{activeOrg.name}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-disc-muted">{t('home.yourRole', { role: activeOrg.role })}</p>
        <a href="/org/settings" className="mt-4 inline-block text-sm text-orange hover:underline">{t('home.manageOrgLink')}</a>
      </div>

      <OnboardingCard t={t} />
      {invited.length > 0 && <InvitedNote invited={invited} title={t('home.invitedTitle')} suffix={t('home.invitedAutoConfirmSuffix')} />}
    </div>
  )
}

// เริ่มต้นใช้งาน — next-step หลังสร้าง org (org ใหม่ยังว่าง จนกว่าจะเชิญคน/เชื่อม Discord)
function OnboardingCard({ t }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-6">
      <p className="text-sm font-semibold text-gray-900 dark:text-disc-text">{t('home.onboardingTitle')}</p>
      <div className="mt-3 space-y-2">
        <Step href="/org/settings" icon="👥" title={t('home.inviteMembersTitle')} desc={t('home.inviteMembersDesc')} />
        <Step icon="🔗" title={t('home.connectDiscordTitle')} desc={t('home.connectDiscordDesc')} soon soonLabel={t('home.soonBadge')} />
      </div>
    </div>
  )
}

function Step({ href, icon, title, desc, soon, soonLabel }) {
  const inner = (
    <div className={`flex items-center gap-3 rounded-lg border border-gray-100 dark:border-disc-border px-3 py-2.5 ${soon ? 'opacity-60' : 'hover:bg-gray-50 dark:hover:bg-white/5'}`}>
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange/10 text-base">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-800 dark:text-disc-text">{title}</p>
        <p className="text-xs text-gray-400 dark:text-disc-muted">{desc}</p>
      </div>
      {soon
        ? <span className="rounded bg-gray-100 dark:bg-white/10 px-2 py-0.5 text-[10px] text-gray-500 dark:text-disc-muted">{soonLabel}</span>
        : <span className="text-gray-300 dark:text-disc-muted">→</span>}
    </div>
  )
  return soon ? inner : <a href={href} className="block">{inner}</a>
}

function InvitedNote({ invited, title, suffix }) {
  return (
    <div className="rounded-2xl border border-gray-200 dark:border-disc-border bg-white dark:bg-card-bg p-4 text-left">
      <p className="text-sm font-medium text-gray-700 dark:text-disc-text">{title}</p>
      <p className="mt-1 text-xs text-gray-400 dark:text-disc-muted">
        {invited.map(o => o.name).join(', ')}{suffix}
      </p>
    </div>
  )
}
