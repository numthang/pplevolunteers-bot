import { getSession } from '@/lib/auth.js'
import { redirect, notFound } from 'next/navigation'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getDocProjectByEventId, getActEventById } from '@/db/docs/projects.js'
import { getEntriesByProject, autoAssignPayers } from '@/db/docs/entries.js'
import DocProjectView from '@/components/docs/DocProjectView'

export async function generateMetadata({ params }) {
  const { id } = await params
  const session = await getSession()
  if (!session) return { title: 'โครงการ' }
  const guildId = await getGuildId(session)
  const meta = await getActEventById(id, guildId).catch(() => null)
  return { title: meta?.name ?? 'โครงการ' }
}

export default async function DocProjectPage({ params }) {
  const { id } = await params
  const session = await getSession()
  if (!session) redirect('/')

  const { access, discordId } = await getEffectiveIdentity(session)
  const canManage = canManageDocs(access)
  if (!canManage) redirect('/')

  const guildId = await getGuildId(session)
  const project = await getDocProjectByEventId(id, guildId)

  // auto-เลือกผู้จ่ายให้ entry ที่ยังไม่มี (idempotent — no-op ถ้าทุก entry มี payer แล้ว)
  if (project) {
    await autoAssignPayers(project.id, guildId, project.province ?? null)
  }

  const entries = project ? await getEntriesByProject(project.id) : []

  // เมื่อยังไม่มี project — ดึง event times จาก act_event_cache เพื่อให้ auto-calc ทำงานได้
  const eventMeta = project
    ? { name: project.event_name, province: project.province, event_date: project.event_date, event_end_date: project.event_end_date, participant_count: project.participant_count }
    : await getActEventById(id, guildId)

  if (!eventMeta) notFound()  // event ไม่มีอยู่จริงใน act_event_cache

  return (
    <DocProjectView
      project={project}
      initialEntries={entries}
      canManage={canManage}
      currentDiscordId={discordId}
      eventId={id}
      eventName={eventMeta?.name ?? null}
      eventDate={eventMeta?.event_date ?? null}
      eventEndDate={eventMeta?.event_end_date ?? null}
      participantCount={eventMeta?.participant_count ?? null}
    />
  )
}
