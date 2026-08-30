import pool from '../index.js'

// org-scope: guild_id→org_id · owner_id/updated_by = users.id (INT) · updatedBy param = userId

export async function getPublicAccounts(orgId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts WHERE org_id = $1 AND visibility = 'public' AND archived = 0 ORDER BY usage_count DESC`,
    [orgId]
  )
  return rows
}

export async function getAccountsForUser(orgId, userId) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts
     WHERE org_id = $1
       AND archived = 0
       AND (owner_id = $2 OR visibility = 'public' OR visibility = 'internal')
     ORDER BY usage_count DESC, name ASC`,
    [orgId, userId]
  )
  return rows
}

export async function getAccountsAll(orgId, userId, admin = false) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts
     WHERE org_id = $3
       AND ($1 = 1 OR owner_id = $2 OR visibility != 'private')
     ORDER BY archived ASC, usage_count DESC, name ASC`,
    [admin ? 1 : 0, userId, orgId]
  )
  return rows
}

export async function archiveAccount(id, archived) {
  await pool.query(`UPDATE finance_accounts SET archived = $1 WHERE id = $2`, [archived ? 1 : 0, id])
}

// org filter บังคับใน signature — access เป็น org-wide แล้ว ถ้าดึง row ข้าม org มาเทียบ
// จะได้สิทธิ์ใน org ตัวเองไปตัดสินของ org อื่น (owner ของ org ใดก็ได้ = admin ใน org นั้น)
export async function getAccountById(orgId, id) {
  const { rows } = await pool.query(
    `SELECT * FROM finance_accounts WHERE id = $1 AND org_id = $2`,
    [id, orgId]
  )
  return rows[0] || null
}

export async function createAccount(orgId, data, updatedBy) {
  const { name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox } = data
  const cleanAccountNo = (account_no || '').replace(/-/g, '')
  const { rows } = await pool.query(
    `INSERT INTO finance_accounts
      (org_id, owner_id, name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING id`,
    [orgId, updatedBy, name, bank || null, cleanAccountNo || null,
     visibility || 'private', province || null,
     notify_income ?? 1, notify_expense ?? 1, email_inbox || null, updatedBy]
  )
  return rows[0].id
}

export async function updateAccount(id, data, updatedBy, allowOrgChange = false) {
  const { name, bank, account_no, visibility, province, notify_income, notify_expense, email_inbox, org_id } = data
  const cleanAccountNo = (account_no || '').replace(/-/g, '')

  if (allowOrgChange && org_id) {
    await pool.query(
      `UPDATE finance_accounts
       SET org_id=$1, name=$2, bank=$3, account_no=$4, visibility=$5, province=$6, notify_income=$7, notify_expense=$8,
           email_inbox=$9, updated_by=$10, updated_at=NOW()
       WHERE id=$11`,
      [org_id, name, bank || null, cleanAccountNo || null, visibility, province || null,
       notify_income, notify_expense, email_inbox || null, updatedBy, id]
    )
    await pool.query(
      `UPDATE finance_transactions SET org_id=$1 WHERE account_id=$2`,
      [org_id, id]
    )
  } else {
    await pool.query(
      `UPDATE finance_accounts
       SET name=$1, bank=$2, account_no=$3, visibility=$4, province=$5, notify_income=$6, notify_expense=$7,
           email_inbox=$8, updated_by=$9, updated_at=NOW()
       WHERE id=$10`,
      [name, bank || null, cleanAccountNo || null, visibility, province || null,
       notify_income, notify_expense, email_inbox || null, updatedBy, id]
    )
  }
}

export async function deleteAccount(id) {
  await pool.query(`DELETE FROM finance_accounts WHERE id = $1`, [id])
}

export async function incrementUsageCount(id) {
  await pool.query(`UPDATE finance_accounts SET usage_count = usage_count + 1 WHERE id = $1`, [id])
}

/**
 * "บัญชีที่ฉันใช้บ่อย" — ทางลัดบนหน้าแรก (2026-08-30)
 *
 * ⛔ **ห้ามเรียงด้วย usage_count อย่างเดียว** — คอลัมน์นั้นเป็นของทั้งองค์กร ไม่ใช่ของ user
 *    (incrementUsageCount ข้างบนบวกรวมกองเดียว ใครสร้างรายการก็บวก) → ทุกคนจะเห็นชุดเดียวกันหมด
 *    ของ "ฉัน" จริงต้องมาจาก finance_transactions.updated_by
 *
 * ⚠️ updated_by ถูกทับตอนมีคนแก้รายการ → นิยามที่ตรงความจริงคือ "บัญชีที่ฉันแตะล่าสุดบ่อยสุด"
 *    ไม่ใช่ "ที่ฉันสร้าง" · ตรงเจตนา "เข้าไปง่ายๆ" อยู่แล้ว จึงไม่ไล่แก้
 * ⚠️ คนใหม่ที่ยังไม่เคยบันทึกอะไร → ตกไปใช้ usage_count ขององค์กรแทน (ไม่ปล่อยว่าง)
 *
 * @param {function} canView  ตัวกรองสิทธิ์ — ส่ง (account) => canViewAccount(account, userId, access)
 *                            **ต้องกรองใน JS** เพราะกฎ internal ผูกกับ scopeGrants รายจังหวัด
 *                            ถ้าเขียนซ้ำเป็น SQL จะ drift จาก lib/financeAccess.js ทันทีที่กฎเปลี่ยน
 */
export async function getFavoriteAccounts(orgId, userId, { canView = () => true, limit = 3 } = {}) {
  const { rows: candidates } = await pool.query(
    `WITH mine AS (
       SELECT account_id, COUNT(*)::int AS n
         FROM finance_transactions
        WHERE org_id = $1 AND updated_by = $2
        GROUP BY account_id
     )
     SELECT a.*, COALESCE(m.n, 0) AS my_txn_count
       FROM finance_accounts a
       LEFT JOIN mine m ON m.account_id = a.id
      WHERE a.org_id = $1 AND a.archived = 0
      ORDER BY COALESCE(m.n, 0) DESC, a.usage_count DESC, a.name ASC
      LIMIT 12`,
    [orgId, userId]
  )

  // กรองสิทธิ์ก่อนคิดยอด — ไม่ต้องเสียแรง SUM บัญชีที่คนดูไม่มีสิทธิ์เห็น
  const visible = candidates.filter(canView).slice(0, limit)
  if (visible.length === 0) return []

  const { rows: balances } = await pool.query(
    `SELECT account_id,
            SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS balance
       FROM finance_transactions
      WHERE account_id = ANY($1)
      GROUP BY account_id`,
    [visible.map(a => a.id)]
  )
  const byId = new Map(balances.map(b => [Number(b.account_id), b.balance]))
  return visible.map(a => ({ ...a, balance: Number(byId.get(a.id) || 0) }))
}
