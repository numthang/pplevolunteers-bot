import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveOrgIdentity } from '@/lib/orgAccess.js'
import { getUserScope, isAdmin, isProvincialCoordinator, isRegionalCoordinator } from '@/lib/callingAccess.js'
import { getContactsList, createContact } from '@/db/calling/contacts.js'
import { getOrgId } from '@/lib/orgContext.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  const scope = getUserScope(access, session.user.primary_province)

  const { searchParams } = new URL(req.url)
  const province = searchParams.get('province') || null
  const keyword  = searchParams.get('keyword') || null
  const limit    = parseInt(searchParams.get('limit') || '100')
  const offset   = parseInt(searchParams.get('offset') || '0')

  // If not admin, must have calling access
  if (scope !== null && scope.length === 0) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const showContacts = isAdmin(access) || isRegionalCoordinator(access) || isProvincialCoordinator(access)

  // Scope-limit province filter
  // scope === null → admin, no filter; scope = array → restrict to those provinces
  const effectiveProvinces = scope === null
    ? null
    : province
      ? (scope.includes(province) ? [province] : [])
      : scope

  // Province requested is outside scope → return empty
  if (Array.isArray(effectiveProvinces) && effectiveProvinces.length === 0) {
    return Response.json({ data: [], contacts_hidden: !showContacts })
  }

  try {
    const orgId = await getOrgId(session)
    let contacts = await getContactsList(orgId, {
      provinces: effectiveProvinces,
      keyword,
      limit,
      offset,
    })
    if (!showContacts) {
      contacts = contacts.map(({ phone, line_id, email, ...rest }) => rest)
    }
    return Response.json({ data: contacts, contacts_hidden: !showContacts })
  } catch (err) {
    console.error('[GET /api/calling/contacts]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveOrgIdentity(session)
  const scope = getUserScope(access, session.user.primary_province)

  if (scope !== null && scope.length === 0) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note, specialty } = body

    if (!first_name) {
      return Response.json({ error: 'first_name is required' }, { status: 400 })
    }

    // Province must be within caller's scope
    if (scope !== null && province && !scope.includes(province)) {
      return Response.json({ error: 'Forbidden: province out of scope' }, { status: 403 })
    }

    const orgId = await getOrgId(session)
    const id = await createContact({
      guild_id: orgId,
      first_name,
      last_name,
      phone,
      email,
      line_id,
      category,
      province,
      amphoe,
      tambon,
      note,
      specialty,
      created_by: session.user.userId,
    })

    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/calling/contacts]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
