import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { getUserScope, isAdmin, isProvincialCoordinator, isRegionalCoordinator } from '@/lib/callingAccess.js'
import { getContactsList, createContact } from '@/db/calling/contacts.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles } = await getEffectiveIdentity(session)
  const scope = getUserScope(roles)

  const { searchParams } = new URL(req.url)
  const province = searchParams.get('province') || null
  const keyword  = searchParams.get('keyword') || null
  const limit    = parseInt(searchParams.get('limit') || '100')
  const offset   = parseInt(searchParams.get('offset') || '0')

  // If not admin, must have calling access
  if (scope !== null && scope.length === 0) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Scope-limit province filter
  const effectiveProvince = scope === null ? (province || null) : (province && scope.includes(province) ? province : null)

  try {
    const contacts = await getContactsList(process.env.GUILD_ID, {
      province: effectiveProvince,
      keyword,
      limit,
      offset,
    })
    return Response.json({ data: contacts })
  } catch (err) {
    console.error('[GET /api/calling/contacts]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { roles } = await getEffectiveIdentity(session)
  const scope = getUserScope(roles)

  if (scope !== null && scope.length === 0) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { first_name, last_name, phone, email, line_id, category, province, amphoe, tambon, note } = body

    if (!first_name || !last_name) {
      return Response.json({ error: 'first_name and last_name are required' }, { status: 400 })
    }

    // Province must be within caller's scope
    if (scope !== null && province && !scope.includes(province)) {
      return Response.json({ error: 'Forbidden: province out of scope' }, { status: 403 })
    }

    const id = await createContact({
      guild_id: process.env.GUILD_ID,
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
      created_by: session.user.discordId,
    })

    return Response.json({ success: true, data: { id } }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/calling/contacts]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
