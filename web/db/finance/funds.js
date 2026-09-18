import pool from '../index.js'

// DATE → 'YYYY-MM-DD' ตรงๆ — ไม่มี type parser ของ DATE ถ้าปล่อยให้ pg คืน Date object แล้ว JSON แปลงเป็น UTC วันจะเลื่อนถอยไป 1 วัน
const FUND_COLS = `id, account_id, name, created_at,
  to_char(starts_at, 'YYYY-MM-DD') AS starts_at,
  to_char(ends_at,   'YYYY-MM-DD') AS ends_at`

/**
 * กองที่รายการนี้นับอยู่จริง (ใช้ทั้ง list/filter/ยอดกอง — กฎอยู่ที่นี่ที่เดียว)
 * 1) มี fund_id → กองนั้น  2) มีคนกดเลือกเองแล้ว (fund_manual) → ตามที่เลือก (NULL = ไม่ระบุ)
 * 3) เงินเข้าที่ txn_at อยู่ในช่วงของกองมีวันที่ → กองนั้น (ends_at NULL = ยังเปิดรับ)
 * txn_at เป็น timestamp ไม่มี tz เก็บเวลาไทย → เทียบกับ DATE ได้ตรงๆ
 */
export function effectiveFundSql(t = 't') {
  return `COALESCE(${t}.fund_id, CASE WHEN ${t}.type = 'income' AND NOT ${t}.fund_manual THEN (
    SELECT af.id FROM finance_funds af
     WHERE af.account_id = ${t}.account_id AND af.starts_at IS NOT NULL
       AND ${t}.txn_at >= af.starts_at
       AND (af.ends_at IS NULL OR ${t}.txn_at < af.ends_at + 1)
     ORDER BY af.starts_at DESC LIMIT 1) END)`
}

export async function getFunds(accountId) {
  const { rows } = await pool.query(
    `SELECT ${FUND_COLS} FROM finance_funds WHERE account_id = $1 ORDER BY id ASC`,
    [accountId]
  )
  return rows
}

export async function getFundById(id) {
  const { rows } = await pool.query(`SELECT ${FUND_COLS} FROM finance_funds WHERE id = $1`, [id])
  return rows[0] || null
}

/** กองมีวันที่อีกกองในบัญชีเดียวกันที่ช่วงทับ [startsAt, endsAt] — null = ไม่ทับ */
export async function findOverlappingFund(accountId, startsAt, endsAt, excludeId = null) {
  if (!startsAt) return null
  const { rows } = await pool.query(
    `SELECT id, name FROM finance_funds
      WHERE account_id = $1 AND starts_at IS NOT NULL AND id IS DISTINCT FROM $4
        AND starts_at <= COALESCE($3::date, 'infinity'::date)
        AND COALESCE(ends_at, 'infinity'::date) >= $2::date
      LIMIT 1`,
    [accountId, startsAt, endsAt || null, excludeId]
  )
  return rows[0] || null
}

export async function createFund(accountId, name, { startsAt = null, endsAt = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO finance_funds (account_id, name, starts_at, ends_at) VALUES ($1, $2, $3, $4) RETURNING id`,
    [accountId, name, startsAt || null, endsAt || null]
  )
  return rows[0].id
}

export async function updateFund(id, { name, startsAt = null, endsAt = null }) {
  await pool.query(
    `UPDATE finance_funds SET name = $2, starts_at = $3, ends_at = $4 WHERE id = $1`,
    [id, name, startsAt || null, endsAt || null]
  )
}

export async function deleteFund(id) {
  // fund_manual = false ด้วย — ไม่งั้นรายการที่เคยเลือกกองนี้จะถูกกันออกจากกองมีวันที่ไปตลอด
  await pool.query(`UPDATE finance_transactions SET fund_id = NULL, fund_manual = FALSE WHERE fund_id = $1`, [id])
  await pool.query(`DELETE FROM finance_funds WHERE id = $1`, [id])
}

export async function getFundBalances(accountId) {
  const tx = `SELECT t.type, t.amount, ${effectiveFundSql('t')} AS fid
                FROM finance_transactions t WHERE t.account_id = $1`
  const { rows: funds } = await pool.query(
    `WITH tx AS (${tx})
     SELECT
       f.id,
       f.name,
       to_char(f.starts_at, 'YYYY-MM-DD') AS starts_at,
       to_char(f.ends_at,   'YYYY-MM-DD') AS ends_at,
       SUM(CASE WHEN tx.type='income'  THEN tx.amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN tx.type='expense' THEN tx.amount ELSE 0 END) AS total_expense,
       SUM(CASE WHEN tx.type='income'  THEN tx.amount ELSE -tx.amount END) AS net,
       COUNT(tx.fid) AS count
     FROM finance_funds f
     LEFT JOIN tx ON tx.fid = f.id
     WHERE f.account_id = $1
     GROUP BY f.id, f.name, f.starts_at, f.ends_at
     ORDER BY f.id ASC`,
    [accountId]
  )
  const { rows: untaggedRows } = await pool.query(
    `WITH tx AS (${tx})
     SELECT
       SUM(CASE WHEN type='income'  THEN amount ELSE 0 END) AS total_income,
       SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) AS total_expense,
       SUM(CASE WHEN type='income'  THEN amount ELSE -amount END) AS net,
       COUNT(*) AS count
     FROM tx WHERE fid IS NULL`,
    [accountId]
  )
  return { funds, untagged: untaggedRows[0] }
}
