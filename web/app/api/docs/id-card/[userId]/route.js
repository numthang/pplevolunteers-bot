import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getIdCard, isMemberOfOrg } from '@/db/docs/idCard.js'
import { getEntryByToken } from '@/db/docs/entries.js'

/**
 * GET /api/docs/id-card/[userId]
 * เสิร์ฟสำเนาบัตร (ภาพดิบ ยังไม่ลายน้ำ) สำหรับ preview
 *
 * auth 2 ชั้น (ชั้นที่ 2 เพิ่ม 2026-07-21 ตอนบัตรย้ายมาเก็บที่ users):
 *   1. เจ้าของ หรือ canManageDocs
 *   2. **เจ้าของบัตรต้องเป็นสมาชิก org เดียวกับผู้ขอ** — เดิมได้ตัวกันนี้มาฟรีเพราะ
 *      รูปเก็บ per-guild (คนดูแล guild A เห็นได้แค่สำเนาที่อัปใน guild A) · พอรวม
 *      เป็นใบเดียวที่ users ต้องเช็คเอง ไม่งั้นคนมีสิทธิ์ docs ที่ org ไหนก็ได้
 *      ดึงบัตรของคนที่อัปให้ org อื่นได้ (PDPA ข้าม tenant)
 *
 * org: จาก active org ปกติ · ถ้าไม่มี (หน้า sign ไม่มี cookie) ใช้ org ของ entry ตาม ?token=
 */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { userId: raw } = await params
  const targetUserId = Number(raw)
  if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
    return Response.json({ error: 'invalid id' }, { status: 400 })
  }

  const { access, userId: selfId } = await getEffectiveOrgIdentity(session)
  const isOwner = targetUserId === selfId
  if (!isOwner && !canManageDocs(access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!isOwner) {
    // ชั้นที่ 2 — ต้องอยู่ org เดียวกัน (org จาก session ก่อน, ไม่มีค่อยเอาจาก sign token)
    let orgId = await getOrgId(session)
    if (!orgId) {
      const token = new URL(req.url).searchParams.get('token')
      if (token) orgId = (await getEntryByToken(token))?.org_id ?? null
    }
    if (!orgId) return Response.json({ error: 'org not found' }, { status: 400 })
    if (!(await isMemberOfOrg(targetUserId, orgId))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const image = await getIdCard(targetUserId)
  if (!image) return Response.json({ error: 'Not found' }, { status: 404 })

  const buf = Buffer.isBuffer(image) ? image : Buffer.from(image)
  return new Response(buf, {
    headers: {
      'Content-Type':  'image/jpeg',
      'Cache-Control': 'private, no-store',
    },
  })
}
