import { cookies } from 'next/headers'
import pool from '@/db/index.js'
import https from 'https'
import crypto from 'crypto'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://pplethai.org'

function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

async function getGuildXApp(guildId) {
  const [rows] = await pool.execute(
    "SELECT `key`, value FROM dc_guild_config WHERE guild_id = ? AND `key` IN ('x_consumer_key', 'x_consumer_secret')",
    [guildId]
  )
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]))
  if (!m.x_consumer_key || !m.x_consumer_secret) return null
  return { api_key: m.x_consumer_key, api_secret: m.x_consumer_secret }
}

function buildAuthHeader(apiKey, apiSecret, oauthToken, oauthVerifier, tokenSecret) {
  const o = {
    oauth_consumer_key:     apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_token:            oauthToken,
    oauth_verifier:         oauthVerifier,
    oauth_version:          '1.0',
  }
  const base   = `POST&${pct('https://api.twitter.com/oauth/access_token')}&${pct(Object.keys(o).sort().map(k => `${pct(k)}=${pct(o[k])}`).join('&'))}`
  const sigKey = `${pct(apiSecret)}&${pct(tokenSecret)}`
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

  if (denied) return Response.redirect(`${BASE_URL}/bot/social/accounts?error=denied`)
  if (!oauthToken || !oauthVerifier) return Response.redirect(`${BASE_URL}/bot/social/accounts?error=missing`)

  const cookieStore = await cookies()
  const raw = cookieStore.get('x_oauth_pending')?.value
  if (!raw) return Response.redirect(`${BASE_URL}/bot/social/accounts?error=expired`)

  let state
  try { state = JSON.parse(raw) } catch { return Response.redirect(`${BASE_URL}/bot/social/accounts?error=invalid`) }

  const { token_secret, guild_id, discord_id, visibility } = state

  if (!guild_id) return Response.redirect(`${BASE_URL}/bot/social/accounts?error=no_guild`)
  const app = await getGuildXApp(guild_id)
  if (!app) return Response.redirect(`${BASE_URL}/bot/social/accounts?error=app_not_configured`)

  // แลก verifier เป็น access token
  const auth = buildAuthHeader(app.api_key, app.api_secret, oauthToken, oauthVerifier, token_secret)
  const body = `oauth_token=${oauthToken}&oauth_verifier=${oauthVerifier}`
  const res  = await xPost('/oauth/access_token', auth, body)

  if (res.status !== 200) return Response.redirect(`${BASE_URL}/bot/social/accounts?error=token`)

  const result = Object.fromEntries(res.body.split('&').map(p => p.split('=')))
  const { oauth_token: accessToken, oauth_token_secret: accessTokenSecret, screen_name: screenName } = result

  const creds = JSON.stringify({
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

  return Response.redirect(`${BASE_URL}/bot/social/accounts?connected=x&account=${encodeURIComponent(screenName)}`)
}
