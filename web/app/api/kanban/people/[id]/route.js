// /api/kanban/people/[id] — โปรไฟล์คร่าวๆ ของคน 1 คน (กดชื่อเจ้าภาพ/คนช่วยเปิดกล่องลอย)
//
// ⚠️ getPersonProfile() gate ด้วยแถว org_members ให้แล้วฝั่ง DB (กัน enumeration ข้าม org)
//    ที่นี่แค่เช็ค id เป็นตัวเลข + คืน 404 เหมือน cardContext() ทำกับการ์ด
//
// ⚠️ isOrgOwner ใช้ ctx.access.permissions.has('admin') — flag เดียวกับที่ orgAccess.js เติมให้
//    เฉพาะ org_members.role='owner' AND status='active' เท่านั้น (ดู getEffectiveOrgIdentity)
//    ไม่ใช่ kanban board role หรือ appoint-permission — ตรงตามเงื่อนไข gate ที่เคาะไว้กับ owner-identity-edit
// ⚠️ profile มี email/phone/phone_verified_at ติดมาจาก DB เสมอ — ต้องตัดออกก่อนส่งถ้าคนเปิดไม่ใช่ owner
//    (endpoint นี้เปิดให้สมาชิก org ทุกคนดูโปรไฟล์คร่าวๆ กันได้ ไม่ใช่แค่ owner)
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { getPersonProfile } from '@/db/kanban/people.js'

export async function GET(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const id = String((await params).id || '').trim()
  if (!/^\d+$/.test(id)) return err(404, 'ไม่พบคนคนนี้')

  const profile = await getPersonProfile(ctx.orgId, Number(id))
  if (!profile) return err(404, 'ไม่พบคนคนนี้')

  const isOrgOwner = ctx.access.permissions.has('admin')
  if (!isOrgOwner) {
    delete profile.email
    delete profile.phone
    delete profile.phone_verified_at
  }

  return Response.json({ profile, isOrgOwner, orgId: ctx.orgId })
}
