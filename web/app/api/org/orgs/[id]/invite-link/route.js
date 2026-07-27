import { getOrgSession } from '@/lib/orgAuth.js'
import { getOrgMembership } from '@/db/orgMembers.js'
import { getActiveInviteLink, createInviteLink, revokeInviteLink } from '@/db/orgInviteLinks.js'

// invite link เข้า org แบบ Notion — owner เท่านั้น (เหมือน email invite)
// GET = ลิงก์ active ปัจจุบัน · POST = สร้าง/รีเซ็ต · DELETE = ปิด
async function requireOwner(orgId) {
  const session = await getOrgSession()
  const userId = session?.user?.userId
  if (!userId) return { error: 'unauthorized', status: 401 }
  if (!orgId) return { error: 'org ไม่ถูกต้อง', status: 400 }
  const m = await getOrgMembership(orgId, userId)
  if (!m || m.status !== 'active') return { error: 'forbidden', status: 403 }
  if (m.role !== 'owner') return { error: 'เฉพาะ owner จัดการลิงก์เชิญได้', status: 403 }
  return { userId }
}

export async function GET(_req, { params }) {
  const orgId = Number((await params).id)
  const gate = await requireOwner(orgId)
  if (gate.error) return Response.json({ error: gate.error }, { status: gate.status })
  const link = await getActiveInviteLink(orgId)
  return Response.json({ link })
}

export async function POST(req, { params }) {
  const orgId = Number((await params).id)
  const gate = await requireOwner(orgId)
  if (gate.error) return Response.json({ error: gate.error }, { status: gate.status })

  const body = await req.json().catch(() => ({}))
  const days = Number(body.expiresInDays)
  const expiresAt = Number.isFinite(days) && days > 0 ? new Date(Date.now() + days * 86400000) : null
  const maxUses = Number.isInteger(body.maxUses) && body.maxUses > 0 ? body.maxUses : null

  const link = await createInviteLink(orgId, gate.userId, { expiresAt, maxUses })
  return Response.json({ link })
}

export async function DELETE(_req, { params }) {
  const orgId = Number((await params).id)
  const gate = await requireOwner(orgId)
  if (gate.error) return Response.json({ error: gate.error }, { status: gate.status })
  await revokeInviteLink(orgId)
  return Response.json({ ok: true })
}
