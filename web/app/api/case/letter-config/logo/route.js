import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canManageCases, canAccessCaseProvince } from '@/lib/caseAccess.js'
import { getOrgConfig, setOrgConfig, deleteOrgConfig } from '@/db/orgConfig.js'
import { getLetterConfig, setLetterConfigLogo } from '@/db/caseLetterConfig.js'
import { normalizeLetterLogo } from '@/lib/letterLogo.js'
import { logAction } from '@/db/auditLog.js'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

/**
 * POST/DELETE /api/case/letter-config/logo — โลโก้หัวจดหมาย
 *
 * มี 2 ชั้น (user เคาะ 2026-09-01): ส่ง `province` มา = โลโก้ของสาขาจังหวัดนั้น
 * ไม่ส่ง = **โลโก้กลางของ org** ที่จังหวัดซึ่งยังไม่ตั้งเองจะตกมาใช้
 * ลำดับตอนสร้างหนังสือ: จังหวัด → กลาง → ตราที่ฝังมากับ template.docx
 *
 * เก็บไฟล์ที่ public/uploads/org-letterhead/ (ตราองค์กรไม่ใช่ของลับ ไม่ต้อง gate เหมือนไฟล์แนบเคส)
 * ⚠️ ย่อลงกรอบมาตรฐานตั้งแต่ตอนอัปโหลด (normalizeLetterLogo) ไม่ใช่ตอนสร้าง PDF —
 *    generateComplaintLetterPdf() เป็น sync ทั้งตัว แต่ sharp เป็น async
 */
const ORG_KEY = 'case_letter_logo'
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads', 'org-letterhead')
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp']

async function gate() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  const orgId = await getOrgId(session)
  if (!orgId) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) }

  return { session, access, orgId }
}

/**
 * ตรวจจังหวัดที่ขอแก้ — คืน { province } (null = โลโก้กลาง) หรือ { error }
 * ผู้ประสานงานจังหวัดต้องแก้ได้เฉพาะจังหวัดตัวเอง เหมือน GET/PUT ของ letter-config
 */
async function resolveTarget(g, provinceRaw) {
  const province = provinceRaw?.trim()
  if (!province) return { province: null }

  if (!canAccessCaseProvince(province, g.access)) {
    return { error: Response.json({ error: 'ไม่มีสิทธิ์แก้จังหวัดนี้' }, { status: 403 }) }
  }
  if (!(await getLetterConfig(g.orgId, province))) {
    return { error: Response.json({ error: 'ยังไม่มีหัวจดหมายของจังหวัดนี้ — บันทึกข้อมูลก่อนแล้วค่อยใส่โลโก้' }, { status: 400 }) }
  }
  return { province }
}

/** path เดิมที่เก็บไว้ (ก่อนเขียนทับ) — ใช้ตามไปลบไฟล์ */
async function currentPath(orgId, province) {
  if (!province) return await getOrgConfig(orgId, ORG_KEY)
  return (await getLetterConfig(orgId, province))?.logo_path ?? null
}

/** ลบไฟล์เก่าทิ้งหลังเปลี่ยน/ล้าง — best-effort ไฟล์หายไปแล้วก็ไม่เป็นไร */
async function removeStored(path) {
  if (!path?.startsWith('/uploads/org-letterhead/')) return
  await unlink(join(process.cwd(), 'public', path.replace(/^\//, ''))).catch(() => {})
}

export async function POST(req) {
  const g = await gate()
  if (g.error) return g.error

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return Response.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  if (!ALLOWED.includes(file.type)) {
    return Response.json({ error: 'รองรับเฉพาะ PNG, JPEG, WEBP' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) return Response.json({ error: 'ไฟล์ใหญ่เกิน 5MB' }, { status: 413 })

  const target = await resolveTarget(g, form.get('province'))
  if (target.error) return target.error

  let png
  try {
    png = await normalizeLetterLogo(Buffer.from(await file.arrayBuffer()))
  } catch {
    return Response.json({ error: 'อ่านไฟล์รูปไม่ได้' }, { status: 400 })
  }

  await mkdir(UPLOAD_DIR, { recursive: true })
  const filename = `${randomUUID()}.png`
  await writeFile(join(UPLOAD_DIR, filename), png)

  const previous = await currentPath(g.orgId, target.province)
  const url = `/uploads/org-letterhead/${filename}`
  if (target.province) await setLetterConfigLogo(g.orgId, target.province, url)
  else await setOrgConfig(g.orgId, ORG_KEY, url)
  await removeStored(previous)

  logAction({
    orgId: g.orgId, app: 'cases', action: 'case.letter_logo_changed',
    actorId: g.session.user.userId, targetId: target.province || 'org',
  })

  return Response.json({ ok: true, url, province: target.province })
}

/** DELETE — ล้างโลโก้ จังหวัดจะตกไปใช้โลโก้กลาง · โลโก้กลางจะตกไปใช้ตราในเทมเพลต */
export async function DELETE(req) {
  const g = await gate()
  if (g.error) return g.error

  const target = await resolveTarget(g, new URL(req.url).searchParams.get('province'))
  if (target.error) return target.error

  const previous = await currentPath(g.orgId, target.province)
  if (target.province) await setLetterConfigLogo(g.orgId, target.province, null)
  else await deleteOrgConfig(g.orgId, ORG_KEY)
  await removeStored(previous)

  logAction({
    orgId: g.orgId, app: 'cases', action: 'case.letter_logo_reset',
    actorId: g.session.user.userId, targetId: target.province || 'org',
  })

  return Response.json({ ok: true, url: null, province: target.province })
}
