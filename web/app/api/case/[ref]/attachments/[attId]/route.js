import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageCases, canAccessCaseProvince } from '@/lib/caseAccess.js'
import { getAttachmentById } from '@/db/cases.js'
import { getOrgId } from '@/lib/orgContext.js'
import { readCaseFile } from '@/lib/caseUploads.js'

/**
 * GET /api/case/[ref]/attachments/[attId]
 * เสิร์ฟไฟล์แนบ — gate: login + canManageCases + จังหวัดของเคสอยู่ใน scope (caseworker-only)
 */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return new Response('Unauthorized', { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageCases(access)) return new Response('Forbidden', { status: 403 })

  const orgId = await getOrgId(session)
  if (!orgId) return new Response('Forbidden', { status: 403 })

  const { ref, attId } = await params
  const att = await getAttachmentById(orgId, attId)
  if (!att || att.ref !== ref) return new Response('Not found', { status: 404 })

  // scope: จังหวัดของเคสต้องอยู่ใน scope ของ user (admin เห็นทุกจังหวัด)
  if (!canAccessCaseProvince(att.province, access)) return new Response('Forbidden', { status: 403 })

  try {
    const buf = await readCaseFile(att.file_path)
    return new Response(buf, {
      headers: {
        'Content-Type': att.mime || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}
