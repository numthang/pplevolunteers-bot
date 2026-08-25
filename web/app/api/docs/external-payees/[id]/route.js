import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { isValidThaiId, digitsOnly } from '@/lib/thaiId.js'
import { getExternalPayeeById, updateExternalPayee, deleteExternalPayee } from '@/db/docs/externalPayees.js'

async function gate(session) {
  if (!session?.user?.userId) return { error: 'Unauthorized', status: 401 }
  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return { error: 'Forbidden', status: 403 }
  return { orgId: await getOrgId(session) }
}

export async function GET(_req, { params }) {
  const g = await gate(await getServerSession(authOptions))
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { id } = await params
  const payee = await getExternalPayeeById(Number(id), g.orgId)
  if (!payee) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true, data: payee })
}

export async function PATCH(req, { params }) {
  const g = await gate(await getServerSession(authOptions))
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  try {
    const { id } = await params
    const body = await req.json()
    if (body.id_number !== undefined) {
      const d = digitsOnly(body.id_number)
      if (d && !isValidThaiId(d)) {
        return Response.json({ error: 'เลขประจำตัว 13 หลักไม่ถูกต้อง' }, { status: 400 })
      }
    }
    const updated = await updateExternalPayee(Number(id), g.orgId, body)
    if (!updated) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json({ success: true, data: updated })
  } catch (err) {
    // ชนเลขซ้ำกับคนอื่นใน org เดียวกัน
    if (err.code === '23505') return Response.json({ error: 'เลขประจำตัวนี้มีในระบบแล้ว' }, { status: 409 })
    console.error('[PATCH /api/docs/external-payees/:id]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(_req, { params }) {
  const g = await gate(await getServerSession(authOptions))
  if (g.error) return Response.json({ error: g.error }, { status: g.status })

  const { id } = await params
  const result = await deleteExternalPayee(Number(id), g.orgId)
  if (result === 'in_use') {
    return Response.json({ error: 'ลบไม่ได้ — มีใบสำคัญรับเงินที่ออกให้คนนี้แล้ว' }, { status: 409 })
  }
  if (result === 'not_found') return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json({ success: true })
}
