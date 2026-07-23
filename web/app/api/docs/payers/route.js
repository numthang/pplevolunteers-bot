import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getOrgId } from '@/lib/orgContext.js'
import { getPayers, getPayersForEvent, addPayer } from '@/db/docs/payers.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const orgId = await getOrgId(session)
  const province = new URL(req.url).searchParams.get('province')
  const payers = province
    ? await getPayersForEvent(orgId, province)
    : await getPayers(orgId)
  return Response.json({ data: payers })
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const orgId = await getOrgId(session)
    const { userId: rawUserId, displayName, position, sortOrder } = await req.json()
    const userId = rawUserId ? Number(rawUserId) : null

    if (!userId || !displayName || !position) {
      return Response.json({ error: 'userId, displayName, position จำเป็นต้องมี' }, { status: 400 })
    }

    const payer = await addPayer(orgId, { userId, displayName, position, sortOrder })
    return Response.json({ data: payer }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/docs/payers]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
