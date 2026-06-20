import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { canManageDocs } from '@/lib/docsAccess.js'
import { getGuildId } from '@/lib/guildContext.js'
import { getPayers, getPayersForEvent, addPayer } from '@/db/docs/payers.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const guildId = await getGuildId(session)
  const province = new URL(req.url).searchParams.get('province')
  const payers = province
    ? await getPayersForEvent(guildId, province)
    : await getPayers(guildId)
  return Response.json({ data: payers })
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { access } = await getEffectiveIdentity(session)
  if (!canManageDocs(access)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const guildId = await getGuildId(session)
    const { discordId, displayName, position, sortOrder } = await req.json()

    if (!discordId || !displayName || !position) {
      return Response.json({ error: 'discordId, displayName, position จำเป็นต้องมี' }, { status: 400 })
    }

    const payer = await addPayer(guildId, { discordId, displayName, position, sortOrder })
    return Response.json({ data: payer }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/docs/payers]', err)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
