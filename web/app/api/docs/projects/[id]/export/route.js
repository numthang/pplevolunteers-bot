import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getDocProjectById } from '@/db/docs/projects.js'
import { getEntriesByProject, getEntryById, getSignatureByEntryId } from '@/db/docs/entries.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import fs from 'fs'
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
    const project = await getDocProjectById(id)
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const entries = await getEntriesByProject(id)
    const targets = onlySigned ? entries.filter(e => e.status === 'signed') : entries
    if (!targets.length) {
      return Response.json({ error: 'ไม่มีรายการที่เซ็นแล้ว' }, { status: 422 })
    }

    const merged = await PDFDocument.create()
    merged.registerFontkit(fontkit)
    const fontBytes = fs.readFileSync(path.join(process.cwd(), '..', 'assets', 'fonts', 'GoogleSans-Medium.ttf'))
    const font = await merged.embedFont(fontBytes, { subset: true })
    const headerText = project.event_name ?? project.project_name ?? ''

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
          if (headerText) {
            const { width } = p.getSize()
            let size = 7
            const maxW = width - 16
            let tw = font.widthOfTextAtSize(headerText, size)
            if (tw > maxW) { size = size * maxW / tw; tw = maxW }   // ย่อ font ถ้าชื่อยาวเกินหน้า
            p.drawText(headerText, {
              x: (width - tw) / 2,
              y: 12,                                                // footer ขอบล่าง จางๆ
              size,
              font,
              color: rgb(0.6, 0.6, 0.6),
            })
          }
        }
      } catch (err) {
        errors.push({ id: row.id, error: err.message })
      }
    }

    if (errors.length === targets.length) {
      return Response.json({ error: 'ทุกรายการ generate ไม่ได้', errors }, { status: 500 })
    }

    const bytes    = await merged.save()
    const buf      = Buffer.from(bytes)
    // HTTP header เป็น latin1 → ชื่อไทยต้อง encode: ASCII fallback + filename* (RFC 5987)
    const utf8Name = encodeURIComponent(`docs-${(project.event_name ?? `project-${id}`)}.pdf`)

    return new Response(buf, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="docs-${id}.pdf"; filename*=UTF-8''${utf8Name}`,
        'Content-Length':      String(buf.length),
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/projects/:id/export]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
