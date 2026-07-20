import { getServerSession } from 'next-auth'
import pool from '@/db/index.js'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { createEntries, setTokenExpiry, getEntriesByProject, autoAssignPayers, setProjectPayer, deleteAllEntriesByProject } from '@/db/docs/entries.js'
import { getDocProjectByEventId, upsertDocProject } from '@/db/docs/projects.js'
import { getAllowedItems } from '@/config/fund69-rules.js'

/** GET /api/docs/entries?projectId=X (docs_projects.id) */
export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveOrgIdentity(session)
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
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json()
    const { actEventCacheId, isMobile, projectName, participantCount, entries, tokenExpiresAt, payerDiscordId } = body

    if (!actEventCacheId || !Array.isArray(entries) || entries.length === 0) {
      return Response.json({ error: 'actEventCacheId and entries[] required' }, { status: 400 })
    }

    for (const e of entries) {
      // memberDiscordId เป็น null ได้ — กำหนดผู้รับทีหลังใน DocEntryList (column nullable)
      if (!e.itemType || e.amount == null) {
        return Response.json({ error: 'Each entry needs itemType, amount' }, { status: 400 })
      }
    }

    const orgId = await getOrgId(session)

    const projectId = await upsertDocProject({
      orgId,
      actEventCacheId,
      isMobile:         isMobile ?? false,
      participantCount: participantCount ?? null,
      allowedItems:     getAllowedItems(isMobile ?? false),
      projectName:      projectName ?? null,
      createdBy:        session.user.userId,
    })

    const project = await getDocProjectByEventId(actEventCacheId, orgId)
    const allowed = project?.allowed_items || []
    for (const e of entries) {
      if (allowed.length > 0 && !allowed.includes(e.itemType)) {
        return Response.json({ error: `Item type "${e.itemType}" not allowed for this project` }, { status: 400 })
      }
    }

    // frontend ยังส่ง memberDiscordId (Discord snowflake) — resolve เป็น users.id ก่อนเขียน DB
    // (docs_activity_entries.member_user_id เป็น FK users.id แล้ว)
    const discordIds = [...new Set(entries.map(e => e.memberDiscordId).filter(Boolean))]
    let userIdByDiscord = {}
    if (discordIds.length) {
      const { rows: userRows } = await pool.query(`SELECT id, discord_id FROM users WHERE discord_id = ANY($1)`, [discordIds])
      userIdByDiscord = Object.fromEntries(userRows.map(r => [r.discord_id, r.id]))
    }
    await createEntries(entries.map(e => ({
      ...e,
      projectId,
      memberUserId: e.memberDiscordId ? (userIdByDiscord[e.memberDiscordId] ?? null) : null,
    })))
    if (tokenExpiresAt) await setTokenExpiry(projectId, tokenExpiresAt)

    // payer: ถ้าผู้ใช้เลือกจาก dropdown บนสุด → set ทั้งโครงการ (project default + apply ทุก entry + auto-swap)
    //         ถ้าไม่ได้เลือก → auto-assign default (project default หรือ pool[0])
    if (payerDiscordId) {
      const { rows: payerRows } = await pool.query(`SELECT id FROM users WHERE discord_id = $1`, [payerDiscordId])
      const payerUserId = payerRows[0]?.id
      if (payerUserId) await setProjectPayer(projectId, payerUserId, orgId, project?.province ?? null)
    } else {
      await autoAssignPayers(projectId, orgId, project?.province ?? null)
    }

    const rows = await getEntriesByProject(projectId)
    return Response.json({ success: true, data: rows }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/docs/entries]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

/** DELETE /api/docs/entries?projectId=X — ลบทุกรายการของโครงการ */
export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const projectId = parseInt(searchParams.get('projectId'))
  if (!projectId) return Response.json({ error: 'projectId required' }, { status: 400 })

  const deleted = await deleteAllEntriesByProject(projectId)
  return Response.json({ success: true, deleted })
}
