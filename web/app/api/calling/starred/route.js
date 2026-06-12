import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import {
  getFavorites,
  getFavoritesEnriched,
  getFavoritesDisplay,
  getFavoriteSet,
  addFavorite,
  removeFavorite,
  updateFavoriteNote,
} from '@/db/calling/starred.js'
import { getGuildId } from '@/lib/guildContext.js'

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const GUILD_ID = await getGuildId(session)

  const { searchParams } = new URL(req.url)
  const enriched    = searchParams.get('enriched') === 'true'
  const display     = searchParams.get('display') === 'true'
  const idsOnly     = searchParams.get('idsOnly') === 'true'
  const contactType = searchParams.get('contactType') || 'member'
  const name        = searchParams.get('name') || ''
  const limit       = Math.min(parseInt(searchParams.get('limit') || '100'), 200)
  const offset      = parseInt(searchParams.get('offset') || '0')

  try {
    if (idsOnly) {
      const set = await getFavoriteSet(GUILD_ID, session.user.discordId, contactType)
      return Response.json({ success: true, data: Array.from(set) })
    }
    if (display) {
      const rows = await getFavoritesDisplay(GUILD_ID, session.user.discordId, { name, limit, offset })
      return Response.json({ success: true, data: rows })
    }
    const rows = enriched
      ? await getFavoritesEnriched(GUILD_ID, session.user.discordId)
      : await getFavorites(GUILD_ID, session.user.discordId)
    return Response.json({ success: true, data: rows })
  } catch (error) {
    console.error('[GET /api/calling/starred]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const GUILD_ID = await getGuildId(session)
  try {
    const { memberId, contactType = 'member', note = null } = await req.json()
    if (!memberId) {
      return Response.json({ error: 'memberId is required' }, { status: 400 })
    }
    if (!['member', 'contact'].includes(contactType)) {
      return Response.json({ error: 'contactType must be "member" or "contact"' }, { status: 400 })
    }
    await addFavorite(GUILD_ID, session.user.discordId, memberId, contactType, note)
    return Response.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/calling/starred]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const GUILD_ID = await getGuildId(session)
  try {
    const { searchParams } = new URL(req.url)
    const memberId    = searchParams.get('memberId')
    const contactType = searchParams.get('contactType') || 'member'
    if (!memberId) {
      return Response.json({ error: 'memberId is required' }, { status: 400 })
    }
    await removeFavorite(GUILD_ID, session.user.discordId, memberId, contactType)
    return Response.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/calling/starred]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(req) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.discordId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const GUILD_ID = await getGuildId(session)
  try {
    const { memberId, contactType = 'member', note } = await req.json()
    if (!memberId) {
      return Response.json({ error: 'memberId is required' }, { status: 400 })
    }
    await updateFavoriteNote(GUILD_ID, session.user.discordId, memberId, contactType, note ?? null)
    return Response.json({ success: true })
  } catch (error) {
    console.error('[PATCH /api/calling/starred]', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
