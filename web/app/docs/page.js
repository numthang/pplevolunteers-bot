import { getSession } from '@/lib/auth.js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { canManageDocs, getUserScope } from '@/lib/docsAccess.js'
import { getDocEvents } from '@/db/docs/projects.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import DocProjectCard from '@/components/docs/DocProjectCard.jsx'

export default async function DocsPage() {
  const session = await getSession()
  if (!session) redirect('/')

  const { access } = await getEffectiveIdentity(session)
  const scope = getUserScope(access)
  const guildId = await getGuildId(session)
  const projects = await getDocEvents(guildId, scope)

  const cutoffDate = new Date(); cutoffDate.setDate(cutoffDate.getDate() - 7)
  const cutoff = cutoffDate.toISOString().slice(0, 10)
  const active = projects.filter(p => !p.event_date || p.event_date >= cutoff)
  const past   = projects.filter(p => p.event_date && p.event_date < cutoff)

  const groupBy = list => list.reduce((acc, p) => {
    const key = p.province || 'ทั่วไป'
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {})

  const grouped     = groupBy(active)
  const groupedPast = groupBy(past)

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-warm-900 dark:text-disc-text mb-2">เอกสาร</h1>
        <p className="text-base text-warm-500 dark:text-disc-muted">
          ใบสำคัญรับเงินและเอกสารเบิกจ่ายสำหรับกิจกรรม
        </p>
      </div>

      {projects.length === 0 ? (
        <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center text-warm-500 dark:text-disc-muted">
          ไม่มีโครงการเอกสาร
        </div>
      ) : (
        <div className="space-y-8">
          {active.length === 0 && (
            <div className="bg-card-bg border border-warm-200 dark:border-disc-border rounded-xl p-12 text-center text-warm-500 dark:text-disc-muted">
              ไม่มีโครงการที่กำลังดำเนินการ
            </div>
          )}
          {Object.entries(grouped).map(([province, list]) => (
            <section key={province}>
              <h2 className="text-sm font-semibold text-warm-500 dark:text-disc-muted uppercase tracking-widest mb-4">
                {province}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {list.map(project => (
                  <DocProjectCard key={project.act_event_cache_id} project={project} />
                ))}
              </div>
            </section>
          ))}

          {past.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest select-none w-fit">
                <span className="transition-transform group-open:rotate-90">▶</span>
                กิจกรรมที่ผ่านแล้ว ({past.length})
              </summary>
              <div className="mt-4 space-y-8 opacity-60">
                {Object.entries(groupedPast).map(([province, list]) => (
                  <section key={province}>
                    <h2 className="text-xs font-semibold text-warm-400 dark:text-disc-muted uppercase tracking-widest mb-4">
                      {province}
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {list.map(project => (
                        <DocProjectCard key={project.act_event_cache_id} project={project} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
