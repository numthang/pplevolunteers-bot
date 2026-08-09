/**
 * GET /api/threads/oauth/start — เริ่ม OAuth ของ Threads
 *
 * ทำไมแยกจาก /api/meta/oauth/* : Threads เป็น **OAuth คนละดันซ์** ไม่ใช่แค่ scope ที่ขาด —
 * authorize ที่ threads.net (ไม่ใช่ facebook.com/dialog/oauth) · แลก token ที่ graph.threads.net
 * · คนกดอนุมัติในฐานะ "บัญชี Threads" ไม่ใช่ในฐานะเพจ FB → ยัดรวมปุ่ม Connect Meta ไม่ได้
 * (โมเดลของหน้า /org/settings/social คือ 1 ปุ่ม = 1 OAuth flow · X ก็แยกด้วยเหตุผลเดียวกัน)
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { canManageSocialGuild } from '@/lib/roles.js'
import { getEffectiveIdentity } from '@/lib/getEffectiveRoles.js'
import { BASE_URL } from '@/lib/baseUrl.js'
import { getThreadsApp } from '@/lib/socialAppCreds.js'
import { resolveOAuthScope } from '@/lib/socialOAuthScope.js'

const REDIRECT_URI = `${BASE_URL}/api/threads/oauth/callback`
const SCOPES = ['threads_basic', 'threads_content_publish'].join(',')

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const visibility = searchParams.get('visibility') || 'public'

  // scope = org (จาก session) · guild_id เป็น metadata ที่ไม่ส่งก็ได้
  const scope = await resolveOAuthScope(session, searchParams.get('guild_id'))
  if (scope.error) return Response.json({ error: scope.error }, { status: scope.status })
  const { orgId, guildId } = scope

  const { access } = await getEffectiveIdentity(session)
  // public account → ต้องเป็น manager · private → ทุกคน connect ได้ (ตรงกับ /api/meta/oauth/start)
  if (visibility === 'public' && !canManageSocialGuild(access)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ⚠️ Threads ใช้ App ID/Secret คนละชุดกับ Facebook — หาที่ Dashboard → use case "Threads API" → Settings
  const app = await getThreadsApp({ orgId, guildId })
  if (!app) {
    return Response.json(
      { error: 'ยังไม่ได้ตั้ง Threads App ID + Threads App Secret — ตั้งที่ /org/settings/social (คนละชุดกับ Meta App ID/Secret)' },
      { status: 400 }
    )
  }

  const state = Buffer.from(JSON.stringify({
    orgId,
    guildId,
    userId: session.user.discordId,
    visibility,
    ts: Date.now(),
  })).toString('base64url')

  const oauthUrl = new URL('https://threads.net/oauth/authorize')
  oauthUrl.searchParams.set('client_id', app.app_id)
  oauthUrl.searchParams.set('redirect_uri', REDIRECT_URI)
  oauthUrl.searchParams.set('scope', SCOPES)
  oauthUrl.searchParams.set('state', state)
  oauthUrl.searchParams.set('response_type', 'code')

  return Response.redirect(oauthUrl.toString())
}
