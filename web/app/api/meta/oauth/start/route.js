import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { BASE_URL } from '@/lib/baseUrl.js'
import { getMetaApp } from '@/lib/socialAppCreds.js'

const REDIRECT_URI = `${BASE_URL}/api/meta/oauth/callback`
const SCOPES      = [
  'pages_manage_posts',
  'pages_show_list',
  'pages_manage_metadata',
  'instagram_content_publish',
  'business_management',
].join(',')

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const guildId   = searchParams.get('guild_id')
  const visibility = searchParams.get('visibility') || 'public'

  if (!guildId) return Response.json({ error: 'guild_id required' }, { status: 400 })

  const { access } = await getEffectiveIdentity(session)
  const canManage = canManageSocialGuild(access)

  // public account → ต้องเป็น manager; private → ทุกคน connect ได้
  if (visibility === 'public' && !canManage) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // creds เป็นขององค์กร (org_config) — guild ใช้เพื่อหา org · fallback dc_guild_config อยู่ในตัว helper
  const app = await getMetaApp({ guildId })
  if (!app) {
    return Response.json({ error: `องค์กรนี้ยังไม่ได้ตั้งค่า Meta App — ตั้ง Meta App ID + Secret ที่ /bot/platforms ก่อน` }, { status: 400 })
  }

  const state = Buffer.from(JSON.stringify({
    guildId,
    userId: session.user.discordId,
    visibility,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = new URL('https://www.facebook.com/v22.0/dialog/oauth')
  oauthUrl.searchParams.set('client_id', app.app_id)
  oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  oauthUrl.searchParams.set('scope', SCOPES)
  oauthUrl.searchParams.set('state', state)
  oauthUrl.searchParams.set('response_type', 'code')

  return Response.redirect(oauthUrl.toString())
}
