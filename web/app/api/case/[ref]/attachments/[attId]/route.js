import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageCases, canAccessCaseProvince } from '@/lib/caseAccess.js'
import { getAttachmentById } from '@/db/cases.js'
import { getOrgId } from '@/lib/orgContext.js'
import { readCaseFile, deleteCaseFiles, isInlineSafeMime } from '@/lib/caseUploads.js'
import { gateCase } from '@/lib/caseGate.js'
import { deleteAttachment } from '@/db/cases.js'
import { logAction } from '@/db/auditLog.js'

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
    // ⚠️ ไฟล์แนบเป็นของที่คนนอกอัปโหลดเข้ามา และเสิร์ฟจาก origin เดียวกับเว็บ
    //    nosniff = ห้าม browser เดาชนิดไฟล์เอง · ไฟล์ที่ไม่ใช่รูป (PDF/เสียง) บังคับดาวน์โหลด
    //    ไม่เปิด inline — PDF ที่เปิด inline รันในบริบทของโดเมนเรา
    const disposition = isInlineSafeMime(att.mime)
      ? 'inline'
      : `attachment; filename*=UTF-8''${encodeURIComponent(att.original_name || 'attachment')}`
    return new Response(buf, {
      headers: {
        'Content-Type': att.mime || 'application/octet-stream',
        'Content-Disposition': disposition,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch {
    return new Response('File not found', { status: 404 })
  }
}

/**
 * DELETE /api/case/[ref]/attachments/[attId] — ลบไฟล์แนบ 1 ใบ (เจ้าหน้าที่)
 *
 * ⚠️ ต้อง unlink ไฟล์ออกจากดิสก์ด้วย — `uploads/cases/` ไม่มี gc (ดู deleteCaseFiles)
 *    ลบแค่แถว = ไฟล์ PII ค้างถาวรแบบไม่มีใครอ้างถึงได้อีก
 */
export async function DELETE(req, { params }) {
  const { ref, attId } = await params
  const gate = await gateCase(ref)
  if (gate.error) return gate.error
  const { orgId, caseRow, session } = gate

  // ยืนยันว่าไฟล์ใบนี้อยู่ในเคสที่ gate ผ่านมาจริง — attId เดาเลขได้ ห้ามเชื่อ path อย่างเดียว
  const att = await getAttachmentById(orgId, attId)
  if (!att || att.case_id !== caseRow.id) return Response.json({ error: 'Not found' }, { status: 404 })

  await deleteAttachment(orgId, attId)
  await deleteCaseFiles([att.file_path])

  logAction({
    orgId, app: 'cases', action: 'case.attachment_deleted',
    actorId: session.user.userId, targetId: caseRow.ref,
    meta: { attachment_id: Number(attId), original_name: att.original_name || null, mime: att.mime || null },
  })

  return Response.json({ ok: true })
}
