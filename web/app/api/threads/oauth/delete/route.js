/**
 * POST /api/threads/oauth/delete — Meta ping มาเมื่อผู้ใช้ขอ "ลบข้อมูลของฉัน"
 * (ช่อง "Delete Callback URL" ใน use case Threads API)
 *
 * ต่างจาก deauthorize: ถอนสิทธิ์ = แค่ token ใช้ไม่ได้ · ลบข้อมูล = ต้องเอาข้อมูลออกจริง
 *
 * ⚠️ Meta คาดหวัง response เป็น JSON `{ url, confirmation_code }` — ไม่ใช่ `{ ok: true }`
 *    `url` = หน้าที่ผู้ใช้เปิดดูสถานะการลบได้ · `confirmation_code` = รหัสอ้างอิงของคำขอนี้
 */
import crypto from 'crypto'
import pool from '@/db/index.js'
import { BASE_URL } from '@/lib/baseUrl.js'
import { getSocialAppCreds } from '@/lib/socialAppCreds.js'

function parseSignedRequest(signed, appSecret) {
  const [sigB64, payloadB64] = String(signed).split('.')
  if (!sigB64 || !payloadB64) return null

  const expected = crypto.createHmac('sha256', appSecret).update(payloadB64).digest()
  const got = Buffer.from(sigB64, 'base64url')
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null

  try { return JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) }
  catch { return null }
}

/** อ่าน user_id แบบยังไม่เชื่อ — ใช้เลือก secret ของ org ที่จะเอามาตรวจลายเซ็นเท่านั้น */
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

    // รหัสอ้างอิงคำขอ — ต้องคืนให้ Meta เสมอแม้ไม่มีข้อมูลให้ลบ (ไม่งั้น Meta ถือว่าคำขอล้ม)
    const confirmationCode = crypto.randomBytes(8).toString('hex')

    const { rows } = await pool.query(
      `SELECT DISTINCT org_id FROM dc_social_accounts WHERE platform = 'threads' AND social_id = $1`,
      [String(userId)]
    )

    for (const { org_id } of rows) {
      const creds = await getSocialAppCreds({ orgId: org_id, keys: ['threads_app_secret'] })
      if (!creds.threads_app_secret) continue
      if (!parseSignedRequest(signed, creds.threads_app_secret)) continue   // ลายเซ็นไม่ผ่าน = ข้าม

      // ลบทั้งแถว (ต่างจาก deauthorize ที่แค่ล้าง token) — คนขอลบข้อมูลแล้ว ไม่ควรเหลือ id/ชื่อไว้
      const del = await pool.query(
        `DELETE FROM dc_social_accounts WHERE platform = 'threads' AND social_id = $1 AND org_id = $2`,
        [String(userId), org_id]
      )
      console.log('[threads delete]', userId, 'org', org_id, '→ ลบ', del.rowCount, 'แถว · code', confirmationCode)
    }

    return Response.json({
      url: `${BASE_URL}/bot/platforms`,
      confirmation_code: confirmationCode,
    })
  } catch (err) {
    console.error('[threads delete]', err)
    return Response.json({ error: 'server' }, { status: 500 })
  }
}
