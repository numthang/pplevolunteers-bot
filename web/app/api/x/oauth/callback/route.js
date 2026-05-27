import { cookies } from 'next/headers'
import pool from '@/db/index.js'
import https from 'https'
import crypto from 'crypto'

const API_KEY    = process.env.X_API_KEY
const API_SECRET = process.env.X_API_SECRET
const BASE_URL   = process.env.NEXTAUTH_URL || 'https://pplethai.org'

function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function buildAuthHeader(oauthToken, oauthVerifier, tokenSecret) {
  const o = {
    oauth_consumer_key:     API_KEY,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            oauthToken,
    oauth_verifier:         oauthVerifier,
    oauth_version:          '1.0',
  }
  const base   = `POST&${pct('https://api.twitter.com/oauth/access_token')}&${pct(Object.keys(o).sort().map(k => `${pct(k)}=${pct(o[k])}`).join('&'))}`
  const sigKey = `${pct(API_SECRET)}&${pct(tokenSecret)}`
  o.oauth_signature = crypto.createHmac('sha1', sigKey).update(base).digest('base64')
  return 'OAuth ' + Object.keys(o).sort().map(k => `${pct(k)}="${pct(o[k])}"`).join(', ')
}

function xPost(path, authHeader, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.twitter.com', path, method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const oauthToken    = searchParams.get('oauth_token')
  const oauthVerifier = searchParams.get('oauth_verifier')
  const denied        = searchParams.get('denied')

  if (denied) return Response.redirect(`${BASE_URL}/social?error=denied`)
  if (!oauthToken || !oauthVerifier) return Response.redirect(`${BASE_URL}/social?error=missing`)

  const cookieStore = await cookies()
  const raw = cookieStore.get('x_oauth_pending')?.value
  if (!raw) return Response.redirect(`${BASE_URL}/social?error=expired`)

  let state
  try { state = JSON.parse(raw) } catch { return Response.redirect(`${BASE_URL}/social?error=invalid`) }

  const { token_secret, guild_id, discord_id, visibility } = state

  // แลก verifier เป็น access token
  const auth = buildAuthHeader(oauthToken, oauthVerifier, token_secret)
  const body = `oauth_token=${oauthToken}&oauth_verifier=${oauthVerifier}`
  const res  = await xPost('/oauth/access_token', auth, body)

  if (res.status !== 200) return Response.redirect(`${BASE_URL}/social?error=token`)

  const result = Object.fromEntries(res.body.split('&').map(p => p.split('=')))
  const { oauth_token: accessToken, oauth_token_secret: accessTokenSecret, screen_name: screenName } = result

  const creds = JSON.stringify({
    api_key:              API_KEY,
    api_secret:           API_SECRET,
    access_token:         accessToken,
    access_token_secret:  accessTokenSecret,
  })

  await pool.execute(
    `INSERT INTO dc_social_accounts (user_discord_id, guild_id, name, platform, social_id, access_token, visibility)
     VALUES (?, ?, ?, 'x', ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), access_token = VALUES(access_token), visibility = VALUES(visibility)`,
    [discord_id, guild_id || null, `@${screenName}`, screenName, creds, visibility]
  )

  // ล้าง cookie
  cookieStore.set('x_oauth_pending', '', { maxAge: 0, path: '/' })

  return Response.redirect(`${BASE_URL}/social?connected=x&account=${encodeURIComponent(screenName)}`)
}
