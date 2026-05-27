// ⚠️  อัปเดต Callback URI ใน X Developer Portal ให้ชี้มาที่:
//     https://pplevolunteers.org/api/x/oauth/callback
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { cookies } from 'next/headers'
import pool from '@/db/index.js'
import https from 'https'
import crypto from 'crypto'

const BASE_URL = process.env.NEXTAUTH_URL || 'https://pplevolunteers.org'
const CALLBACK = `${BASE_URL}/api/x/oauth/callback`

function pct(str) {
  return encodeURIComponent(String(str)).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

function buildAuthHeader(apiKey, apiSecret, params) {
  const o = {
    oauth_consumer_key:     apiKey,
    oauth_nonce:            crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_version:          '1.0',
    ...params,
  }
  const base    = `POST&${pct('https://api.twitter.com/oauth/request_token')}&${pct(Object.keys(o).sort().map(k => `${pct(k)}=${pct(o[k])}`).join('&'))}`
  const sigKey  = `${pct(apiSecret)}&`
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

async function getGuildXApp(guildId) {
  const [rows] = await pool.execute(
    "SELECT `key`, value FROM dc_guild_config WHERE guild_id = ? AND `key` IN ('x_consumer_key', 'x_consumer_secret')",
    [guildId]
  )
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]))
  if (!m.x_consumer_key || !m.x_consumer_secret) return null
  return { api_key: m.x_consumer_key, api_secret: m.x_consumer_secret }
}

export async function GET(req) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.redirect(`${BASE_URL}/login`)

  const { searchParams } = new URL(req.url)
  const guildId    = searchParams.get('guild_id') || ''
  const visibility = searchParams.get('visibility') || 'private'

  if (!guildId) {
    return Response.json({ error: 'guild_id required' }, { status: 400 })
  }

  const app = await getGuildXApp(guildId)
  if (!app) {
    return Response.json({ error: `Guild นี้ยังไม่ได้ตั้งค่า X App — ตั้งค่า x_consumer_key/x_consumer_secret ใน /bot/social/accounts ก่อน` }, { status: 400 })
  }

  const callbackEncoded = encodeURIComponent(CALLBACK)
  const auth = buildAuthHeader(app.api_key, app.api_secret, { oauth_callback: CALLBACK })
  const res  = await xPost('/oauth/request_token', auth, `oauth_callback=${callbackEncoded}`)

  if (res.status !== 200) {
    return Response.json({ error: 'X request token ไม่สำเร็จ', detail: res.body }, { status: 502 })
  }

  const params = Object.fromEntries(res.body.split('&').map(p => p.split('=')))
  const { oauth_token, oauth_token_secret } = params

  // เก็บ token_secret + state ใน cookie (อายุ 5 นาที)
  const cookieStore = await cookies()
  cookieStore.set('x_oauth_pending', JSON.stringify({
    token_secret: oauth_token_secret,
    guild_id:     guildId,
    discord_id:   session.user.discordId,
    visibility,
  }), { httpOnly: true, sameSite: 'lax', maxAge: 300, path: '/' })

  return Response.redirect(`https://twitter.com/oauth/authorize?oauth_token=${oauth_token}`)
}
