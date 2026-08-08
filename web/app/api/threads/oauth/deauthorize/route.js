/**
 * POST /api/threads/oauth/deauthorize — Meta ping มาเมื่อผู้ใช้ถอนสิทธิ์แอพจากฝั่ง Threads
 * (ช่อง "Uninstall Callback URL" ใน use case Threads API — เป็นช่องบังคับ)
 *
 * Meta ส่ง `signed_request` = base64url(signature).base64url(payload) เซ็นด้วย HMAC-SHA256 + app secret
 *
 * ⚠️ payload มี `user_id` แต่ **ยังเชื่อไม่ได้จนกว่าจะตรวจลายเซ็นผ่าน** — ที่นี่ใช้ user_id
 *    แค่เพื่อ "เลือกว่าจะเอา secret ของ org ไหนมาตรวจ" เท่านั้น ตัวตัดสินยังเป็นลายเซ็นเสมอ
 */
import crypto from 'crypto'
import pool from '@/db/index.js'
import { getSocialAppCreds } from '@/lib/socialAppCreds.js'

/** แยก signed_request → payload (คืน null ถ้าลายเซ็นไม่ผ่าน) */
function parseSignedRequest(signed, appSecret) {
  const [sigB64, payloadB64] = String(signed).split('.')
  if (!sigB64 || !payloadB64) return null

  const expected = crypto.createHmac('sha256', appSecret).update(payloadB64).digest()
  const got = Buffer.from(sigB64, 'base64url')
  // timingSafeEqual โยนถ้าความยาวไม่เท่ากัน → เช็คก่อน
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null

  try { return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) }
  catch { return null }
}

/** อ่าน user_id จาก payload แบบยังไม่เชื่อ — ใช้เลือก org ที่จะเอา secret มาตรวจเท่านั้น */
function peekUserId(signed) {
  try {
    const payloadB64 = String(signed).split('.')[1]
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()).user_id || null
  } catch { return null }
}

export async function POST(req) {
  try {
    const form = await req.formData()
    const signed = form.get('signed_request')
    if (!signed) return Response.json({ error: 'missing signed_request' }, { status: 400 })

    const userId = peekUserId(signed)
    if (!userId) return Response.json({ error: 'bad payload' }, { status: 400 })

    const { rows } = await pool.query(
      `SELECT DISTINCT org_id FROM dc_social_accounts WHERE platform = 'threads' AND social_id = $1`,
      [String(userId)]
    )
    if (!rows.length) return Response.json({ ok: true })   // ไม่รู้จักบัญชีนี้ = ไม่มีอะไรให้ถอน

    for (const { org_id } of rows) {
      const creds = await getSocialAppCreds({ orgId: org_id, keys: ['threads_app_secret'] })
      if (!creds.threads_app_secret) continue
      if (!parseSignedRequest(signed, creds.threads_app_secret)) continue   // ลายเซ็นไม่ผ่าน = ข้าม

      // ถอนสิทธิ์แล้ว token ใช้ไม่ได้อีก → ล้างทิ้ง แต่**เก็บแถวไว้** เพื่อไม่ให้ group/ตั้งค่าหาย
      // (ลบแถวจริงอยู่ที่ delete callback) · expires_at = null ทำให้หน้าเว็บขึ้นเตือนให้ Connect ใหม่
      await pool.query(
        `UPDATE dc_social_accounts SET access_token = NULL, user_token = NULL, user_token_expires_at = NULL
          WHERE platform = 'threads' AND social_id = $1 AND org_id = $2`,
        [String(userId), org_id]
      )
      console.log('[threads deauthorize] ล้าง token ของ', userId, 'org', org_id)
    }

    return Response.json({ ok: true })
  } catch (err) {
    console.error('[threads deauthorize]', err)
    return Response.json({ error: 'server' }, { status: 500 })
  }
}
