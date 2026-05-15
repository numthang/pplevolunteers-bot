import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'

const APP_ID      = process.env.META_APP_ID
const REDIRECT_URI = `${process.env.NEXTAUTH_URL || 'https://pplevolunteers.org'}/api/meta/oauth/callback`
const SCOPES      = [
  'pages_manage_posts',
  'pages_show_list',
  'pages_manage_metadata',
  'instagram_content_publish',
  'business_management',
].join(',')

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get('guild_id')
  if (!guildId) return Response.json({ error: 'guild_id required' }, { status: 400 })

  if (!APP_ID) return Response.json({ error: 'META_APP_ID not configured' }, { status: 500 })

  const state = Buffer.from(JSON.stringify({ guildId, ts: Date.now() })).toString('base64url')

  const oauthUrl = new URL('https://www.facebook.com/v22.0/dialog/oauth')
  oauthUrl.searchParams.set('client_id', APP_ID)
  oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  oauthUrl.searchParams.set('scope', SCOPES)
  oauthUrl.searchParams.set('state', state)
  oauthUrl.searchParams.set('response_type', 'code')

  return Response.redirect(oauthUrl.toString())
}
