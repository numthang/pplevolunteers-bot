// /api/kanban/boards/[id] — ตั้งค่ากระดาน (2026-09-07 · db มีมาตั้งแต่ก้อน 3 แต่ยังไม่มี route)
//
// PATCH { name?, detail?, guildId?, teamspaceId?, archived? }  · ย้ายกระดานข้าม teamspace ได้ที่นี่
// DELETE → เก็บเข้ากรุ (การ์ดข้างในไม่ถูกแตะ · กระดานสุดท้ายของ org เก็บไม่ได้)
//
// ⚠️ org ไม่ตรง = 404 ไม่ใช่ 403 (กติกาทั้งโมดูล)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { canManageBoard } from '@/lib/kanbanAccess.js'
import * as boardDB from '@/db/kanban/boards.js'
import * as tsDB from '@/db/kanban/teamspaces.js'

async function load(id) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx
  const board = await boardDB.getBoard(ctx.orgId, id)
  if (!board) return { ...ctx, error: err(404, 'ไม่พบกระดานนี้') }
  if (!canManageBoard(board, ctx.access, ctx.userId)) {
    return { ...ctx, error: err(403, 'แก้ได้เฉพาะคนสร้างกระดาน หรือแอดมิน') }
  }
  return { ...ctx, board }
}

export async function PATCH(req, { params }) {
  const { id } = await params
  const ctx = await load(id)
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const patch = {}

  if (body.name !== undefined) {
    const name = String(body.name || '').trim()
    if (!name) return err(400, 'ต้องตั้งชื่อกระดาน')
    if (name.length > 100) return err(400, 'ชื่อกระดานยาวเกิน 100 ตัวอักษร')
    patch.name = name
  }
  if (body.detail !== undefined)  patch.detail = String(body.detail || '').trim() || null
  if (body.guildId !== undefined) patch.guildId = String(body.guildId || '').trim() || null

  if (body.teamspaceId !== undefined) {
    const tsId = Number(body.teamspaceId) || null
    if (!tsId) return err(400, 'กระดานต้องอยู่ใน teamspace')
    if (!(await tsDB.getTeamspace(ctx.orgId, tsId))) return err(400, 'ไม่พบ teamspace ที่เลือก')
    patch.teamspaceId = tsId
  }

  if (body.archived === false) {
    const board = await boardDB.unarchiveBoard(ctx.orgId, id)
    return Response.json({ board })
  }

  const board = await boardDB.updateBoard(ctx.orgId, id, patch)

  // ย้ายกระดานข้าม teamspace แล้ว บอร์ดตั้งต้นของทีมเดิมต้องไม่ค้างชี้ข้ามทีม
  // (ไม่งั้นบอทของเซิร์ฟทีมเดิมจะลงการ์ดในทีมใหม่เงียบๆ)
  if (patch.teamspaceId) {
    await tsDB.clearDefaultBoardElsewhere(ctx.orgId, Number(id), patch.teamspaceId)
  }

  return Response.json({ board })
}

export async function DELETE(_req, { params }) {
  const { id } = await params
  const ctx = await load(id)
  if (ctx.error) return ctx.error

  // กระดานสุดท้ายเก็บไม่ได้ — db คืน null แล้ว route แปลงเป็นข้อความ (ห้ามเงียบ)
  const board = await boardDB.archiveBoard(ctx.orgId, id)
  if (!board) return err(400, 'เก็บกระดานสุดท้ายเข้ากรุไม่ได้ — สร้างกระดานใหม่ก่อน')

  // กระดานเข้ากรุแล้ว teamspace ไหนที่ตั้งมันเป็นบอร์ดตั้งต้นต้องเลื่อนไปใบอื่น
  await tsDB.clearDefaultBoardElsewhere(ctx.orgId, Number(id), null)
  return Response.json({ board })
}
