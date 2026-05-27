import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { isAdmin } from '@/lib/roles.js'
import pool from '@/db/index.js'

const REDIRECT_URI = `${process.env.NEXTAUTH_URL || 'https://pplevolunteers.org'}/api/meta/oauth/callback`
const SCOPES      = [
  'pages_manage_posts',
  'pages_show_list',
  'pages_manage_metadata',
  'instagram_content_publish',
  'business_management',
].join(',')

async function getGuildMetaApp(guildId) {
  const [rows] = await pool.execute(
    "SELECT `key`, value FROM dc_guild_config WHERE guild_id = ? AND `key` = 'meta_app_id'",
    [guildId]
  )
  return rows[0]?.value || null
}

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin(session.user.roles)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const guildId = searchParams.get('guild_id')
  if (!guildId) return Response.json({ error: 'guild_id required' }, { status: 400 })

  const appId = await getGuildMetaApp(guildId)
  if (!appId) {
    return Response.json({ error: `Guild นี้ยังไม่ได้ตั้งค่า Meta App — ตั้งค่า meta_app_id ใน /bot/social/accounts ก่อน` }, { status: 400 })
  }

  const state = Buffer.from(JSON.stringify({ guildId, userId: session.user.discordId, ts: Date.now() })).toString('base64url')

  const oauthUrl = new URL('https://www.facebook.com/v22.0/dialog/oauth')
  oauthUrl.searchParams.set('client_id', appId)
  oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  oauthUrl.searchParams.set('scope', SCOPES)
  oauthUrl.searchParams.set('state', state)
  oauthUrl.searchParams.set('response_type', 'code')

  return Response.redirect(oauthUrl.toString())
}
