// /api/kanban/teamspaces/[id] — แก้ / เก็บเข้ากรุ / เอาออกจากกรุ (2026-09-07)
//
// PATCH { name?, detail?, scopeNodeId?, guildId?, defaultBoardId?, archived? }
// DELETE → เก็บเข้ากรุ (ไม่ลบจริง — บอร์ด/การ์ดข้างในไม่ถูกแตะ)
//
// ⚠️ org ไม่ตรง = 404 ไม่ใช่ 403 (กติกาเดียวกับทั้งโมดูล — ห้ามยืนยันว่า id นี้มีอยู่)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { canManageTeamspace } from '@/lib/kanbanAccess.js'
import * as tsDB from '@/db/kanban/teamspaces.js'
import * as boardDB from '@/db/kanban/boards.js'

async function load(id) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx
  const teamspace = await tsDB.getTeamspace(ctx.orgId, id)
  if (!teamspace) return { ...ctx, error: err(404, 'ไม่พบ teamspace นี้') }
  if (!canManageTeamspace(teamspace, ctx.access, ctx.userId)) {
    return { ...ctx, error: err(403, 'แก้ได้เฉพาะคนสร้าง teamspace หรือแอดมิน') }
  }
  return { ...ctx, teamspace }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await load(id)
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const patch = {}

  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) return err(400, 'ต้องตั้งชื่อ teamspace')
    if (name.length > 100) return err(400, 'ชื่อ teamspace ยาวเกิน 100 ตัวอักษร')
    patch.name = name
  }
  if (body.detail !== undefined) patch.detail = String(body.detail || '').trim() || null
  if (body.guildId !== undefined) patch.guildId = String(body.guildId || '').trim() || null

  if (body.scopeNodeId !== undefined) {
    const nodeId = Number(body.scopeNodeId) || null
    if (nodeId) {
      const nodes = await tsDB.listScopeNodes(ctx.orgId)
      if (!nodes.some((n) => n.id === nodeId)) return err(400, 'ไม่พบหน่วยงานที่เลือก')
    }
    patch.scopeNodeId = nodeId
  }

  // บอร์ดตั้งต้นต้องเป็นบอร์ดใน teamspace นี้จริง — ไม่งั้นบอทลงการ์ดข้ามทีมเงียบๆ
  if (body.defaultBoardId !== undefined) {
    const boardId = Number(body.defaultBoardId) || null
    if (boardId) {
      const board = await boardDB.getBoard(ctx.orgId, boardId)
      if (!board || Number(board.teamspace_id) !== Number(id)) {
        return err(400, 'บอร์ดตั้งต้นต้องเป็นบอร์ดใน teamspace นี้')
      }
    }
    patch.defaultBoardId = boardId
  }

  if (body.archived === false) {
    const teamspace = await tsDB.unarchiveTeamspace(ctx.orgId, id)
    return Response.json({ teamspace })
  }

  const teamspace = await tsDB.updateTeamspace(ctx.orgId, id, patch)
  return Response.json({ teamspace })
}

export async function DELETE(_req, { params }) {
  const { id } = await params
  const ctx = await load(id)
  if (ctx.error) return ctx.error

  // teamspace สุดท้ายเก็บไม่ได้ — db คืน null แล้ว route แปลงเป็นข้อความ (ห้ามเงียบ)
  const teamspace = await tsDB.archiveTeamspace(ctx.orgId, id)
  if (!teamspace) return err(400, 'เก็บ teamspace สุดท้ายเข้ากรุไม่ได้ — สร้างอันใหม่ก่อน')
  return Response.json({ teamspace })
}
