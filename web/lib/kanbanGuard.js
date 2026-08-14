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
  return { session, userId, orgId, access }
}

/** context + การ์ดใบนั้น (getCard มี org_id ใน WHERE อยู่แล้ว — ไม่พบ = ข้าม org หรือไม่มีจริง) */
export async function cardContext(cardId) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx

  // ⚠️ id เป็น BIGINT → pg คืนมาเป็น "สตริง" ห้ามเทียบด้วย === กับ Number
  //    (บทเรียนเดียวกับ bigint id ของ posts 2026-08-07)
  const id = String(cardId || '').trim()
  const card = /^\d+$/.test(id) ? await cardDB.getCard(ctx.orgId, id) : null
  if (!card) return { ...ctx, error: err(404, 'ไม่พบการบ้านใบนี้') }

  return { ...ctx, card }
}
