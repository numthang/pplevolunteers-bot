import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { createEntries, setTokenExpiry, getEntriesByProject } from '@/db/docs/entries.js'
import { getDocProjectByEventId, upsertDocProject } from '@/db/docs/projects.js'
import { getAllowedItems } from '@/config/fund69-rules.js'

/** GET /api/docs/entries?projectId=X (docs_projects.id) */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const projectId = parseInt(searchParams.get('projectId'))
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const rows = await getEntriesByProject(projectId)
  return Response.json({ success: true, data: rows })
}

/**
 * POST /api/docs/entries
 * Body: { actEventCacheId, isMobile?, projectName?, entries: [{memberDiscordId, itemType, description, amount}], tokenExpiresAt? }
 * Auto-upserts the docs_project if not yet created.
 */
export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { actEventCacheId, isMobile, projectName, participantCount, entries, tokenExpiresAt } = body

    if (!actEventCacheId || !Array.isArray(entries) || entries.length === 0) {
      return Response.json({ error: 'actEventCacheId and entries[] required' }, { status: 400 })
    }

    for (const e of entries) {
      if (!e.memberDiscordId || !e.itemType || e.amount == null) {
        return Response.json({ error: 'Each entry needs memberDiscordId, itemType, amount' }, { status: 400 })
      }
    }

    const guildId = await getGuildId(session)

    const projectId = await upsertDocProject({
      guildId,
      actEventCacheId,
      isMobile:         isMobile ?? false,
      participantCount: participantCount ?? null,
      allowedItems:     getAllowedItems(isMobile ?? false),
      projectName:      projectName ?? null,
      createdBy:        session.user.discordId,
    })

    const project = await getDocProjectByEventId(actEventCacheId, guildId)
    const allowed = project?.allowed_items || []
    for (const e of entries) {
      if (allowed.length > 0 && !allowed.includes(e.itemType)) {
        return Response.json({ error: `Item type "${e.itemType}" not allowed for this project` }, { status: 400 })
      }
    }

    await createEntries(entries.map(e => ({ ...e, projectId })))
    if (tokenExpiresAt) await setTokenExpiry(projectId, tokenExpiresAt)

    const rows = await getEntriesByProject(projectId)
    return Response.json({ success: true, data: rows }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/docs/entries]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
