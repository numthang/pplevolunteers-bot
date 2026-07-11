import pool from '../index.js'

// ครัว = หน่วยของ pantry/history ส่วนตัว — สมาชิกทุกคนสิทธิ์เท่ากันหมด ไม่มี role/tier

export async function getMyKitchens(identity) {
  const { rows } = await pool.query(
    `SELECT k.id, k.name FROM cooking_kitchens k
     JOIN cooking_kitchen_members m ON m.kitchen_id = k.id
     WHERE m.member = $1
     ORDER BY k.id`,
    [identity]
  )
  return rows
}

// สร้างครัวใหม่ + ใส่ผู้สร้างเป็นสมาชิกทันที (atomic — กันครัวไม่มีสมาชิกเลย)
export async function createKitchen(identity, name) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `INSERT INTO cooking_kitchens (name, owner) VALUES ($1, $2) RETURNING id, name`,
      [name, identity]
    )
    const kitchen = rows[0]
    await client.query(
      `INSERT INTO cooking_kitchen_members (kitchen_id, member) VALUES ($1, $2)`,
      [kitchen.id, identity]
    )
    await client.query('COMMIT')
    return kitchen
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function isMember(kitchenId, identity) {
  if (!kitchenId || Number.isNaN(kitchenId)) return false
  const { rows } = await pool.query(
    `SELECT 1 FROM cooking_kitchen_members WHERE kitchen_id = $1 AND member = $2`,
    [kitchenId, identity]
  )
  return rows.length > 0
}

export async function getMembers(kitchenId) {
  const { rows } = await pool.query(
    `SELECT member, added_at FROM cooking_kitchen_members WHERE kitchen_id = $1 ORDER BY added_at`,
    [kitchenId]
  )
  return rows
}

// สมาชิกคนไหนก็เชิญได้ (ไม่มี role) — ON CONFLICT DO NOTHING เผื่อเชิญซ้ำ
export async function addMember(kitchenId, identity) {
  await pool.query(
    `INSERT INTO cooking_kitchen_members (kitchen_id, member) VALUES ($1, $2)
     ON CONFLICT (kitchen_id, member) DO NOTHING`,
    [kitchenId, identity]
  )
}

// กันลบสมาชิกคนสุดท้าย — ครัวต้องมีอย่างน้อย 1 คนเสมอ (caller เช็คคืนค่า false ว่ายกเลิก)
export async function removeMember(kitchenId, identity) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM cooking_kitchen_members WHERE kitchen_id = $1`,
      [kitchenId]
    )
    if (rows[0].n <= 1) {
      await client.query('ROLLBACK')
      return false
    }
    const { rowCount } = await client.query(
      `DELETE FROM cooking_kitchen_members WHERE kitchen_id = $1 AND member = $2`,
      [kitchenId, identity]
    )
    await client.query('COMMIT')
    return rowCount > 0
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export async function renameKitchen(kitchenId, name) {
  const { rows } = await pool.query(
    `UPDATE cooking_kitchens SET name = $2 WHERE id = $1 RETURNING id, name`,
    [kitchenId, name]
  )
  return rows[0] || null
}
