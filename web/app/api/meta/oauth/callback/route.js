import pool from '@/db/index.js'

const REDIRECT_URI = `${process.env.NEXTAUTH_URL || 'https://pplevolunteers.org'}/api/meta/oauth/callback`

async function getGuildMetaApp(guildId) {
  const [rows] = await pool.execute(
    "SELECT `key`, value FROM dc_guild_config WHERE guild_id = ? AND `key` IN ('meta_app_id', 'meta_app_secret')",
    [guildId]
  )
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]))
  if (!m.meta_app_id || !m.meta_app_secret) return null
  return { app_id: m.meta_app_id, app_secret: m.meta_app_secret }
}

async function fbGet(url) {
  const res = await fetch(url)
  return res.json()
}

async function upsertSocialRow(userDiscordId, guildId, name, platform, socialId, accessToken, userToken, userTokenExpiresAt, visibility = 'public') {
  await pool.execute(
    `INSERT INTO dc_social_accounts (user_discord_id, guild_id, name, platform, social_id, access_token, user_token, user_token_expires_at, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), access_token = VALUES(access_token), user_token = VALUES(user_token), user_token_expires_at = VALUES(user_token_expires_at), visibility = VALUES(visibility)`,
    [userDiscordId, guildId, name, platform, socialId, accessToken, userToken, userTokenExpiresAt, visibility]
  )
}

function html(title, body) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 20px; background: #f9f9f9; color: #333; }
      h1 { color: #ff6a13; }
      ul { line-height: 2; }
      pre { background: #fff; border: 1px solid #ddd; padding: 12px; border-radius: 6px; white-space: pre-wrap; word-break: break-all; }
      a { color: #ff6a13; }
    </style>
    </head><body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  )
}

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  const stateRaw = searchParams.get('state')
  const fbError  = searchParams.get('error')

  if (fbError) {
    const desc = searchParams.get('error_description') || fbError
    return html('❌ OAuth ยกเลิก', `<h1>❌ OAuth ถูกยกเลิก</h1><p>${desc}</p>`)
  }

  if (!code || !stateRaw) {
    return html('❌ ข้อมูลไม่ครบ', '<h1>❌ ไม่มี code หรือ state</h1>')
  }

  let state
  try {
    state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString())
  } catch {
    return html('❌ State ไม่ถูกต้อง', '<h1>❌ State invalid</h1>')
  }

  if (Date.now() - state.ts > 10 * 60 * 1000) {
    return html('❌ หมดเวลา', '<h1>❌ OAuth session หมดอายุ กรุณาลองใหม่</h1>')
  }

  const app = await getGuildMetaApp(state.guildId)
  if (!app) {
    return html('❌ Config ไม่ครบ', `<h1>❌ Guild ${state.guildId} ยังไม่ได้ตั้งค่า meta_app_id / meta_app_secret ใน dc_guild_config</h1>`)
  }

  try {
    // 1. Exchange code → short-lived user token
    const tokenRes = await fbGet(
      `https://graph.facebook.com/v22.0/oauth/access_token` +
      `?client_id=${app.app_id}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${app.app_secret}&code=${code}`
    )
    if (tokenRes.error) throw new Error(`Token exchange: ${tokenRes.error.message}`)

    // 2. Exchange short-lived → long-lived user token
    const longRes = await fbGet(
      `https://graph.facebook.com/oauth/access_token` +
      `?grant_type=fb_exchange_token&client_id=${app.app_id}` +
      `&client_secret=${app.app_secret}&fb_exchange_token=${tokenRes.access_token}`
    )
    if (longRes.error) throw new Error(`Long-lived exchange: ${longRes.error.message}`)

    const expiresInSec = longRes.expires_in || 60 * 24 * 60 * 60 // default 60 days
    const userTokenExpiresAt = new Date(Date.now() + expiresInSec * 1000)
      .toISOString().slice(0, 19).replace('T', ' ')

    // 3. Get all page accounts + their tokens
    const accountsRes = await fbGet(
      `https://graph.facebook.com/v22.0/me/accounts` +
      `?fields=id,name,access_token&access_token=${longRes.access_token}`
    )
    if (accountsRes.error) throw new Error(`Accounts: ${accountsRes.error.message}`)

    const pages = accountsRes.data || []
    const results = []

    const userDiscordId = state.userId || null

    for (const page of pages) {
      // FB row: ใช้ page token, ไม่ต้องเก็บ user_token
      await upsertSocialRow(userDiscordId, state.guildId, page.name, 'fb', page.id, page.access_token, null, null, 'public')

      // IG row (ถ้ามี): ใช้ user_token, access_token ใส่ null
      const igRes = await fbGet(
        `https://graph.facebook.com/v22.0/${page.id}` +
        `?fields=instagram_business_account&access_token=${page.access_token}`
      )
      const igId = igRes.instagram_business_account?.id || null
      if (igId) {
        await upsertSocialRow(userDiscordId, state.guildId, page.name, 'ig', igId, null, longRes.access_token, userTokenExpiresAt, 'public')
      }

      results.push(`✅ <b>${page.name}</b>${igId ? ` + Instagram` : ''}`)
    }

    const summary = results.map(r => `<li style="margin-bottom:8px">${r}</li>`).join('')
    return html('✅ Meta OAuth สำเร็จ', `
      <h1>✅ เชื่อมต่อ Meta สำเร็จ</h1>
      <p>เชื่อมต่อ ${pages.length} Page กับ guild ${state.guildId} แล้ว:</p>
      <ul>${summary}</ul>
      <p><a href="/">← กลับหน้าหลัก</a></p>
    `)
  } catch (err) {
    return html('❌ OAuth ผิดพลาด', `<h1>❌ เกิดข้อผิดพลาด</h1><pre>${err.message}</pre>`)
  }
}
