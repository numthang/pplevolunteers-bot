import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getOrgId } from '@/lib/orgContext.js'
import { canManageCases } from '@/lib/caseAccess.js'
import { getOrgConfig, setOrgConfig, deleteOrgConfig } from '@/db/orgConfig.js'
import { normalizeLetterLogo } from '@/lib/letterLogo.js'
import { logAction } from '@/db/auditLog.js'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'

/**
 * POST/DELETE /api/case/letter-config/logo — โลโก้หัวจดหมาย **ระดับ org** (ทุกจังหวัดใช้ตัวเดียวกัน)
 *
 * เก็บ path ใน org_config key `case_letter_logo` · ไฟล์อยู่ public/uploads/org-letterhead/
 * (ตราองค์กรไม่ใช่ของลับ ไม่ต้องมี gate เสิร์ฟไฟล์เหมือนไฟล์แนบเคส)
 *
 * ⚠️ ย่อลงกรอบมาตรฐานตั้งแต่ตอนอัปโหลด (normalizeLetterLogo) ไม่ใช่ตอนสร้าง PDF —
 *    generateComplaintLetterPdf() เป็น sync ทั้งตัว แต่ sharp เป็น async
 * ไม่มีค่าใน org_config = ใช้โลโก้ที่ฝังมากับ template.docx (ตราพรรค)
 */
const CONFIG_KEY = 'case_letter_logo'
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

  return { session, orgId }
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

  let png
  try {
    png = await normalizeLetterLogo(Buffer.from(await file.arrayBuffer()))
  } catch {
    return Response.json({ error: 'อ่านไฟล์รูปไม่ได้' }, { status: 400 })
  }

  await mkdir(UPLOAD_DIR, { recursive: true })
  const filename = `${randomUUID()}.png`
  await writeFile(join(UPLOAD_DIR, filename), png)

  const previous = await getOrgConfig(g.orgId, CONFIG_KEY)
  const url = `/uploads/org-letterhead/${filename}`
  await setOrgConfig(g.orgId, CONFIG_KEY, url)
  await removeStored(previous)

  logAction({
    orgId: g.orgId, app: 'cases', action: 'case.letter_logo_changed',
    actorId: g.session.user.userId,
  })

  return Response.json({ ok: true, url })
}

/** DELETE — กลับไปใช้โลโก้ค่าเริ่มต้นที่ฝังมากับเทมเพลต */
export async function DELETE() {
  const g = await gate()
  if (g.error) return g.error

  const previous = await getOrgConfig(g.orgId, CONFIG_KEY)
  await deleteOrgConfig(g.orgId, CONFIG_KEY)
  await removeStored(previous)

  logAction({
    orgId: g.orgId, app: 'cases', action: 'case.letter_logo_reset',
    actorId: g.session.user.userId,
  })

  return Response.json({ ok: true, url: null })
}
