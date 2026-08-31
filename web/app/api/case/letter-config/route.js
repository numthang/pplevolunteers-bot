import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canManageCases, canAccessCaseProvince } from '@/lib/caseAccess.js'
import { listLetterConfigs, upsertLetterConfig } from '@/db/caseLetterConfig.js'
import geographyData from '@/lib/thailand-geography.json'

const PROVINCES = geographyData.map(p => p.province)

/**
 * GET/PUT /api/case/letter-config — หัวจดหมายร้องเรียนต่อจังหวัด
 *
 * gate เป็น canManageCases ไม่ใช่ owner-only แบบ /api/org/orgs/[id]/features
 * เพราะคนที่ต้องแก้หัวจดหมายคือคนดูแลเคส และเป็นด่านเดียวกับ gateCase ที่คุมทั้งโมดูล
 *
 * ⚠️ หน้าเพจกันอะไรไม่ได้ — requireOrgUser() เช็คแค่ล็อกอิน ด่านจริงต้องอยู่ที่นี่
 */
async function gate() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  const orgId = await getOrgId(session)
  if (!orgId) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  return { orgId, access }
}

export async function GET() {
  const g = await gate()
  if (g.error) return g.error

  // เห็นเฉพาะจังหวัดใน scope ตัวเอง — ผู้ประสานงานจังหวัดไม่ควรอ่าน/แก้หัวจดหมายจังหวัดอื่น
  const configs = (await listLetterConfigs(g.orgId)).filter(c => canAccessCaseProvince(c.province, g.access))
  const provinces = PROVINCES.filter(p => canAccessCaseProvince(p, g.access))

  return Response.json({ configs, provinces })
}

export async function PUT(req) {
  const g = await gate()
  if (g.error) return g.error

  const body = await req.json().catch(() => ({}))
  const province = body.province?.trim()

  if (!province || !PROVINCES.includes(province)) {
    return Response.json({ error: 'จังหวัดไม่ถูกต้อง' }, { status: 400 })
  }
  if (!canAccessCaseProvince(province, g.access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 4 ช่องนี้เป็น NOT NULL ในตาราง — ตีกลับที่นี่ ดีกว่าปล่อยไปให้ pg โยน error ที่ผู้ใช้อ่านไม่รู้เรื่อง
  const required = ['org_name', 'address', 'signer_name', 'signer_position']
  for (const f of required) {
    if (!body[f]?.trim()) return Response.json({ error: `กรุณากรอก ${f}` }, { status: 400 })
  }

  await upsertLetterConfig(g.orgId, province, {
    org_name:          body.org_name.trim(),
    address:           body.address.trim(),
    signer_name:       body.signer_name.trim(),
    signer_position:   body.signer_position.trim(),
    coordinator_name:  body.coordinator_name?.trim() || null,
    coordinator_phone: body.coordinator_phone?.trim() || null,
  })

  return Response.json({ ok: true })
}
