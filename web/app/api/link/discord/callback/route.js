import { verifyLinkState } from '@/lib/linkState.js'
import { linkDiscordToUser } from '@/db/userIdentities.js'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const base  = process.env.NEXTAUTH_URL

  if (!code || !state) return Response.redirect(`${base}/profile?link_error=missing_params`)

  let userId
  try {
    userId = verifyLinkState(state)
  } catch {
    return Response.redirect(`${base}/profile?link_error=invalid_state`)
  }

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${base}/api/link/discord/callback`,
        client_id:     process.env.DISCORD_OAUTH_CLIENT_ID,
        client_secret: process.env.DISCORD_OAUTH_CLIENT_SECRET,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'token exchange failed')

    const meRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    })
    const me = await meRes.json()
    if (!meRes.ok || !me.id) throw new Error('failed to fetch discord user')

    // discord นี้เป็นของบัญชีเก่าอยู่แล้ว → ยุบบัญชีปัจจุบันเข้าไป (ไม่ block แล้ว)
    const { merged } = await linkDiscordToUser(userId, me.id, me.username || null)

    // merged = users.id ของเขาเปลี่ยนไปแล้ว แต่ JWT ยังถือ id เดิมที่เพิ่งถูกลบ
    // → ต้องผ่านหน้าที่สั่ง refresh session ก่อน ห้ามส่งกลับ /profile ตรงๆ ไม่งั้นเจอ user ผี
    if (merged) return Response.redirect(`${base}/link/merged`)
    return Response.redirect(`${base}/profile?link_success=discord`)
  } catch (err) {
    console.error('[link/discord/callback]', err.message)
    const errKey = err.code === 'already_linked_other' ? 'already_linked_other'
                 : String(err.message || '').startsWith('merge_') ? 'merge_failed'
                 : 'discord_failed'
    return Response.redirect(`${base}/profile?link_error=${errKey}`)
  }
}
