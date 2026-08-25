import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { processIdCardImage } from '@/lib/idCard.js'
import { getExternalIdCard, saveExternalIdCard } from '@/db/docs/externalPayees.js'
import { getEntryByToken } from '@/db/docs/entries.js'

const MAX_SIZE     = 8 * 1024 * 1024
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])

/**
 * org ของผู้ขอ — จาก active org ก่อน · ถ้าไม่มี (หน้า sign ไม่มี cookie guild) ใช้ org ของ entry
 * ตาม ?token= **และ entry นั้นต้องชี้มาที่ payee ใบนี้จริง** ไม่งั้น token ของงานหนึ่ง
 * จะกลายเป็นกุญแจเปิดบัตรของคนนอกทุกคนใน org
 */
async function resolveOrg(session, req, payeeId) {
  const active = await getOrgId(session)
  if (active) return active
  const token = new URL(req.url).searchParams.get('token')
  if (!token) return null
  const entry = await getEntryByToken(token)
  if (!entry || entry.external_payee_id !== payeeId) return null
  return entry.org_id ?? null
}

export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const payeeId = Number(id)
  const orgId = await resolveOrg(session, req, payeeId)
  if (!orgId) return Response.json({ error: 'org not found' }, { status: 400 })

  const image = await getExternalIdCard(payeeId, orgId)
  if (!image) return Response.json({ error: 'Not found' }, { status: 404 })

  return new Response(Buffer.isBuffer(image) ? image : Buffer.from(image), {
    headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store' },
  })
}

/** POST (multipart: file) — เก็บสำเนาบัตรของคนนอกไว้ปั๊มลงใบสำคัญฯ */
export async function POST(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const payeeId = Number(id)
  const orgId = await resolveOrg(session, req, payeeId)
  if (!orgId) return Response.json({ error: 'org not found' }, { status: 400 })

  const form = await req.formData()
  const file = form.get('file')
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'file required' }, { status: 400 })
  }
  if (!ALLOWED_MIME.has(file.type)) return Response.json({ error: 'รองรับเฉพาะ JPEG / PNG / WebP' }, { status: 415 })
  if (file.size > MAX_SIZE)         return Response.json({ error: 'ไฟล์ใหญ่เกิน 8 MB' }, { status: 413 })

  try {
    const processed = await processIdCardImage(Buffer.from(await file.arrayBuffer()))
    const ok = await saveExternalIdCard(payeeId, orgId, processed)
    if (!ok) return Response.json({ error: 'ไม่พบผู้รับเงินคนนี้' }, { status: 404 })
    return Response.json({ success: true })
  } catch (err) {
    console.error('[POST /api/docs/external-payees/:id/id-card]', err)
    return Response.json({ error: 'ประมวลผลรูปไม่สำเร็จ' }, { status: 500 })
  }
}
