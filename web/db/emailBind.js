import pool from '@/db/index.js'

// query ของ lib/emailBindLink.js (owner ผูก email ให้สมาชิก) — ย้ายมาจาก lib 2026-09-17 SQL เดิมทุกตัว

export async function insertBindNonce(token, userId, purpose, payload) {
  await pool.query(
    `INSERT INTO auth_nonces (nonce, user_id, purpose, payload) VALUES ($1, $2, $3, $4)`,
    [token, userId, purpose, JSON.stringify(payload)]
  )
}

// คืน promise ให้ผู้เรียกเลือกเองว่าจะรอหรือยิงทิ้ง
export function purgeOldBindNonces(purpose) {
  return pool.query(
    `DELETE FROM auth_nonces WHERE purpose = $1 AND created_at < NOW() - INTERVAL '1 day'`, [purpose]
  )
}

export async function getBindNonce(token, purpose) {
  const { rows } = await pool.query(
    `SELECT user_id, payload, created_at FROM auth_nonces WHERE nonce = $1 AND purpose = $2`,
    [token, purpose]
  )
  return rows[0]
}

export async function deleteNonce(token) {
  await pool.query(`DELETE FROM auth_nonces WHERE nonce = $1`, [token])
}

// โยน error ต่อ (รวม 23505 = อีเมลซ้ำ uq_users_email) ให้ผู้เรียกตัดสินเอง
export async function setUserEmail(userId, email) {
  await pool.query(`UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2`, [email, userId])
}
