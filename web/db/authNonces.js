import pool from '@/db/index.js'

// nonce/challenge store keyed by user_id (แทน dc_user_config ที่ PK=discord_id) — รองรับ email-only
// payload = ข้อมูลแนบ (เช่น challenge string) · null สำหรับ login nonce
export async function putNonce(nonce, { userId = null, purpose, payload = null }) {
  await pool.query(
    `INSERT INTO auth_nonces (nonce, user_id, purpose, payload)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (nonce) DO UPDATE
       SET user_id = EXCLUDED.user_id, purpose = EXCLUDED.purpose,
           payload = EXCLUDED.payload, created_at = NOW()`,
    [nonce, userId, purpose, payload != null ? JSON.stringify(payload) : null]
  )
}

// atomic take: ลบแล้วคืน (ใช้ครั้งเดียว) ภายใน ttl · คืน { user_id, payload } หรือ null
export async function takeNonce(nonce, purpose, ttlSeconds = 120) {
  const { rows } = await pool.query(
    `DELETE FROM auth_nonces
      WHERE nonce = $1 AND purpose = $2 AND created_at > NOW() - ($3 || ' seconds')::interval
      RETURNING user_id, payload`,
    [nonce, purpose, String(ttlSeconds)]
  )
  return rows[0] || null
}
