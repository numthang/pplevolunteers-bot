// /api/kanban/cards — รายการKANBAN + สร้างใหม่
//
// GET  ?view=board     → กระดาน (ค่าตั้งต้น · หน้า /kanban ใช้ตัวนี้)
//      ?view=unassigned → งานที่ยังไม่มีคนรับ
//      ?view=all        → ทั้ง org
// POST                  → สร้างKANBAN
//
// ⛔ POST นี้ต้องถูกเรียก "ตอนกดปุ่มบันทึก" เท่านั้น — ห้ามยิงตอนกดปุ่ม "เพิ่มKANBAN" เพื่อเปิดฟอร์ม
//    (CLAUDE.md 2026-07-30 · เคสจริง /posts เคยทำแล้วได้ร่างเปล่าค้าง DB 5 แถว)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { STATUS_TYPES, formatRef, canPurge } from '@/lib/kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

export async function GET(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const params = new URL(req.url).searchParams
  // ⛔ ?view=mine ถูกลบทิ้ง 2026-09-03 (เฟส B) — มันคืน { mine, helping } ที่แยกด้วย "เจ้าภาพ vs ผู้ช่วย"
  //    ซึ่งเลิกมีอยู่จริงแล้ว · grep ทั้งรีโปไม่มี caller (หน้าแรกใช้ /api/kanban/stats)
  //    ค่าตั้งต้นย้ายมาเป็น 'board' — ทางที่หน้าเว็บใช้จริงทางเดียว
  const view = params.get('view') || 'board'
  // ?board=<id> → เฉพาะกระดานนั้น · ไม่ส่ง = ทุกกระดาน (ตัวเลือก "ทั้งหมด" ใน dropdown)
  // ⚠️ ไม่ต้องเช็คสิทธิ์กระดานที่นี่ — listCards มี org_id ใน WHERE แล้ว และก้อนนี้ทุกกระดาน
  //    ที่ open_to_org ทุกคนใน org เห็นได้อยู่แล้ว · ถึงตอนมีกระดานปิด ให้กรองที่ listCards ที่เดียว
  const rawBoard = params.get('board')
  const boardId = rawBoard && /^\d+$/.test(rawBoard) ? rawBoard : null

  if (view === 'unassigned') {
    const { cards, truncated } = await cardDB.listCards(ctx.orgId, { unassigned: true, includeClosed: false, viewer: ctx.viewer })
    return Response.json({ cards, truncated })
  }
  // หน้า /kanban (หน้าเดียวของโมดูลตั้งแต่ 2026-08-18) — ต้องได้กอง "เสร็จ"/"กรุ" มาด้วย
  // ไม่งั้นลากเข้าแล้วการ์ดหายต่อหน้า · limit สูงกว่าปกติเพราะงานที่จบแล้วสะสมเรื่อยๆ (UI ตัดแสดงเองต่อกอง)
  //
  // ⭐ viewerUserId ติดไปด้วย — ตัวกรอง "ของฉัน" ตัดสินฝั่ง client จากชุดข้อมูลก้อนเดียวกันนี้
  //    (ไม่ยิง /api/me เพิ่ม และ **ห้ามให้ client เดา userId ตัวเองจาก session** — debug mode คืน null ตั้งใจ)
  if (view === 'board') {
    const { cards, truncated } = await cardDB.listCards(ctx.orgId, { includeClosed: true, boardId, viewer: ctx.viewer })
    return Response.json({
      cards,
      // ⭐ ชนเพดาน = บอกผู้ใช้ตรงๆ ว่ารายการไม่ครบ · ตัวกรอง/ตัวเรียงทำงานบนชุดนี้ทั้งคู่
      //    เงียบไว้ = "ไม่พบ" กับ "เรียงแล้ว" กลายเป็นคำโกหกพร้อมกัน (ดู CARD_HARD_CAP)
      truncated,
      viewerUserId: ctx.userId ?? null,
      // ⭐ ต้องส่งในโหมดกระดานด้วย (2026-08-19) — ก้อน B เพิ่มเมนู ⋯ → ลบ บนการ์ดในกระดาน
      //    เดิมส่งเฉพาะโหมดกรุ กล่องลบบนกระดานเลยไม่มีปุ่ม "ลบถาวร" ให้ admin เลย
      canPurge: canPurge(ctx.access),
    })
  }
  // กรุ (archive) — คนละเรื่องกับช่อง "พักไว้" ที่เป็น status_type
  // แยก endpoint ไม่ใช่กรองในเครื่อง: การ์ดที่เก็บเข้ากรุแล้วต้องไม่ถูกดึงมาในโหมดปกติเลย
  if (view === 'archived') {
    const { cards, truncated } = await cardDB.listCards(ctx.orgId, { onlyArchived: true, includeClosed: true, boardId, viewer: ctx.viewer })
    return Response.json({
      cards,
      truncated,
      viewerUserId: ctx.userId ?? null,
      // ปุ่ม "ลบถาวร" โผล่เฉพาะ admin — ส่งมากับชุดข้อมูลนี้เลย ไม่ต้องยิง /api/me เพิ่ม
      // (แนวเดียวกับ viewerUserId ข้างบน — client ห้ามเดาสิทธิ์ตัวเองจาก session)
      canPurge: canPurge(ctx.access),
    })
  }
  const { cards, truncated } = await cardDB.listCards(ctx.orgId, { includeClosed: false, viewer: ctx.viewer })
  return Response.json({ cards, truncated })
}

export async function POST(req) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const body = await req.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  if (!title) return err(400, 'ต้องมีชื่อKANBAN')
  if (title.length > 200) return err(400, 'ชื่อKANBANยาวเกิน 200 ตัวอักษร')
  if (body.statusType && !STATUS_TYPES.includes(body.statusType)) return err(400, 'สถานะไม่ถูกต้อง')

  // assignToMe = ทางลัดของหน้า "KANBANของฉัน" — client ไม่ต้องรู้ userId ตัวเอง
  // (เคสปกติที่สุดคือจดงานของตัวเอง → ต้องเข้ากอง "กำลังทำ" ทันที ไม่ใช่ไปกองรอรับแล้วกดรับซ้ำ)
  // ⭐ เฟส B: รับได้หลายคนตั้งแต่ตอนสร้าง — body.assigneeIds เป็น array (รับ ownerUserId เดี่ยวไม่ได้แล้ว)
  const assigneeIds = body.assignToMe
    ? [ctx.userId]
    : (Array.isArray(body.assigneeIds) ? body.assigneeIds.map(Number).filter(Boolean) : [])
  // ไม่มีผู้รับผิดชอบ = อยู่ backlog เท่านั้น — กันไม่ให้ client ยัด status มาชน trigger ของ DB
  if (!assigneeIds.length && body.statusType && body.statusType !== 'backlog') {
    return err(400, 'ต้องมีผู้รับผิดชอบก่อนถึงจะย้ายออกจากช่องรอทำได้')
  }

  const card = await cardDB.createCard(ctx.orgId, {
    title,
    detail: body.detail ?? null,
    assigneeIds,
    dueAt: body.dueAt || null,     // ⚠️ ส่งดิบ — ห้ามแปลง timezone (local Thai time จากฟอร์ม)
    priority: Number(body.priority) || 0,
    statusType: body.statusType || null,
    // ไม่ส่ง = กระดานตั้งต้นของ org (createCard เติมให้เอง) — หน้าเว็บส่งกระดานที่กำลังเปิดอยู่มาเสมอ
    boardId: body.boardId && /^\d+$/.test(String(body.boardId)) ? String(body.boardId) : null,
  }, ctx.userId)

  return Response.json({ card, ref: formatRef(card.ref_no) }, { status: 201 })
}
