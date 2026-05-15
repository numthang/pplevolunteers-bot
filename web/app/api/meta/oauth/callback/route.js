import pool from '@/db/index.js'

const APP_ID       = process.env.META_APP_ID
const APP_SECRET   = process.env.META_APP_SECRET
const REDIRECT_URI = `${process.env.NEXTAUTH_URL || 'https://pplevolunteers.org'}/api/meta/oauth/callback`

async function fbGet(url) {
  const res = await fetch(url)
  return res.json()
}

async function upsert(guildId, key, value) {
  await pool.execute(
    `INSERT INTO dc_guild_config (guild_id, \`key\`, value) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value)`,
    [guildId, key, value]
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

  if (!APP_ID || !APP_SECRET) {
    return html('❌ Config ไม่ครบ', '<h1>❌ META_APP_ID / META_APP_SECRET ไม่ได้ตั้งค่าใน .env</h1>')
  }

  try {
    // 1. Exchange code → short-lived user token
    const tokenRes = await fbGet(
      `https://graph.facebook.com/v22.0/oauth/access_token` +
      `?client_id=${APP_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
      `&client_secret=${APP_SECRET}&code=${code}`
    )
    if (tokenRes.error) throw new Error(`Token exchange: ${tokenRes.error.message}`)

    // 2. Exchange short-lived → long-lived user token
    const longRes = await fbGet(
      `https://graph.facebook.com/oauth/access_token` +
      `?grant_type=fb_exchange_token&client_id=${APP_ID}` +
      `&client_secret=${APP_SECRET}&fb_exchange_token=${tokenRes.access_token}`
    )
    if (longRes.error) throw new Error(`Long-lived exchange: ${longRes.error.message}`)

    // 3. Get all page accounts + their tokens
    const accountsRes = await fbGet(
      `https://graph.facebook.com/v22.0/me/accounts` +
      `?fields=id,name,access_token&access_token=${longRes.access_token}`
    )
    if (accountsRes.error) throw new Error(`Accounts: ${accountsRes.error.message}`)

    const pages = accountsRes.data || []
    const results = []

    for (const page of pages) {
      // Get Instagram Business Account ID
      let igId = null
      const igRes = await fbGet(
        `https://graph.facebook.com/v22.0/${page.id}` +
        `?fields=instagram_business_account&access_token=${page.access_token}`
      )
      if (igRes.instagram_business_account?.id) igId = igRes.instagram_business_account.id

      // Find guilds already linked to this page
      const [rows] = await pool.execute(
        `SELECT guild_id FROM dc_guild_config WHERE \`key\` = 'meta_page_id' AND value = ?`,
        [page.id]
      )

      if (rows.length) {
        for (const row of rows) {
          await upsert(row.guild_id, 'meta_page_token', page.access_token)
          if (igId) await upsert(row.guild_id, 'meta_ig_id', igId)
          results.push(`✅ <b>${page.name}</b> → guild ${row.guild_id}${igId ? ` (IG: ${igId})` : ''}`)
        }
      } else {
        results.push(
          `⚠️ <b>${page.name}</b> (${page.id}) — ยังไม่มี guild ผูกอยู่<br>` +
          `<code style="font-size:12px">INSERT INTO dc_guild_config (guild_id, \`key\`, value) VALUES<br>` +
          `&nbsp;&nbsp;('YOUR_GUILD_ID', 'meta_page_id', '${page.id}'),<br>` +
          (igId ? `&nbsp;&nbsp;('YOUR_GUILD_ID', 'meta_ig_id', '${igId}'),<br>` : '') +
          `&nbsp;&nbsp;('YOUR_GUILD_ID', 'meta_page_token', '...')<br>` +
          `ON DUPLICATE KEY UPDATE value = VALUES(value);</code>`
        )
      }
    }

    const summary = results.map(r => `<li style="margin-bottom:8px">${r}</li>`).join('')
    return html('✅ Meta OAuth สำเร็จ', `
      <h1>✅ เชื่อมต่อ Meta สำเร็จ</h1>
      <p>พบ ${pages.length} Page — อัพเดท token ใน DB แล้ว:</p>
      <ul>${summary}</ul>
      <p><a href="/">← กลับหน้าหลัก</a></p>
    `)
  } catch (err) {
    return html('❌ OAuth ผิดพลาด', `<h1>❌ เกิดข้อผิดพลาด</h1><pre>${err.message}</pre>`)
  }
}
