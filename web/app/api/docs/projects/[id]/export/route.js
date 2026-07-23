import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getDocProjectById } from '@/db/docs/projects.js'
import { getEntriesByProject, getEntryById, getSignatureByEntryId } from '@/db/docs/entries.js'
import { getAttachmentsByProject } from '@/db/docs/attachments.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'
import { buildFooterImage } from '@/lib/idCard.js'
import { readFile, getUploadPath } from '@/lib/cropDocument.js'
import { PDFDocument } from 'pdf-lib'
import path from 'path'

/**
 * GET /api/docs/projects/[id]/export
 * รวมใบสำคัญทุกใบที่เซ็นแล้วเป็น PDF เดียว (เปิดมาพิมพ์ได้เลย) + ชื่อโครงการหัวกระดาษทุกแผ่น
 * Query: ?status=signed (default) | all
 */
export async function GET(req, { params }) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const onlySigned = new URL(req.url).searchParams.get('status') !== 'all'

  try {
    const project = await getDocProjectById(await getOrgId(session), id)
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const entries = await getEntriesByProject(id)
    const filtered = onlySigned ? entries.filter(e => e.status === 'signed') : entries
    const targets = filtered.filter(e => e.member_discord_id != null)
    const skippedCount = filtered.length - targets.length
    if (!targets.length) {
      return Response.json({ error: onlySigned ? 'ไม่มีรายการที่เซ็นแล้ว' : 'ไม่มีรายการที่พร้อม export (ทุกรายการยังไม่ระบุผู้รับ)' }, { status: 422 })
    }

    const merged = await PDFDocument.create()
    const headerText = project.event_name ?? project.project_name ?? ''

    // pre-render footer เป็น PNG ครั้งเดียว — แก้ pdf-lib drawText Thai render ผิด
    let footerImg = null
    const FOOTER_H = 14  // pt
    if (headerText) {
      const footerPng = await buildFooterImage(headerText)
      footerImg = await merged.embedPng(footerPng)
    }

    const errors = []
    for (const row of targets) {
      try {
        const entry  = await getEntryById(row.id)
        const recSig = await getSignatureByEntryId(row.id, 'recipient')
        const paySig = await getSignatureByEntryId(row.id, 'payer')
        const pdf    = await generateEntryPdf(entry, {
          signatureBase64:      recSig?.signature_base64 ?? null,
          payerSignatureBase64: paySig?.signature_base64 ?? null,
          payerDisplayName:     entry.payer_display_name ?? null,
          payerPosition:        entry.payer_position     ?? null,
        })

        const src   = await PDFDocument.load(pdf)
        const pages = await merged.copyPages(src, src.getPageIndices())
        for (const p of pages) {
          merged.addPage(p)
          if (footerImg) {
            const { width } = p.getSize()
            p.drawImage(footerImg, { x: 0, y: 0, width, height: FOOTER_H })
          }
        }
      } catch (err) {
        errors.push({ id: row.id, error: err.message })
      }
    }

    if (errors.length === targets.length) {
      return Response.json({ error: 'ทุกรายการ generate ไม่ได้', errors }, { status: 500 })
    }

    // แนบ attachment images ต่อท้าย (A4 portrait)
    const A4_W = 595.28, A4_H = 841.89
    const attachments = await getAttachmentsByProject(id)
    for (const att of attachments) {
      try {
        const buf = await readFile(path.join(getUploadPath(), att.file_path))
        const img = await merged.embedJpg(buf)
        const page = merged.addPage([A4_W, A4_H])
        page.drawImage(img, { x: 0, y: 0, width: A4_W, height: A4_H })
      } catch (err) {
        console.error(`[export] attachment ${att.id}:`, err.message)
      }
    }

    merged.setTitle(`ใบสำคัญรับเงินโครงการ${project.event_name ? ` ${project.event_name}` : ''}`)
    const bytes    = await merged.save()
    const buf      = Buffer.from(bytes)
    // HTTP header เป็น latin1 → ชื่อไทยต้อง encode: ASCII fallback + filename* (RFC 5987)
    const utf8Name = encodeURIComponent(`ใบสำคัญรับเงินโครงการ${project.event_name ? ` ${project.event_name}` : ''}.pdf`)

    const responseHeaders = {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `inline; filename="docs-${id}.pdf"; filename*=UTF-8''${utf8Name}`,
      'Content-Length':      String(buf.length),
    }
    if (skippedCount > 0) responseHeaders['X-Skipped-Count'] = String(skippedCount)

    return new Response(buf, { headers: responseHeaders })
  } catch (err) {
    console.error('[GET /api/docs/projects/:id/export]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
