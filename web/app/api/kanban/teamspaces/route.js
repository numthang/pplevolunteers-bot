// /api/kanban/teamspaces — ชั้น teamspace (2026-09-07)
//
// GET             → { teamspaces: [...ที่ยังไม่เข้ากรุ], scopeNodes: [...], guilds: [...] }
// GET ?archived=1 → { teamspaces: [...เฉพาะที่อยู่ในกรุ] }
// POST { name | scopeNodeId } → สร้าง teamspace ใหม่
//
// ⛔ ไม่มี admin gate ตอนสร้าง — เหตุผลเดียวกับ /api/kanban/boards: เป็นของทุกคนในองค์กร
//    กันขยะด้วย "teamspace สุดท้ายเก็บเข้ากรุไม่ได้" ไม่ใช่ด้วยการห้ามสร้าง
// ⛔ รอบนี้ **ไม่มีด่านการมองเห็น** — canViewTeamspace คืน true เสมอโดยตั้งใจ (user สั่ง)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { canViewTeamspace, canCreateTeamspace } from '@/lib/kanbanAccess.js'
import * as tsDB from '@/db/kanban/teamspaces.js'
import { guildsOfOrg } from '@/db/guilds.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const onlyArchived = new URL(req.url).searchParams.get('archived') === '1'
  const all = await tsDB.listTeamspaces(ctx.orgId, { includeArchived: onlyArchived })
  const wanted = onlyArchived ? all.filter((t) => t.archived_at) : all

  // scopeNodes + guilds ไปกับ GET เดียวกัน — กล่องสร้าง/ตั้งค่า teamspace ต้องใช้ทันทีที่เปิด
  // ไม่ต้องยิงรอบสอง · รายชื่อเซิร์ฟของ org ไม่ใช่ความลับ (guild switcher โชว์อยู่แล้ว)
  const [scopeNodes, guilds] = await Promise.all([
    tsDB.listScopeNodes(ctx.orgId),
    guildsOfOrg(ctx.orgId),
  ])

  return Response.json({
    teamspaces: wanted.filter((t) => canViewTeamspace(t, ctx.access, ctx.userId)),
    scopeNodes,
    guilds,
  })
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error
  if (!canCreateTeamspace(ctx.access, ctx.userId)) return err(403, 'ไม่มีสิทธิ์สร้าง teamspace')

  const body = await req.json().catch(() => ({}))
  const scopeNodeId = Number(body.scopeNodeId) || null

  // เลือกจากหน่วยงานที่มีอยู่ = ได้ชื่อจากหน่วยงานนั้น (แก้ชื่อทับได้) · พิมพ์เอง = scope_node_id เป็น NULL
  let name = String(body.name || '').trim()
  if (!name && scopeNodeId) {
    const nodes = await tsDB.listScopeNodes(ctx.orgId)
    name = nodes.find((n) => n.id === scopeNodeId)?.label || ''
  }
  if (!name) return err(400, 'ต้องตั้งชื่อ teamspace หรือเลือกหน่วยงาน')
  if (name.length > 100) return err(400, 'ชื่อ teamspace ยาวเกิน 100 ตัวอักษร')

  // ยืนยันว่า node อยู่ใน org เดียวกันจริง — เลขจาก body เชื่อไม่ได้
  if (scopeNodeId) {
    const nodes = await tsDB.listScopeNodes(ctx.orgId)
    if (!nodes.some((n) => n.id === scopeNodeId)) return err(400, 'ไม่พบหน่วยงานที่เลือก')
  }

  const guildId = String(body.guildId || '').trim() || null
  const teamspace = await tsDB.createTeamspace(ctx.orgId, { name, scopeNodeId, guildId }, ctx.userId)
  return Response.json({ teamspace }, { status: 201 })
}
