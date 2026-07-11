import pool from '../index.js'

// public wiki ของวัตถุดิบ — ไม่มีเจ้าของ ใครก็เพิ่ม/แก้/ลบได้หมด (เคาะ 2026-07-11)
// owner column เหลือไว้เป็น "ใครเพิ่ม" เฉยๆ ไม่ได้ใช้ gate สิทธิ์อะไรแล้ว, unique เหลือแค่ (token) เดียว

export async function getIngredients() {
  const { rows } = await pool.query(
    `SELECT id, token, label, grp, tier FROM cooking_ingredients ORDER BY id`
  )
  return rows
}

// returns the inserted row, or null if token already exists (public wiki เดียว ไม่แยกต่อคน)
export async function addIngredient(addedBy, { token, label, grp, tier = 'regular' }) {
  const { rows } = await pool.query(
    `INSERT INTO cooking_ingredients (owner, token, label, grp, tier)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (token) DO NOTHING
     RETURNING id, token, label, grp, tier`,
    [addedBy, token, label, grp, tier]
  )
  return rows[0] || null
}

// ใครก็ลบได้ (public wiki)
export async function deleteIngredient(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM cooking_ingredients WHERE id = $1`,
    [id]
  )
  return rowCount > 0
}

// แก้ label/grp เท่านั้น — token คงเดิมเสมอ เพราะ cooking_pantry ผูก status ด้วย token
// (เปลี่ยน token = pantry status ของเดิมหลุด) ตรงกับ pattern เดิมที่ label ≠ token ได้อยู่แล้ว (เช่น pork/หมู)
export async function updateIngredient(id, { label, grp }) {
  const { rows } = await pool.query(
    `UPDATE cooking_ingredients SET label = $2, grp = $3
     WHERE id = $1
     RETURNING id, token, label, grp, tier`,
    [id, label, grp]
  )
  return rows[0] || null
}
