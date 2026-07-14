import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/auth.js'
import { redirect, notFound } from 'next/navigation'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getDocProjectByEventId, getActEventById } from '@/db/docs/projects.js'
import { getEntriesByProject, autoAssignPayers } from '@/db/docs/entries.js'
import DocProjectView from '@/components/docs/DocProjectView'

// [id] ใน URL = act_event_cache.id ไม่ใช่ docs_projects.id
// docs_projects ถูก lookup ด้วย act_event_cache_id → getDocProjectByEventId

export async function generateMetadata({ params }) {
  const { id: eventCacheId } = await params
  const t = await getTranslations('docs')
  const session = await getSession()
  if (!session) return { title: t('detail.defaultTitle') }
  const guildId = await getGuildId(session)
  const meta = await getActEventById(eventCacheId, guildId).catch(() => null)
  return { title: meta?.name ?? t('detail.defaultTitle') }
}

export default async function DocProjectPage({ params }) {
  const { id: eventCacheId } = await params
  const session = await getSession()
  if (!session) redirect('/')

  const { access, discordId } = await getEffectiveIdentity(session)
  const canManage = canManageDocs(access)
  if (!canManage) redirect('/')

  const guildId = await getGuildId(session)
  const project = await getDocProjectByEventId(eventCacheId, guildId)

  // auto-เลือกผู้จ่ายให้ entry ที่ยังไม่มี (idempotent — no-op ถ้าทุก entry มี payer แล้ว)
  if (project) {
    await autoAssignPayers(project.id, guildId, project.province ?? null)
  }

  const entries = project ? await getEntriesByProject(project.id) : []

  // เมื่อยังไม่มี project — ดึง event times จาก act_event_cache เพื่อให้ auto-calc ทำงานได้
  const eventMeta = project
    ? { name: project.event_name, province: project.province, event_date: project.event_date, event_end_date: project.event_end_date, participant_count: project.participant_count, act_event_id: project.act_event_id }
    : await getActEventById(eventCacheId, guildId)

  if (!eventMeta) notFound()  // event ไม่มีอยู่จริงใน act_event_cache

  return (
    <DocProjectView
      project={project}
      initialEntries={entries}
      canManage={canManage}
      currentDiscordId={discordId}
      eventId={eventCacheId}
      eventName={eventMeta?.name ?? null}
      eventDate={eventMeta?.event_date ?? null}
      eventEndDate={eventMeta?.event_end_date ?? null}
      participantCount={eventMeta?.participant_count ?? null}
      actEventId={eventMeta?.act_event_id ?? null}
      eventProvince={eventMeta?.province ?? null}
    />
  )
}
