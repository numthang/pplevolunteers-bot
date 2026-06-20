import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getDocProjectById } from '@/db/docs/projects.js'
import { getEntriesByProject, getEntryById, getSignatureByEntryId, markPrinted } from '@/db/docs/entries.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'
import PizZip from 'pizzip'

/**
 * GET /api/docs/projects/[id]/export
 * Generate PDFs for all signed entries in a project and return as ZIP
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
  const { searchParams } = new URL(req.url)
  const onlySigned = searchParams.get('status') !== 'all'

  try {
    const project = await getDocProjectById(id)
    if (!project) return Response.json({ error: 'Not found' }, { status: 404 })

    const entries = await getEntriesByProject(id)
    const targets = onlySigned
      ? entries.filter(e => e.status === 'signed' || e.status === 'printed')
      : entries

    if (!targets.length) {
      return Response.json({ error: 'ไม่มีรายการที่เซ็นแล้ว' }, { status: 422 })
    }

    const zip = new PizZip()
    const errors = []

    for (const row of targets) {
      try {
        const entry = await getEntryById(row.id)
        const sig   = await getSignatureByEntryId(row.id)
        const pdf   = await generateEntryPdf(entry, {
          signatureBase64: sig?.signature_base64 ?? null,
        })

        const name = (entry.display_name ?? 'unknown').replace(/[^\w฀-๿]/g, '_')
        zip.file(`${String(entry.id).padStart(4, '0')}-${entry.item_type}-${name}.pdf`, pdf)

        await markPrinted(row.id).catch(() => {})
      } catch (err) {
        errors.push({ id: row.id, error: err.message })
      }
    }

    if (errors.length === targets.length) {
      return Response.json({ error: 'ทุกรายการ generate ไม่ได้', errors }, { status: 500 })
    }

    const zipBuf  = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
    const safeName = (project.event_name ?? `project-${id}`).replace(/[^\w฀-๿]/g, '_')

    return new Response(zipBuf, {
      headers: {
        'Content-Type':        'application/zip',
        'Content-Disposition': `attachment; filename="docs-${safeName}.zip"`,
        'Content-Length':      String(zipBuf.length),
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/projects/:id/export]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
