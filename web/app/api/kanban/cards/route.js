// /api/kanban/cards — รายการการบ้าน + สร้างใหม่
//
// GET  ?view=mine       → หน้าแรก "การบ้านของฉัน" (2 กอง: ต้องส่ง / ช่วย)
//      ?view=unassigned → งานที่ยังไม่มีคนรับ
//      ?view=all        → ทั้ง org
// POST                  → สร้างการบ้าน
//
// ⛔ POST นี้ต้องถูกเรียก "ตอนกดปุ่มบันทึก" เท่านั้น — ห้ามยิงตอนกดปุ่ม "เพิ่มการบ้าน" เพื่อเปิดฟอร์ม
//    (CLAUDE.md 2026-07-30 · เคสจริง /posts เคยทำแล้วได้ร่างเปล่าค้าง DB 5 แถว)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { STATUS_TYPES, formatRef } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const view = new URL(req.url).searchParams.get('view') || 'mine'

  if (view === 'mine') {
    const { mine, helping } = await cardDB.listMyCards(ctx.orgId, ctx.userId)
    return Response.json({ mine, helping })
  }
  if (view === 'unassigned') {
    return Response.json({ cards: await cardDB.listCards(ctx.orgId, { unassigned: true, includeClosed: false }) })
  }
  // หน้า /kanban (หน้าเดียวของโมดูลตั้งแต่ 2026-08-18) — ต้องได้กอง "เสร็จ"/"กรุ" มาด้วย
  // ไม่งั้นลากเข้าแล้วการ์ดหายต่อหน้า · limit สูงกว่าปกติเพราะงานที่จบแล้วสะสมเรื่อยๆ (UI ตัดแสดงเองต่อกอง)
  //
  // ⭐ viewerUserId ติดไปด้วย — ตัวกรอง "ของฉัน" ตัดสินฝั่ง client จากชุดข้อมูลก้อนเดียวกันนี้
  //    (ไม่ยิง /api/me เพิ่ม และ **ห้ามให้ client เดา userId ตัวเองจาก session** — debug mode คืน null ตั้งใจ)
  if (view === 'board') {
    return Response.json({
      cards: await cardDB.listCards(ctx.orgId, { includeClosed: true, limit: 500 }),
      viewerUserId: ctx.userId ?? null,
    })
  }
  return Response.json({ cards: await cardDB.listCards(ctx.orgId, { includeClosed: false }) })
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  if (!title) return err(400, 'ต้องมีชื่อการบ้าน')
  if (title.length > 200) return err(400, 'ชื่อการบ้านยาวเกิน 200 ตัวอักษร')
  if (body.statusType && !STATUS_TYPES.includes(body.statusType)) return err(400, 'สถานะไม่ถูกต้อง')

  // assignToMe = ทางลัดของหน้า "การบ้านของฉัน" — client ไม่ต้องรู้ userId ตัวเอง
  // (เคสปกติที่สุดคือจดงานของตัวเอง → ต้องเข้ากอง "ต้องส่ง" ทันที ไม่ใช่ไปกองรอรับแล้วกดรับซ้ำ)
  const ownerUserId = body.assignToMe ? ctx.userId : (body.ownerUserId ? Number(body.ownerUserId) : null)
  // ไม่มีเจ้าภาพ = อยู่ backlog เท่านั้น — กันไม่ให้ client ยัด status มาชน CHECK ของ DB
  if (!ownerUserId && body.statusType && body.statusType !== 'backlog') {
    return err(400, 'ต้องมีเจ้าภาพก่อนถึงจะย้ายออกจากช่องรอรับได้')
  }

  const card = await cardDB.createCard(ctx.orgId, {
    title,
    detail: body.detail ?? null,
    ownerUserId,
    dueAt: body.dueAt || null,     // ⚠️ ส่งดิบ — ห้ามแปลง timezone (local Thai time จากฟอร์ม)
    priority: Number(body.priority) || 0,
    statusType: body.statusType || null,
  }, ctx.userId)

  return Response.json({ card, ref: formatRef(card.ref_no) }, { status: 201 })
}
