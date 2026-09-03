import pool from '@/db/index.js'
import { BASE_URL } from '@/lib/baseUrl.js'
import { findUserIdByProvider } from '@/db/userIdentities.js'
import { getMetaApp } from '@/lib/socialAppCreds.js'
import { orgIdFromState } from '@/lib/socialOAuthScope.js'

const REDIRECT_URI = `${BASE_URL}/api/meta/oauth/callback`

async function fbGet(url) {
  const res = await fetch(url)
  return res.json()
}

/**
 * ดึง edge แบบ paginated ให้ครบทุกหน้า — คืน { data } หรือ { error }
 *
 * ⚠️ Graph API default `limit=25` · ไม่วน paging = แอดมินที่ถือเพจเกิน 25 จะต่อได้แค่ 25 เพจแรก
 *    **ที่เหลือหายเงียบ ไม่มี error** (เคสจริง: แอดมินกลางที่ถือเพจรายจังหวัดครบทุกจังหวัด)
 * `paging.next` ที่ Meta คืนมามี access_token + fields ครบอยู่แล้ว ยิงตรงได้เลย
 */
async function fbGetAll(url, maxPages = 20) {
  const all = []
  let next = url

  for (let i = 0; i < maxPages && next; i++) {
    const res = await fbGet(next)
    if (res.error) return res
    all.push(...(res.data || []))
    next = res.paging?.next || null
  }

  return { data: all }
}

// scope = org ที่เริ่ม OAuth (guild เป็น metadata · null ได้ถ้า org ไม่มี Discord)
// owner_user_id ตั้งเฉพาะบัญชี private (public = ของ org)
//
// ⚠️ ห้ามเอา guild_id มาเป็นเงื่อนไข "หาแถวเดิม" — หน้า /org/settings/social (org-level) ไม่ส่ง
//    guild_id มาแล้ว แต่แถวที่ต่อไว้ก่อนย้ายมา org-native มี guild_id ติดมา → คีย์ไม่ตรงกัน
//    = reconnect ได้แถวใหม่ซ้อนแถวเดิมแทนที่จะทับ แล้ว listPublishGroups หยิบ "id น้อยสุด"
//    ซึ่งเป็นแถวเก่าที่ token ตายแล้ว → กด reconnect เท่าไหร่ก็ยังโพสต์ไม่ได้
//    (เคสจริง 2026-09-02: เปลี่ยนรหัสผ่าน FB → token ตายยกชุด → reconnect แล้วยังไม่หาย)
//    ล้างแถวเก่าทิ้งก็ไม่ได้ — post_social_history อ้าง id ค้างไว้ (FK)
//
// → หาแถวเดิมด้วย (org, เจ้าของ, platform, social_id) แล้วอัดโทเคนใหม่ให้ **ทุกแถวที่ซ้ำกัน**
//   แถวซ้ำที่มีอยู่แล้วจึงไม่มีพิษ (หยิบแถวไหนก็ได้โทเคนใหม่เหมือนกัน) ไม่ต้องตามผ่าตัด DB
//   guild_id ของแถวเดิมไม่แตะ · public (owner=null) กับ private (owner=id) ยังแยกกันด้วย owner_user_id
async function upsertSocialRow(ctx, name, platform, socialId, accessToken, userToken, userTokenExpiresAt, visibility = 'public') {
  const ownerUserId = visibility === 'private' ? ctx.ownerUserId : null

  const updated = await pool.query(
    `UPDATE dc_social_accounts SET
       name = $5, access_token = $6, user_token = $7,
       user_token_expires_at = $8, visibility = $9
     WHERE COALESCE(org_id, 0) = COALESCE($1::int, 0)
       AND COALESCE(owner_user_id, 0) = COALESCE($2::int, 0)
       AND platform = $3 AND social_id = $4`,
    [ctx.orgId, ownerUserId, platform, socialId,
     name, accessToken, userToken, userTokenExpiresAt, visibility]
  )
  if (updated.rowCount) return

  // ไม่เคยต่อบัญชีนี้มาก่อน → แถวใหม่ (ON CONFLICT เหลือไว้กัน race ตอนกดพร้อมกัน 2 แท็บ)
  await pool.query(
    `INSERT INTO dc_social_accounts (org_id, owner_user_id, guild_id, user_discord_id, name, platform, social_id, access_token, user_token, user_token_expires_at, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (COALESCE(org_id, 0), COALESCE(owner_user_id, 0), COALESCE(guild_id, ''), platform, social_id) DO UPDATE SET
       name = EXCLUDED.name, access_token = EXCLUDED.access_token,
       user_token = EXCLUDED.user_token, user_token_expires_at = EXCLUDED.user_token_expires_at,
       visibility = EXCLUDED.visibility`,
    [ctx.orgId, ownerUserId, ctx.guildId, ctx.userDiscordId,
     name, platform, socialId, accessToken, userToken, userTokenExpiresAt, visibility]
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

  // creds เป็นขององค์กร (org_config) · guildId เป็น fallback ให้ state เก่าที่ยังไม่มี orgId
  const app = await getMetaApp({ orgId: state.orgId ?? null, guildId: state.guildId || null })
  if (!app) {
    return html('❌ Config ไม่ครบ', `<h1>❌ องค์กรนี้ยังไม่ได้ตั้งค่า Meta App ID / Secret — ตั้งที่ /org/settings/social</h1>`)
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
    const accountsRes = await fbGetAll(
      `https://graph.facebook.com/v22.0/me/accounts` +
      `?fields=id,name,access_token&limit=100&access_token=${longRes.access_token}`
    )
    if (accountsRes.error) throw new Error(`Accounts: ${accountsRes.error.message}`)

    const pages = accountsRes.data || []
    const results = []

    const userDiscordId = state.userId || null
    const visibility    = state.visibility || 'public'
    const orgId = await orgIdFromState(state)
    if (!orgId) throw new Error('หา org ของ OAuth flow นี้ไม่เจอ — ลองกด Connect ใหม่')
    const ctx = {
      orgId,
      ownerUserId: userDiscordId ? await findUserIdByProvider('discord', userDiscordId) : null,
      guildId:     state.guildId || null,
      userDiscordId,
    }

    // เพจที่มีคน "อ้างเป็นบัญชีส่วนตัว" ไว้แล้ว ห้ามถูกดูดเข้าองค์กรอัตโนมัติ
    //
    // ป๊อปอัปเลือกเพจของ FB เป็นการ **แทนที่** ไม่ใช่เพิ่ม → ใครมีเพจส่วนตัวต้องติ๊กเพจตัวเอง
    // ทุกครั้งที่ต่อ ไม่งั้นเพจส่วนตัวหลุดสิทธิ์ · ผลคือรอบที่กด connect "องค์กร" เพจส่วนตัว
    // ก็ไหลเข้ามาเป็นบัญชีสาธารณะขององค์กรด้วยทุกรอบ (เจอจริง 2026-09-03: #89/#90 ซ้ำกับ #85/#86)
    // อยากให้เพจส่วนตัวเป็นของ org จริงๆ → สลับ public/private ที่แถวเดิมใน /org/settings/social
    // แยก 2 กรณี: แถวส่วนตัว "ของคนที่กำลังต่ออยู่" → อัปเดตโทเคนให้ในรอบเดียวกัน (เขาเพิ่งติ๊ก
    // ให้สิทธิ์เพจนั้นมาแล้ว ไม่ควรต้องกด reconnect ซ้ำอีกรอบ) · ของ "คนอื่น" → ไม่แตะเลย
    // (โทเคนของคนอื่นต้องมาจาก OAuth ของเจ้าตัวเอง ไม่ใช่ยืมสิทธิ์ของคนที่บังเอิญเป็นแอดมินเพจเดียวกัน)
    //
    // ⚠️ ต้องกันทั้ง **สองทาง** — ไม่งั้นแค่ย้ายอาการไปอีกฝั่ง:
    //    ปุ่ม "องค์กร" ดูดเพจส่วนตัวเข้า org · ปุ่ม "ส่วนตัว" ดูดเพจ org มาเป็นของตัวเอง
    const mine = new Map()          // 'platform:social_id' → [row id] ของคนที่กำลังต่อ (แถว private)
    const othersPrivate = new Set() // แถว private ของคนอื่น — ห้ามแตะ
    const orgPublic = new Set()     // แถว public ของ org — ปุ่มส่วนตัวห้ามทำสำเนา
    {
      const { rows: existing } = await pool.query(
        `SELECT id, platform, social_id, visibility, owner_user_id, user_discord_id
           FROM dc_social_accounts
          WHERE COALESCE(org_id, 0) = COALESCE($1::int, 0)`,
        [orgId]
      )
      for (const c of existing) {
        const key = `${c.platform}:${c.social_id}`
        if (c.visibility === 'public') { orgPublic.add(key); continue }
        const isMine = (ctx.ownerUserId != null && c.owner_user_id === ctx.ownerUserId)
          || (c.owner_user_id == null && !!userDiscordId && c.user_discord_id === userDiscordId)
        if (isMine) mine.set(key, [...(mine.get(key) || []), c.id])
        else othersPrivate.add(key)
      }
    }

    // อัปเดตเฉพาะโทเคน — ห้ามแตะ visibility/owner/group_name ของแถวส่วนตัว
    async function refreshTokens(ids, accessToken, userToken, expiresAt) {
      if (!ids?.length) return
      await pool.query(
        `UPDATE dc_social_accounts
            SET access_token = $2, user_token = $3, user_token_expires_at = $4
          WHERE id = ANY($1::int[])`,
        [ids, accessToken, userToken, expiresAt]
      )
    }

    const skipped = []
    const refreshed = []

    for (const page of pages) {
      // IG row (ถ้ามี): ใช้ user_token, access_token ใส่ null
      const igRes = await fbGet(
        `https://graph.facebook.com/v22.0/${page.id}` +
        `?fields=instagram_business_account&access_token=${page.access_token}`
      )
      const igId = igRes.instagram_business_account?.id || null

      const fbKey = `fb:${page.id}`
      const igKey = igId ? `ig:${igId}` : null

      const myFbRows = mine.get(fbKey)
      const myIgRows = igKey ? mine.get(igKey) : null

      if (visibility === 'public') {
        // เพจส่วนตัวของฉันเอง → เติมโทเคนใหม่ให้แถวเดิม แล้วไม่สร้างแถวสาธารณะซ้ำ
        if (myFbRows || myIgRows) {
          await refreshTokens(myFbRows, page.access_token, null, null)
          await refreshTokens(myIgRows, null, longRes.access_token, userTokenExpiresAt)
          refreshed.push(page.name)
          continue
        }
        // ของคนอื่นที่เขาตั้งเป็นส่วนตัวไว้ → ไม่แตะ ไม่ดูดเข้า org
        if (othersPrivate.has(fbKey) || (igKey && othersPrivate.has(igKey))) {
          skipped.push(page.name)
          continue
        }
      } else {
        // ปุ่ม "ส่วนตัว": เพจที่เป็นบัญชีขององค์กรอยู่แล้ว ห้ามทำสำเนามาเป็นของตัวเอง
        // (ถ้าเป็นเพจส่วนตัวของเราด้วย ให้ตกไปเข้า upsert ปกติ = อัปเดตแถวเดิมของเรา)
        const isOrgPage = orgPublic.has(fbKey) || (igKey && orgPublic.has(igKey))
        if (isOrgPage && !myFbRows && !myIgRows) {
          skipped.push(page.name)
          continue
        }
      }

      // FB row: ใช้ page token, ไม่ต้องเก็บ user_token
      await upsertSocialRow(ctx, page.name, 'fb', page.id, page.access_token, null, null, visibility)
      if (igId) {
        await upsertSocialRow(ctx, page.name, 'ig', igId, null, longRes.access_token, userTokenExpiresAt, visibility)
      }

      results.push(`✅ <b>${page.name}</b>${igId ? ` + Instagram` : ''}`)
    }

    const summary = results.map(r => `<li style="margin-bottom:8px">${r}</li>`).join('')
    const refreshedHtml = refreshed.length
      ? `<p>🔄 ต่ออายุโทเคนให้ <b>บัญชีส่วนตัว</b> ของคุณแล้ว (${refreshed.join(', ')})
         — ไม่ได้เพิ่มซ้ำเข้าองค์กร ถ้าต้องการให้เป็นของหน่วยงานด้วย ให้สลับเป็น "สาธารณะ"
         ที่แถวเดิมใน <a href="/org/settings/social">/org/settings/social</a></p>`
      : ''
    const skippedHtml = skipped.length
      ? `<p style="color:#666">ข้าม ${skipped.length} เพจที่เป็นของอีกฝั่งอยู่แล้ว (${skipped.join(', ')})
         — ${visibility === 'public'
             ? 'คนอื่นตั้งไว้เป็นบัญชีส่วนตัว โทเคนต้องมาจากการเชื่อมต่อของเจ้าตัวเอง'
             : 'เป็นบัญชีขององค์กรอยู่แล้ว จึงไม่ทำสำเนามาเป็นบัญชีส่วนตัว'}</p>`
      : ''
    return html('✅ Meta OAuth สำเร็จ', `
      <h1>✅ เชื่อมต่อ Meta สำเร็จ</h1>
      <p>เชื่อมต่อ ${results.length} Page เข้าองค์กรแล้ว:</p>
      <ul>${summary}</ul>
      ${refreshedHtml}
      ${skippedHtml}
      <p><a href="/">← กลับหน้าหลัก</a></p>
    `)
  } catch (err) {
    return html('❌ OAuth ผิดพลาด', `<h1>❌ เกิดข้อผิดพลาด</h1><pre>${err.message}</pre>`)
  }
}
