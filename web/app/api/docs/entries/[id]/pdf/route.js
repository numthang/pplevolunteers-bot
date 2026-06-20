import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getEntryById, getSignatureByEntryId, markPrinted } from '@/db/docs/entries.js'
import { generateEntryPdf } from '@/lib/generatePdf.js'

/**
 * GET /api/docs/entries/[id]/pdf
 * Generate and stream PDF for a single entry
 * Query params: ?mark=printed — updates status to printed after generating
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
  const markAsPrinted = searchParams.get('mark') === 'printed'

  try {
    const entry = await getEntryById(id)
    if (!entry) return Response.json({ error: 'Not found' }, { status: 404 })

    const sig     = await getSignatureByEntryId(id, 'recipient')
    const paySig  = await getSignatureByEntryId(id, 'payer')
    const pdf = await generateEntryPdf(entry, {
      signatureBase64:      sig?.signature_base64    ?? null,
      payerSignatureBase64: paySig?.signature_base64 ?? null,
      payerDisplayName:     entry.payer_display_name  ?? null,
      payerPosition:        entry.payer_position      ?? null,
    })

    if (markAsPrinted) {
      await markPrinted(id).catch(() => {})
    }

    const filename = `doc-${entry.id}-${(entry.display_name ?? 'unknown').replace(/[^\w]/g, '_')}.pdf`
    return new Response(pdf, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length':      String(pdf.length),
      },
    })
  } catch (err) {
    console.error('[GET /api/docs/entries/:id/pdf]', err)
    return Response.json({ error: err.message || 'PDF generation failed' }, { status: 500 })
  }
}
