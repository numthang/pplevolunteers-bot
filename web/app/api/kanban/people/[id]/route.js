// /api/kanban/people/[id] — โปรไฟล์คร่าวๆ ของคน 1 คน (กดชื่อเจ้าภาพ/คนช่วยเปิดกล่องลอย)
//
// ⚠️ getPersonProfile() gate ด้วยแถว org_members ให้แล้วฝั่ง DB (กัน enumeration ข้าม org)
//    ที่นี่แค่เช็ค id เป็นตัวเลข + คืน 404 เหมือน cardContext() ทำกับการ์ด
import { kanbanContext, err } from '@/lib/kanbanGuard.js'
import { getPersonProfile } from '@/db/kanban/people.js'

export async function GET(req, { params }) {
  const ctx = await kanbanContext()
  if (ctx.error) return ctx.error

  const id = String((await params).id || '').trim()
  if (!/^\d+$/.test(id)) return err(404, 'ไม่พบคนคนนี้')

  const profile = await getPersonProfile(ctx.orgId, Number(id))
  if (!profile) return err(404, 'ไม่พบคนคนนี้')

  return Response.json({ profile })
}
