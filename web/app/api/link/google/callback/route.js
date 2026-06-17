import { verifyLinkState } from '@/lib/linkState.js'
import { linkIdentity } from '@/db/userIdentities.js'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const base  = process.env.NEXTAUTH_URL

  if (!code || !state) return Response.redirect(`${base}/profile?link_error=missing_params`)

  let discordId
  try {
    discordId = verifyLinkState(state)
  } catch {
    return Response.redirect(`${base}/profile?link_error=invalid_state`)
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  `${base}/api/link/google/callback`,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'token exchange failed')

    // decode id_token → sub (Google user ID)
    const [, payloadB64] = tokenData.id_token.split('.')
    const { sub } = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (!sub) throw new Error('no sub in id_token')

    await linkIdentity(discordId, 'google', sub)
    return Response.redirect(`${base}/profile?link_success=google`)
  } catch (err) {
    console.error('[link/google/callback]', err.message)
    const errKey = err.code === 'already_taken' ? 'already_taken' : 'google_failed'
    return Response.redirect(`${base}/profile?link_error=${errKey}`)
  }
}
