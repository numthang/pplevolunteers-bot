/**
 * GET /api/threads/oauth/callback — รับ code จาก Threads แล้วเก็บ token
 *
 * code → short-lived (POST graph.threads.net/oauth/access_token)
 *      → long-lived 60 วัน (GET /access_token?grant_type=th_exchange_token)
 *
 * ⚠️ **UPDATE แถวเดิมก่อนเสมอ ถ้ามีบัญชีเดียวกันอยู่แล้ว ห้าม INSERT ซ้ำ** —
 *    `listPublishGroups` (lib/publishTargets.js:45) และ `getConfig` (services/metaApi.js:97)
 *    ยึดบัญชี **id น้อยสุด** ของกลุ่ม → แถวใหม่ id สูงกว่าจะถูกแถวเก่าที่ token ตายแล้วบังตลอด
 *    = เชื่อมใหม่สำเร็จแต่โพสต์ยังพังเหมือนเดิม (บทเรียน 2026-08-08)
 *    บัญชี Threads เดียวถูกใช้ร่วมหลายกลุ่มได้ (ตั้งใจ) → อัปเดตทุกแถวที่ social_id ตรงกัน
 */
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options.js'
import { BASE_URL } from '@/lib/baseUrl.js'
import { getThreadsApp } from '@/lib/socialAppCreds.js'
import { orgIdFromState } from '@/lib/socialOAuthScope.js'
import pool from '@/db/index.js'

const REDIRECT_URI = `${BASE_URL}/api/threads/oauth/callback`
const THREADS_API  = 'https://graph.threads.net'
const back = q => Response.redirect(`${BASE_URL}/bot/platforms?${q}`)

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code     = searchParams.get('code')
  const stateRaw = searchParams.get('state')

  if (searchParams.get('error')) return back('error=denied')
  if (!code || !stateRaw) return back('error=missing')

  let state
  try { state = JSON.parse(Buffer.from(stateRaw, 'base64url').toString()) }
  catch { return back('error=invalid') }

  if (Date.now() - state.ts > 10 * 60 * 1000) return back('error=expired')

  // state ถูกส่งกลับมาจากภายนอก — ยืนยันสิทธิ์จาก session อีกครั้ง ไม่เชื่อค่าใน state
  const session = await getServerSession(authOptions)
  if (!session) return back('error=session')

  const orgId = await orgIdFromState(state)
  if (!orgId) return back('error=no_org')

  const app = await getThreadsApp({ orgId, guildId: state.guildId || null })
  if (!app) return back('error=app_not_configured')

  try {
    // 1. code → short-lived token (endpoint นี้รับเป็น form POST เท่านั้น)
    const tokenRes = await fetch(`${THREADS_API}/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: app.app_id,
        client_secret: app.app_secret,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code,
      }),
    })
    const short = await tokenRes.json().catch(() => ({}))
    if (!short.access_token) {
      console.error('[threads oauth] code exchange failed:', short)
      return back(`error=${encodeURIComponent(short.error_message || short.error?.message || 'code_exchange')}`)
    }

    // 2. short → long-lived 60 วัน · ถ้าพังที่ขั้นนี้มักเป็นเรื่อง client_secret (Threads App Secret คนละตัวกับ FB)
    const exRes = await fetch(
      `${THREADS_API}/access_token?grant_type=th_exchange_token` +
      `&client_secret=${encodeURIComponent(app.app_secret)}&access_token=${encodeURIComponent(short.access_token)}`
    )
    const long = await exRes.json().catch(() => ({}))
    if (!long.access_token) {
      console.error('[threads oauth] long-lived exchange failed:', long)
      return back('error=threads_app_secret')
    }

    const expiresAt = new Date(Date.now() + (long.expires_in || 60 * 24 * 60 * 60) * 1000)

    // 3. บัญชีไหน
    const me = await (await fetch(
      `${THREADS_API}/v1.0/me?fields=id,username&access_token=${encodeURIComponent(long.access_token)}`
    )).json().catch(() => ({}))
    if (!me.id) return back('error=me')

    // 4. มีแถวของบัญชีนี้อยู่แล้วไหม — มี = อัปเดตทุกแถว (ห้ามสร้างใหม่ทับซ้อน)
    const upd = await pool.query(
      `UPDATE dc_social_accounts
          SET access_token = $1, user_token_expires_at = $2, name = $3
        WHERE platform = 'threads' AND social_id = $4 AND org_id = $5
        RETURNING id`,
      [long.access_token, expiresAt, me.username || 'Threads', String(me.id), orgId]
    )

    if (!upd.rows.length) {
      // บัญชีใหม่ที่ยังไม่เคยผูก — group_name ปล่อยว่างไว้ให้ไปเลือกเองในหน้า /bot/platforms
      // (แถวจะโผล่ในลิสต์บัญชี แต่ยังไม่โผล่ในกล่องเผยแพร่จนกว่าจะตั้งกลุ่ม — ตั้งใจ)
      await pool.query(
        `INSERT INTO dc_social_accounts
           (org_id, owner_user_id, guild_id, user_discord_id, name, platform, social_id, access_token, user_token_expires_at, visibility)
         VALUES ($1, $2, $3, $4, $5, 'threads', $6, $7, $8, $9)
         ON CONFLICT (COALESCE(org_id, 0), COALESCE(owner_user_id, 0), COALESCE(guild_id, ''), platform, social_id)
         DO UPDATE SET access_token = EXCLUDED.access_token,
                       user_token_expires_at = EXCLUDED.user_token_expires_at,
                       name = EXCLUDED.name`,
        [orgId,
         state.visibility === 'private' ? (session.user.userId || null) : null,
         state.guildId, session.user.discordId || null,
         me.username || 'Threads', String(me.id), long.access_token, expiresAt, state.visibility]
      )
    }

    return back(`connected=threads&account=${encodeURIComponent(me.username || 'threads')}`)
  } catch (err) {
    console.error('[threads oauth callback]', err)
    return back('error=server')
  }
}
