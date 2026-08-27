/**
 * kanbanGuard — ด่านเดียวที่ route ของ kanban ใช้โหลด context + ตัดสินสิทธิ์
 *
 * ลอกโครงจาก postsGuard.js ทั้งดุ้น — **ห้าม route ไป query สิทธิ์เอง**
 *   kanbanContext()   — แค่ต้อง login + อยู่ใน org (หน้าการบ้านของฉัน / สร้างการ์ด)
 *   cardContext(id)   — การ์ดต้องมีจริง + อยู่ org เดียวกับ session
 *
 * คืน `{ error: Response }` เมื่อจบเกม → route แค่ `if (ctx.error) return ctx.error`
 *
 * ⚠️ org ไม่ตรง = **404 ไม่ใช่ 403** — ห้ามยืนยันว่า id นี้มีอยู่ในระบบ (กัน id enumeration ข้าม tenant)
 * ⚠️ ก้อน 1 ทุกคนใน org เห็นการ์ดได้หมด → ไม่มีด่าน read เพิ่ม · ถึงก้อน 3 (กระดาน) ให้เพิ่มที่นี่ที่เดียว
 */
import { getServerSession } from 'next-auth'
import { authOptions } from './auth-options.js'
import { getEffectiveOrgIdentity } from './orgAccess.js'
import { getOrgId } from './orgContext.js'
import { canManageCases, getUserScope } from './caseAccess.js'
import { looksLikeRef, parseRef } from './kanbanAccess.js'
import * as cardDB from '@/db/kanban/cards.js'

export const err = (status, message) => Response.json({ error: message }, { status })

/** session + org + access */
export async function kanbanContext() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.userId
  if (!userId) return { error: err(401, 'ต้องเข้าสู่ระบบก่อน') }

  const orgId = await getOrgId(session)
  if (!orgId) return { error: err(403, 'ยังไม่ได้อยู่ในองค์กรไหน') }

  const { access } = await getEffectiveOrgIdentity(session)

  // ⭐ viewer = สิทธิ์ของ "ระบบต้นทาง" ที่ kanban ต้องเคารพ (2026-08-24)
  //    การ์ดที่ผูกเคส/โพสต์ถูกซ่อนทั้งใบถ้าคนดูเปิดต้นทางไม่ได้ — kanban เปิดทั้ง org
  //    แต่เคสกรองจังหวัด + ต้องมียศ และชื่อเรื่องร้องเรียนเป็น PII ของผู้ร้อง
  //    ⛔ ห้ามให้ route ประกอบ viewer เอง — หลุดที่เดียวคือรั่วข้ามจังหวัดทั้งบอร์ด
  const viewer = {
    userId,
    canSeeCases: canManageCases(access),
    caseProvinces: getUserScope(access),   // null = admin (ทุกจังหวัด) · [] = ไม่มีจังหวัดในอำนาจ
  }

  return { session, userId, orgId, access, viewer }
}

/**
 * context + การ์ดใบนั้น
 * ⚠️ ใช้ getCardForViewer (ไม่ใช่ getCard) — การ์ดที่ผูกเคสนอกจังหวัดต้องได้ 404 เหมือนไม่มีอยู่จริง
 *    org ไม่ตรงก็ 404 เหมือนกัน · ห้ามแยกข้อความ ไม่งั้นบอกใบ้ว่ามีเคสนั้นอยู่
 */
export async function cardContext(cardId) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx

  // ⚠️ id เป็น BIGINT → pg คืนมาเป็น "สตริง" ห้ามเทียบด้วย === กับ Number
  //    (บทเรียนเดียวกับ bigint id ของ posts 2026-08-07)
  //
  // ⭐ รับได้ 2 รูปแบบ (2026-08-28) — ทุก route ใต้ cards/[id] ผ่านตรงนี้ที่เดียว
  //    จึงพอแค่ตรงนี้ที่เดียวเพื่อให้ `?card=KB-42` ใช้ได้ทั้งกล่อง (fields/helpers/checklist ตามมาเอง)
  //      '154'    → id ภายใน (ลิงก์เก่า + ทุกที่ที่ส่ง card.id มา)
  //      'KB-42'  → ref ที่คนอ่าน/พิมพ์กันในดิสฯ
  //    ⛔ ตัวเลขล้วนต้องเป็น id เสมอ (looksLikeRef บังคับให้มีคำนำหน้า) — ปล่อยให้กำกวมเมื่อไหร่
  //       ลิงก์เก่าจะเปิดการ์ดผิดใบเงียบๆ เพราะ id 42 กับ ref 42 เป็นคนละใบ
  const id = String(cardId || '').trim()
  const card = /^\d+$/.test(id)
    ? await cardDB.getCardForViewer(ctx.orgId, id, ctx.viewer)
    : looksLikeRef(id)
      ? await cardDB.getCardByRef(ctx.orgId, parseRef(id), ctx.viewer)
      : null
  if (!card) return { ...ctx, error: err(404, 'ไม่พบการบ้านใบนี้') }

  return { ...ctx, card }
}
