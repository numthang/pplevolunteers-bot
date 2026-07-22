import { getOrgSession } from '@/lib/orgAuth.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { clearScopeTreeCache } from '@/lib/resolveAccessV2.js'
import { clearAccessCache } from '@/lib/resolveAccess.js'
import { logAction } from '@/db/auditLog.js'
import {
  listScopeNodes, createScopeNode, updateScopeNode, deleteScopeNode,
} from '@/db/orgScopeNodes.js'

/**
 * ผังพื้นที่ของ org (org_scope_nodes) — org-native ใช้ได้กับ org ที่ไม่มี Discord
 *  GATE = admin ใน org (owner ได้ 'admin' อัตโนมัติจาก getEffectiveOrgIdentity)
 *
 *  GET                                   → { nodes }
 *  POST   {key,label,parentId,sortOrder} → สร้าง
 *  PATCH  {id,label?,parentId?,sortOrder?} → แก้ (key แก้ไม่ได้)
 *  DELETE {id}                           → ลบ (บล็อกถ้ามีลูกหรือมียศผูก)
 *
 * ⚠️ ทุก mutation ต้องล้าง cache ทั้งสองตัว — loadOrgTree cache ต้นไม้ 5 นาที
 *    และ resolveAccess (V1) cache สิทธิ์ต่อ guild · ไม่ล้าง = แก้ผังแล้วสิทธิ์ยังเป็นของเก่า
 */

async function gate() {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  const orgId = await getOrgId(session)
  if (!orgId) return { error: 'ไม่มี org ที่เลือกอยู่', status: 400 }
  const { access } = await getEffectiveOrgIdentity(session)
  if (!access.permissions.has('admin')) return { error: 'forbidden', status: 403 }
  return { orgId, userId }
}

function invalidate(orgId) {
  clearScopeTreeCache(orgId)
  clearAccessCache()
}

export async function GET() {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })
  return Response.json({ nodes: await listScopeNodes(g.orgId) })
}

export async function POST(req) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const r = await createScopeNode(g.orgId, {
    key: body.key,
    label: body.label,
    parentId: body.parentId ?? null,
    sortOrder: body.sortOrder ?? 100,
  })
  if (r.error) return Response.json({ error: r.error }, { status: 400 })

  invalidate(g.orgId)
  logAction({ orgId: g.orgId, app: 'org', action: 'scope_node.create', actorId: g.userId, targetId: r.node.id, meta: r.node })
  return Response.json({ node: r.node })
}

export async function PATCH(req) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return Response.json({ error: 'ต้องระบุ id' }, { status: 400 })

  const patch = {}
  if (body.label !== undefined)     patch.label = body.label
  if (body.parentId !== undefined)  patch.parentId = body.parentId === null ? null : Number(body.parentId)
  if (body.sortOrder !== undefined) patch.sortOrder = body.sortOrder

  const r = await updateScopeNode(g.orgId, id, patch)
  if (r.error) return Response.json({ error: r.error }, { status: 400 })

  invalidate(g.orgId)
  logAction({ orgId: g.orgId, app: 'org', action: 'scope_node.update', actorId: g.userId, targetId: id, meta: r.node })
  return Response.json({ node: r.node })
}

export async function DELETE(req) {
  const g = await gate()
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const body = await req.json().catch(() => ({}))
  const id = Number(body.id)
  if (!id) return Response.json({ error: 'ต้องระบุ id' }, { status: 400 })

  const r = await deleteScopeNode(g.orgId, id)
  if (r.error) return Response.json({ error: r.error }, { status: 400 })

  invalidate(g.orgId)
  logAction({ orgId: g.orgId, app: 'org', action: 'scope_node.delete', actorId: g.userId, targetId: id })
  return Response.json({ ok: true })
}
